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

export type AiProviderId = 'qwen' | 'deepseek' | 'openai' | 'opencode' | 'custom' | 'unknown';
export type AiProviderChoice = Exclude<AiProviderId, 'unknown'>;
export type AiConfigProblem =
  | 'AI_NOT_CONFIGURED'
  | 'PROVIDER_UNKNOWN'
  | 'KEY_MISSING'
  | 'KEY_UNREADABLE'
  | 'MODEL_MISSING'
  | 'BASE_URL_INVALID'
  | 'BASE_URL_PRIVATE'
  | 'BASE_URL_UNRESOLVED';

/** Endpoint and key metadata. Only returned to members who hold settings:manage. */
export interface AiProviderConfigView {
  keySet: boolean;
  /** Last four characters, for the "a key is saved" line. Never the key. */
  keyHint: string | null;
  /** The effective endpoint (a preset URL or the custom one). */
  baseURL: string;
  configuredAt: string | null;
  configuredBy: { _id: string; name: string } | null;
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestCode: string | null;
}

export interface AiSettings {
  /** The workspace has a usable provider, endpoint, model and key. */
  available: boolean;
  /** Provider configured for this workspace. Null/absent while unconfigured. */
  provider?: { id: AiProviderId; label: string } | null;
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
  /** Manager-only metadata; absent for other members. */
  config?: AiProviderConfigView;
}

export interface AiSettingsPatch {
  enabled?: boolean;
  autoReview?: boolean;
  /** A token to save, or null to remove the saved one. */
  githubToken?: string | null;
}

/** Values of the provider form. An absent key keeps the saved one. */
export interface AiProviderInput {
  provider: AiProviderChoice;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export interface AiProviderTestResult {
  ok: boolean;
  code: string;
  testedAt: string;
}
