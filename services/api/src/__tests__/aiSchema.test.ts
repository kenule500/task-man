import type { IReviewCriterion, IReviewIssue } from '../models/aiReviewModel.js';
import { countResults, decideVerdict, finalizeReview, parseModelOutput } from '../utils/ai/schema.js';

const crit = (status: IReviewCriterion['status'], withEvidence = true): IReviewCriterion => ({
  text: 'c', status, evidence: withEvidence ? [{ file: 'a.ts', note: 'n' }] : [], explanation: '',
});
const issue = (severity: IReviewIssue['severity']): IReviewIssue => ({ severity, category: 'bug', file: 'a.ts', line: 1, message: 'm' });

describe('parseModelOutput', () => {
  const valid = {
    verdict: 'partial', summary: 'ok',
    criteria: [{ index: 1, status: 'met', evidence: [{ file: 'a.ts', note: 'n' }], explanation: 'e' }],
    issues: [{ severity: 'high', category: 'security', file: 'a.ts', line: 3, message: 'm' }],
  };

  it('accepts a valid answer, also inside a code fence', () => {
    expect(parseModelOutput(JSON.stringify(valid)).ok).toBe(true);
    expect(parseModelOutput('```json\n' + JSON.stringify(valid) + '\n```').ok).toBe(true);
  });

  it('normalizes case, trims text and fixes line numbers', () => {
    const result = parseModelOutput(JSON.stringify({
      verdict: ' MATCH ', summary: '  hi  ',
      criteria: [{ status: 'MET', evidence: [{ file: 'a.ts' }] }],
      issues: [{ severity: 'Low', category: 'unknown-thing', message: ' m ', line: '12' }, { severity: 'low', message: 'x', line: -4 }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.verdict).toBe('match');
    expect(result.output.summary).toBe('hi');
    expect(result.output.criteria[0].evidence[0]).toEqual({ file: 'a.ts', note: '' });
    expect(result.output.issues[0]).toMatchObject({ severity: 'low', category: 'quality', message: 'm', line: 12 });
    expect(result.output.issues[1].line).toBeNull();
  });

  it('reports a short problem for non-JSON and for the wrong shape', () => {
    expect(parseModelOutput('Sure! Here you go')).toEqual({ ok: false, problem: 'The answer is not parseable JSON.' });
    const wrong = parseModelOutput(JSON.stringify({ verdict: 'great', criteria: [{ status: 'done' }] }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.problem).toMatch(/verdict/);
    expect(parseModelOutput('[]').ok).toBe(false);
  });

  it('cuts over-long text instead of failing', () => {
    const result = parseModelOutput(JSON.stringify({ ...valid, summary: 'x'.repeat(5000) }));
    expect(result.ok && result.output.summary.length).toBe(1500);
  });
});

describe('decideVerdict', () => {
  it('is match only when every criterion is met and there is no high-severity issue', () => {
    expect(decideVerdict('match', [crit('met'), crit('met')], [issue('low')])).toBe('match');
    expect(decideVerdict('match', [crit('met'), crit('partial')], [])).toBe('partial');
    expect(decideVerdict('match', [crit('met')], [issue('high')])).toBe('partial');
  });

  it('is mismatch at most when no criterion is met or partly met', () => {
    expect(decideVerdict('partial', [crit('missing'), crit('missing', false)], [])).toBe('mismatch');
    expect(decideVerdict('match', [crit('missing')], [])).toBe('mismatch');
    expect(decideVerdict('partial', [crit('missing'), crit('partial')], [])).toBe('partial');
  });

  it('never raises the model verdict', () => {
    expect(decideVerdict('mismatch', [crit('met')], [])).toBe('mismatch');
    expect(decideVerdict('partial', [crit('met')], [])).toBe('partial');
  });

  it('cannot be match when part of the pull request was not shown', () => {
    expect(decideVerdict('match', [crit('met')], [], { truncated: true })).toBe('partial');
  });

  it('works without criteria: only the issues decide', () => {
    expect(decideVerdict('match', [], [])).toBe('match');
    expect(decideVerdict('match', [], [issue('high')])).toBe('partial');
  });
});

describe('countResults', () => {
  it('counts statuses and issues', () => {
    expect(countResults([crit('met'), crit('met'), crit('partial'), crit('missing')], [issue('low')])).toEqual({ met: 2, partial: 1, missing: 1, issues: 1 });
  });
});

describe('finalizeReview', () => {
  const output = (overrides: object) => {
    const parsed = parseModelOutput(JSON.stringify({ verdict: 'match', summary: 's', criteria: [], issues: [], ...overrides }));
    if (!parsed.ok) throw new Error(parsed.problem);
    return parsed.output;
  };

  it('uses the ticket wording for listed criteria, by index, and marks unassessed ones missing', () => {
    const result = finalizeReview(
      output({ criteria: [{ index: 2, text: 'model rewrote this', status: 'met', evidence: [{ file: 'a.ts', note: 'x' }] }] }),
      { criteria: ['first', 'second', 'third'], knownFiles: ['a.ts'], truncated: false },
    );
    expect(result.criteria.map(item => item.text)).toEqual(['first', 'second', 'third']);
    expect(result.criteria.map(item => item.status)).toEqual(['missing', 'met', 'missing']);
    expect(result.criteria[0].explanation).toMatch(/did not assess/);
    expect(result.verdict).toBe('partial');
  });

  it('matches by position when the model sent no indexes', () => {
    const result = finalizeReview(
      output({ criteria: [{ status: 'met', evidence: [{ file: 'a.ts', note: 'x' }] }, { status: 'partial' }] }),
      { criteria: ['one', 'two'], knownFiles: ['a.ts'], truncated: false },
    );
    expect(result.criteria.map(item => item.status)).toEqual(['met', 'partial']);
  });

  it('derives criteria from the model when the ticket has none, capped at 8', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ text: `derived ${index}`, status: 'partial' }));
    const result = finalizeReview(output({ criteria: [...many, { status: 'met' }] }), { criteria: [], knownFiles: [], truncated: false });
    expect(result.criteria).toHaveLength(8);
    expect(result.criteria[0].text).toBe('derived 0');
  });

  it('drops evidence paths that are not files of the pull request and demotes a met criterion without evidence', () => {
    const result = finalizeReview(
      output({
        criteria: [
          { index: 1, status: 'met', evidence: [{ file: 'made/up.ts', note: '' }] },
          { index: 2, status: 'met', evidence: [{ file: 'a.ts', note: 'ok' }] },
        ],
        issues: [{ severity: 'low', category: 'bug', file: 'nope.ts', message: 'm' }],
      }),
      { criteria: ['one', 'two'], knownFiles: ['a.ts'], truncated: false },
    );
    expect(result.criteria[0].evidence).toEqual([]);
    expect(result.criteria[0].status).toBe('partial');
    expect(result.criteria[1].status).toBe('met');
    expect(result.issues[0].file).toBe('');
  });

  it('orders issues by severity and lowers the verdict for a high-severity issue', () => {
    const result = finalizeReview(
      output({
        criteria: [{ index: 1, status: 'met', evidence: [{ file: 'a.ts', note: 'ok' }] }],
        issues: [{ severity: 'low', message: 'l' }, { severity: 'high', message: 'h' }, { severity: 'medium', message: 'm' }],
      }),
      { criteria: ['one'], knownFiles: ['a.ts'], truncated: false },
    );
    expect(result.issues.map(item => item.severity)).toEqual(['high', 'medium', 'low']);
    expect(result.verdict).toBe('partial');
  });
});
