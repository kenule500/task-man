import mongoose, { Document, Schema } from 'mongoose';
import { MAX_PAGE_CONTENT, MAX_PAGE_TITLE } from './pageModel.js';

// A snapshot of a page as it was at `version` (written when the page is edited, so the previous text is never lost)
export interface IPageVersion extends Document {
  page: mongoose.Types.ObjectId;
  workspace: mongoose.Types.ObjectId;
  version: number;
  title: string;
  content: string;
  editedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const pageVersionSchema = new Schema<IPageVersion>({
  page: { type: Schema.Types.ObjectId, ref: 'Page', required: true },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  version: { type: Number, required: true },
  title: { type: String, required: true, maxlength: MAX_PAGE_TITLE },
  content: { type: String, default: '', maxlength: MAX_PAGE_CONTENT },
  editedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });

pageVersionSchema.index({ page: 1, version: -1 }, { unique: true });

const PageVersion = mongoose.model<IPageVersion>('PageVersion', pageVersionSchema);
export default PageVersion;
