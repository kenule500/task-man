import mongoose, { Document, Schema } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  workspaceId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 280 },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false, index: true },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// System roles: unique by name only
roleSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isSystem: true } }
);

// Custom roles: unique by (workspace, name)
roleSchema.index(
  { workspaceId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isSystem: false } }
);

const Role = mongoose.model<IRole>('Role', roleSchema);
export default Role;