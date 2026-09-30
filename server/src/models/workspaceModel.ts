import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspace extends Document {
  name: string;
  slug: string;
  owner: mongoose.Types.ObjectId;
  members: {
    user: mongoose.Types.ObjectId;
    role: 'owner' | 'admin' | 'member';
    joinedAt: Date;
  }[];
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema: Schema = new Schema({
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
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    joinedAt: { type: Date, default: Date.now },
  }],
  inviteCode: { type: String, required: true, unique: true, index: true },
}, {
  timestamps: true,
});

const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
export default Workspace;