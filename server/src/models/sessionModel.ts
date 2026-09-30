import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  user: mongoose.Types.ObjectId;
  token: string;
  userAgent: string;
  ipAddress: string;
  lastLoggedIn: Date;
  isValid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema: Schema = new Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  token: { 
    type: String, 
    required: true 
  },
  userAgent: { 
    type: String, 
    required: true // e.g., "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
  },
  ipAddress: { 
    type: String, 
    required: true 
  },
  lastLoggedIn: { 
    type: Date, 
    default: Date.now 
  },
  isValid: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

const Session = mongoose.model<ISession>('Session', sessionSchema);
export default Session;