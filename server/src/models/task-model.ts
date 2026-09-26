import mongoose, { Document, Schema } from 'mongoose';

export interface ITask extends Document {
  title: string;
  description?: string;
  deadline: Date;
  status: 'pending' | 'in-progress' | 'completed';
  owner: mongoose.Types.ObjectId; // Reference to the User (added in Step 2)
  createdBy: mongoose.Types.ObjectId; // Reference to the User (added in Step 2)
}

const taskSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  deadline: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'in-progress', 'completed'], 
    default: 'pending' 
  },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // Made false for now so we can test without auth
  createdby: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false } // Made false for now so we can test without auth
}, {
  timestamps: true
});

const Task = mongoose.model<ITask>('Task', taskSchema);
export default Task;