import mongoose, { Document, Schema } from 'mongoose';

export const AI_REVIEW_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export const AI_REVIEW_VERDICTS = ['match', 'partial', 'mismatch'] as const;
export const CRITERION_STATUSES = ['met', 'partial', 'missing'] as const;
export const ISSUE_SEVERITIES = ['high', 'medium', 'low'] as const;
export const ISSUE_CATEGORIES = ['security', 'bug', 'quality', 'tests', 'performance'] as const;
// Explicit = the ticket's acceptance criteria; derived = the checklist / description stood in for them
export const CRITERIA_SOURCES = ['explicit', 'derived'] as const;

export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];
export type AiReviewVerdict = (typeof AI_REVIEW_VERDICTS)[number];
export type CriterionStatus = (typeof CRITERION_STATUSES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type CriteriaSource = (typeof CRITERIA_SOURCES)[number];

export const MAX_REVIEW_CRITERIA = 30;
export const MAX_REVIEW_ISSUES = 40;
export const MAX_OMITTED_FILES = 100;

export interface IReviewEvidence {
  file: string;
  note: string;
}

export interface IReviewCriterion {
  text: string;
  status: CriterionStatus;
  evidence: IReviewEvidence[];
  explanation: string;
}

export interface IReviewIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  file: string;
  line?: number | null;
  message: string;
}

export interface IAiReview extends Omit<Document, 'model'> {
  workspace: mongoose.Types.ObjectId;
  task: mongoose.Types.ObjectId;
  pr: { repo: string; number: number; url: string; title: string; headSha: string };
  status: AiReviewStatus;
  /** True while queued or running (one active review per task) */
  active: boolean;
  verdict: AiReviewVerdict | null;
  summary: string;
  criteriaSource: CriteriaSource;
  criteria: IReviewCriterion[];
  issues: IReviewIssue[];
  counts: { met: number; partial: number; missing: number; issues: number };
  // True when part of the pull request was not sent to the model (the result is a partial review)
  truncated: boolean;
  omittedFiles: string[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  error: string;
  // Null for reviews started by the GitHub webhook (auto review)
  requestedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const evidenceSchema = new Schema<IReviewEvidence>({
  file: { type: String, default: '', maxlength: 300 },
  note: { type: String, default: '', maxlength: 600 },
}, { _id: false });

const criterionSchema = new Schema<IReviewCriterion>({
  text: { type: String, required: true, maxlength: 300 },
  status: { type: String, enum: CRITERION_STATUSES, required: true },
  evidence: { type: [evidenceSchema], default: [] },
  explanation: { type: String, default: '', maxlength: 1200 },
}, { _id: false });

const issueSchema = new Schema<IReviewIssue>({
  severity: { type: String, enum: ISSUE_SEVERITIES, required: true },
  category: { type: String, enum: ISSUE_CATEGORIES, required: true },
  file: { type: String, default: '', maxlength: 300 },
  line: { type: Number, default: null },
  message: { type: String, required: true, maxlength: 800 },
}, { _id: false });

const aiReviewSchema = new Schema<IAiReview>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  pr: {
    repo: { type: String, required: true, maxlength: 201 },
    number: { type: Number, required: true },
    url: { type: String, required: true, maxlength: 500 },
    title: { type: String, default: '', maxlength: 300 },
    headSha: { type: String, default: '', maxlength: 64 },
  },
  status: { type: String, enum: AI_REVIEW_STATUSES, default: 'queued' },
  // True while queued or running; a unique partial index allows one active review per task
  active: { type: Boolean, default: true },
  verdict: { type: String, enum: [...AI_REVIEW_VERDICTS, null], default: null },
  summary: { type: String, default: '', maxlength: 2000 },
  criteriaSource: { type: String, enum: CRITERIA_SOURCES, default: 'explicit' },
  criteria: { type: [criterionSchema], default: [] },
  issues: { type: [issueSchema], default: [] },
  counts: {
    met: { type: Number, default: 0 },
    partial: { type: Number, default: 0 },
    missing: { type: Number, default: 0 },
    issues: { type: Number, default: 0 },
  },
  truncated: { type: Boolean, default: false },
  omittedFiles: { type: [String], default: [] },
  model: { type: String, default: '', maxlength: 100 },
  usage: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  error: { type: String, default: '', maxlength: 500 },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  startedAt: { type: Date },
  completedAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false } });

aiReviewSchema.index({ task: 1, createdAt: -1 });
// Two simultaneous requests cannot both start a review of the same task
aiReviewSchema.index({ task: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_review_per_task' });
// The daily limit counts a workspace's reviews since midnight UTC
aiReviewSchema.index({ workspace: 1, createdAt: -1 });

const AiReview = mongoose.model<IAiReview>('AiReview', aiReviewSchema);
export default AiReview;
