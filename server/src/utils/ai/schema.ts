import { z } from 'zod';
import {
  CRITERION_STATUSES, ISSUE_CATEGORIES, ISSUE_SEVERITIES, MAX_REVIEW_CRITERIA, MAX_REVIEW_ISSUES,
  type AiReviewVerdict, type IReviewCriterion, type IReviewIssue,
} from '../../models/aiReviewModel.js';

// Validation of the model's answer and the rules that turn it into a stored result.
// The model proposes; the server decides (statuses are checked, text of listed criteria comes from the ticket,
// evidence must point at files of the pull request, and the verdict can never be better than the evidence allows).

const text = (max: number) => z.string().transform(value => value.trim().slice(0, max));
const lowered = <T extends readonly [string, ...string[]]>(values: T) =>
  z.string().transform(value => value.trim().toLowerCase()).pipe(z.enum(values));

const lineNumber = z.union([z.number(), z.string(), z.null()]).optional().transform(value => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : null;
});

const evidenceSchema = z.object({
  file: text(300).optional().default(''),
  note: text(600).optional().default(''),
});

const criterionSchema = z.object({
  index: z.union([z.number(), z.string()]).optional().transform(value => {
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    return typeof parsed === 'number' && Number.isInteger(parsed) ? parsed : undefined;
  }),
  text: text(300).optional(),
  status: lowered(CRITERION_STATUSES),
  evidence: z.array(evidenceSchema).optional().default([]).transform(items => items.slice(0, 6)),
  explanation: text(1200).optional().default(''),
});

const issueSchema = z.object({
  severity: lowered(ISSUE_SEVERITIES),
  category: lowered(ISSUE_CATEGORIES).catch('quality'),
  file: text(300).optional().default(''),
  line: lineNumber,
  message: text(800).pipe(z.string().min(1)),
});

export const modelOutputSchema = z.object({
  verdict: lowered(['match', 'partial', 'mismatch'] as const),
  summary: text(1500).optional().default(''),
  criteria: z.array(criterionSchema).max(60).optional().default([]),
  issues: z.array(issueSchema).max(100).optional().default([]),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** Models sometimes wrap JSON in a code fence even in JSON mode. */
const stripFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
};

export type ParseOutcome = { ok: true; output: ModelOutput } | { ok: false; problem: string };

/** Parses and validates the raw answer; `problem` is short and safe to send back to the model. */
export const parseModelOutput = (raw: string): ParseOutcome => {
  let json: unknown;
  try {
    json = JSON.parse(stripFence(raw));
  } catch {
    return { ok: false, problem: 'The answer is not parseable JSON.' };
  }
  const result = modelOutputSchema.safeParse(json);
  if (result.success) return { ok: true, output: result.data };
  const problem = result.error.issues
    .slice(0, 5)
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { ok: false, problem };
};

// ----------------------------------------------------------------
// Verdict rules
// ----------------------------------------------------------------
export interface Counts {
  met: number;
  partial: number;
  missing: number;
  issues: number;
}

export const countResults = (criteria: IReviewCriterion[], issues: IReviewIssue[]): Counts => ({
  met: criteria.filter(item => item.status === 'met').length,
  partial: criteria.filter(item => item.status === 'partial').length,
  missing: criteria.filter(item => item.status === 'missing').length,
  issues: issues.length,
});

const RANK: Record<AiReviewVerdict, number> = { mismatch: 0, partial: 1, match: 2 };

/**
 * The best verdict the evidence allows:
 * - match only when every criterion is met and there is no high-severity issue;
 * - mismatch when criteria exist and none is met or partly met;
 * - partial in between.
 * The final verdict is the model's, lowered to that ceiling (never raised), and "match" additionally needs a
 * complete review: a pull request that was only partly shown is at best "partial".
 */
export const decideVerdict = (
  proposed: AiReviewVerdict,
  criteria: IReviewCriterion[],
  issues: IReviewIssue[],
  options: { truncated?: boolean } = {},
): AiReviewVerdict => {
  const hasHigh = issues.some(issue => issue.severity === 'high');
  const allMet = criteria.every(item => item.status === 'met');
  const noneMet = criteria.length > 0 && criteria.every(item => item.status === 'missing');

  let ceiling: AiReviewVerdict = 'partial';
  if (noneMet) ceiling = 'mismatch';
  else if (allMet && !hasHigh && !options.truncated) ceiling = 'match';

  return RANK[proposed] <= RANK[ceiling] ? proposed : ceiling;
};

// ----------------------------------------------------------------
// Output -> stored result
// ----------------------------------------------------------------
const ISSUE_ORDER = { high: 0, medium: 1, low: 2 } as const;

export interface FinalizeOptions {
  /** Criteria of the ticket (or checklist items standing in). Empty = the model derived its own. */
  criteria: string[];
  /** Paths of every file of the pull request; evidence and issues must point at one of them. */
  knownFiles: string[];
  truncated: boolean;
}

export interface FinalizedReview {
  verdict: AiReviewVerdict;
  summary: string;
  criteria: IReviewCriterion[];
  issues: IReviewIssue[];
}

/** Evidence paths are kept only when they are files of the pull request (a made-up path is shown without one). */
const knownPath = (file: string, known: Set<string>): string => (known.has(file) ? file : '');

export const finalizeReview = (output: ModelOutput, options: FinalizeOptions): FinalizedReview => {
  const known = new Set(options.knownFiles);
  const clean = (entry: ModelOutput['criteria'][number]): Omit<IReviewCriterion, 'text'> => ({
    status: entry.status,
    evidence: entry.evidence
      .map(item => ({ file: knownPath(item.file, known), note: item.note }))
      .filter(item => item.file || item.note),
    explanation: entry.explanation,
  });

  let criteria: IReviewCriterion[];
  if (options.criteria.length > 0) {
    // The ticket's own words, matched by index (or by position when the model sent no indexes)
    const byIndex = new Map<number, ModelOutput['criteria'][number]>();
    output.criteria.forEach((entry, position) => {
      const index = entry.index ?? position + 1;
      if (!byIndex.has(index)) byIndex.set(index, entry);
    });
    criteria = options.criteria.slice(0, MAX_REVIEW_CRITERIA).map((criterionText, position) => {
      const entry = byIndex.get(position + 1);
      return entry
        ? { text: criterionText, ...clean(entry) }
        : { text: criterionText, status: 'missing' as const, evidence: [], explanation: 'The model did not assess this criterion.' };
    });
  } else {
    criteria = output.criteria
      .filter(entry => entry.text)
      .slice(0, 8)
      .map(entry => ({ text: entry.text as string, ...clean(entry) }));
  }

  const issues: IReviewIssue[] = output.issues
    .map(issue => ({ ...issue, file: knownPath(issue.file, known) }))
    .sort((a, b) => ISSUE_ORDER[a.severity] - ISSUE_ORDER[b.severity])
    .slice(0, MAX_REVIEW_ISSUES);

  // A criterion called "met" with no pointer to the code is not proven: it counts as partial
  for (const item of criteria) {
    if (item.status === 'met' && item.evidence.length === 0) item.status = 'partial';
  }

  const verdict = decideVerdict(output.verdict, criteria, issues, { truncated: options.truncated });
  return { verdict, summary: output.summary, criteria, issues };
};
