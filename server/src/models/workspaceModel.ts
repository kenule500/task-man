import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspace extends Document {
  name: string;
  slug: string;
  owner: mongoose.Types.ObjectId;
  members: {
    user: mongoose.Types.ObjectId;
    roleId: mongoose.Types.ObjectId;
    joinedAt: Date;
  }[];
  inviteCode: string;
  // Last task number handed out (task keys like WEB-12 use it)
  taskCounter: number;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      match: /^[a-z0-9-]+$/,
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    inviteCode: { type: String, required: true, unique: true, index: true },
    taskCounter: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
export default Workspace;