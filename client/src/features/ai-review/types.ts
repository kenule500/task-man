// Shapes of the AI code review API (server/src/controllers/aiReviewController.ts).

export type AiReviewStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AiVerdict = 'match' | 'partial' | 'mismatch';
export type CriterionStatus = 'met' | 'partial' | 'missing';
export type IssueSeverity = 'high' | 'medium' | 'low';
export type IssueCategory = 'security' | 'bug' | 'quality' | 'tests' | 'performance';

export interface ReviewEvidence {
  file: string;
  note: string;
}

export interface ReviewCriterion {
  text: string;
  status: CriterionStatus;
  evidence: ReviewEvidence[];
  explanation: string;
}

export interface ReviewIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  file: string;
  line: number | null;
  message: string;
}

export interface AiReview {
  _id: string;
  task: string;
  pr: { repo: string; number: number; url: string; title: string; headSha: string };
  status: AiReviewStatus;
  verdict: AiVerdict | null;
  summary: string;
  /** 'derived': no acceptance criteria were set, the description and checklist stood in. */
  criteriaSource: 'explicit' | 'derived';
  counts: { met: number; partial: number; missing: number; issues: number };
  /** Part of the pull request was not sent to the model: the result is a partial review. */
  truncated: boolean;
  omittedFiles: string[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  error: string;
  /** Null for automatic reviews started by a GitHub event. */
  requestedBy: { _id: string; name: string } | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Only in the detail response, not in the history list. */
  criteria?: ReviewCriterion[];
  issues?: ReviewIssue[];
}

export type AiProviderId = 'qwen' | 'deepseek' | 'openai' | 'openrouter' | 'custom' | 'unknown';
export type AiConfigProblem = 'PROVIDER_UNKNOWN' | 'KEY_MISSING' | 'MODEL_MISSING' | 'BASE_URL_INVALID';

export interface AiSettings {
  /** The server resolved a usable provider (key and endpoint). */
  available: boolean;
  /** Provider configured for the whole installation. Older servers may omit it. */
  provider?: { id: AiProviderId; label: string };
  /** Why AI is unavailable, when the server can tell. */
  problem?: AiConfigProblem | null;
  /** The workspace opted in: only then does any code leave for the provider. */
  enabled: boolean;
  autoReview: boolean;
  model: string;
  dailyLimit: number;
  usedToday: number;
  /** Whether a GitHub token is saved. The token itself is never returned. */
  githubTokenSet: boolean;
  /** Project plans generated from uploaded documents have their own daily limit and size limits. */
  plan: { dailyLimit: number; usedToday: number; maxChars: number; maxBytes: number };
}

export interface AiSettingsPatch {
  enabled?: boolean;
  autoReview?: boolean;
  /** A token to save, or null to remove the saved one. */
  githubToken?: string | null;
}
