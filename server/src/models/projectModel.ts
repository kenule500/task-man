import mongoose, { Document, Schema } from 'mongoose';

// Palette and icon names understood by the client (folder colors and glyphs)
export const PROJECT_COLORS = ['blue', 'violet', 'rose', 'orange', 'amber', 'emerald', 'teal', 'slate'] as const;
export const PROJECT_ICONS = ['folder', 'rocket', 'code', 'megaphone', 'palette', 'bug', 'book', 'briefcase'] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type ProjectIcon = (typeof PROJECT_ICONS)[number];

export const MAX_PROJECT_NAME = 60;
export const MAX_PROJECT_DESCRIPTION = 500;

export interface IProject extends Document {
  workspace: mongoose.Types.ObjectId;
  // Tasks reference their project by this name (task.project), so renames cascade to tasks
  name: string;
  // Lower-cased name: one project per name and workspace
  nameKey: string;
  // Short code shown on task references, e.g. "WEB"
  key: string;
  description: string;
  color: ProjectColor;
  icon: ProjectIcon;
  archived: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** "Marketing Site (demo)" → "MSD"; single words use their first letters ("Website" → "WEB"). */
export const projectKeyFrom = (name: string): string => {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (words.length === 0) return 'PRJ';
  const key = words.length === 1 ? words[0].slice(0, 3) : words.map(word => word[0]).join('').slice(0, 4);
  return key.padEnd(2, 'X');
};

const projectSchema = new Schema<IProject>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_PROJECT_NAME },
  nameKey: { type: String, required: true },
  key: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9]{2,6}$/ },
  description: { type: String, default: '', trim: true, maxlength: MAX_PROJECT_DESCRIPTION },
  color: { type: String, enum: PROJECT_COLORS, default: 'blue' },
  icon: { type: String, enum: PROJECT_ICONS, default: 'folder' },
  archived: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

projectSchema.index({ workspace: 1, nameKey: 1 }, { unique: true });

projectSchema.pre('validate', function () {
  this.nameKey = (this.name ?? '').trim().toLowerCase();
  if (!this.key) this.key = projectKeyFrom(this.name ?? '');
});

const Project = mongoose.model<IProject>('Project', projectSchema);
export default Project;
