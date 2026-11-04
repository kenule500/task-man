import mongoose, { Document, Schema } from 'mongoose';

export const MAX_PAGE_TITLE = 120;
// Markdown source, in characters
export const MAX_PAGE_CONTENT = 100_000;
// Root = level 1; a page can sit at most this deep
export const MAX_PAGE_DEPTH = 3;
// Older versions kept per page (the oldest are pruned)
export const MAX_PAGE_VERSIONS = 20;

export interface IPage extends Document {
  workspace: mongoose.Types.ObjectId;
  // Name of the project (like task.project); '' = workspace-wide page
  project: string;
  parent: mongoose.Types.ObjectId | null;
  title: string;
  // URL-friendly, unique per workspace and project
  slug: string;
  // Markdown
  content: string;
  // Order among siblings (lower first)
  position: number;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  // Optimistic concurrency: starts at 1 and grows with every content or title save
  version: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pageSchema = new Schema<IPage>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  project: { type: String, default: '', trim: true, maxlength: 60 },
  parent: { type: Schema.Types.ObjectId, ref: 'Page', default: null },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_PAGE_TITLE },
  slug: { type: String, required: true, maxlength: 160 },
  content: { type: String, default: '', maxlength: MAX_PAGE_CONTENT },
  position: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  version: { type: Number, default: 1 },
  archived: { type: Boolean, default: false },
}, { timestamps: true });

pageSchema.index({ workspace: 1, project: 1, slug: 1 }, { unique: true });
pageSchema.index({ workspace: 1, project: 1, parent: 1, position: 1 });

const Page = mongoose.model<IPage>('Page', pageSchema);
export default Page;
