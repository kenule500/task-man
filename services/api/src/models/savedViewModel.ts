import mongoose, { Document, Schema } from 'mongoose';
import { MAX_SAVED_VIEW_QUERY } from '../utils/savedViewQuery.js';

export const SAVED_VIEW_LAYOUTS = ['list', 'board', 'calendar', 'timeline'] as const;
export type SavedViewLayout = (typeof SAVED_VIEW_LAYOUTS)[number];

export const MAX_SAVED_VIEW_NAME = 60;
// Keeps one person's list of views (and the menu) manageable
export const MAX_SAVED_VIEWS_PER_USER = 50;

export interface ISavedView extends Document {
  workspace: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  name: string;
  // Which task view opens (list, board, ...)
  view: SavedViewLayout;
  // The filters as a URL query string, e.g. "status=pending&mine=1" (see utils/savedViewQuery.ts)
  query: string;
  // Visible to every member who can read tasks
  shared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const savedViewSchema = new Schema<ISavedView>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_SAVED_VIEW_NAME },
  view: { type: String, enum: SAVED_VIEW_LAYOUTS, default: 'list' },
  query: { type: String, default: '', maxlength: MAX_SAVED_VIEW_QUERY },
  shared: { type: Boolean, default: false },
}, { timestamps: true });

savedViewSchema.index({ workspace: 1, owner: 1, createdAt: 1 });
savedViewSchema.index({ workspace: 1, shared: 1, createdAt: 1 });

const SavedView = mongoose.model<ISavedView>('SavedView', savedViewSchema);
export default SavedView;
