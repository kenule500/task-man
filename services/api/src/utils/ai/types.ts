import type { CriteriaSource } from '../../models/aiReviewModel.js';
import type { ModelOutput } from './schema.js';

// Shapes shared by the diff selection, the prompt builder and the model provider.

/** A changed file as the GitHub "list pull request files" endpoint returns it. */
export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff of the file. Missing for binary files and for diffs GitHub considers too large. */
  patch?: string;
  previousFilename?: string;
}

export interface PullRequestData {
  repo: string;
  number: number;
  url: string;
  title: string;
  body: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  files: PrFile[];
  /** Files GitHub reports for the pull request (can exceed the pages fetched). */
  changedFiles: number;
}

/** A file whose diff goes to the model. */
export interface SelectedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  /** Only the first part of a long diff is included. */
  partial: boolean;
}

export interface DiffSelection {
  included: SelectedFile[];
  /** Files with no textual diff (binary, or too large for GitHub to show): named, not shown. */
  withoutDiff: string[];
  /** Files (or parts) left out because of the size budget. */
  omittedFiles: string[];
  truncated: boolean;
  totalChars: number;
}

export interface ReviewTicket {
  key: string;
  title: string;
  description: string;
  /** Acceptance criteria, or the checklist items standing in for them. */
  criteria: string[];
  criteriaSource: CriteriaSource;
}

export interface ReviewModelInput {
  ticket: ReviewTicket;
  pr: { title: string; body: string; repo: string; number: number; headSha: string; baseRef: string; headRef: string };
  /** Every changed file of the pull request, for the manifest (name, status, size). */
  manifest: { filename: string; status: string; additions: number; deletions: number }[];
  selection: DiffSelection;
}

/** What the provider hands back: the model's validated answer (the service applies the verdict rules), the model used and the tokens spent. */
export interface ReviewModelResult {
  output: ModelOutput;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** An error whose message is safe to show to the person who started the review. */
export class AiReviewError extends Error {
  constructor(message: string, readonly code: string = 'AI_REVIEW_FAILED') {
    super(message);
    this.name = 'AiReviewError';
  }
}
