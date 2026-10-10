import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  isVerified: boolean;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;

  // Profile fields
  avatarUrl?: string;
  bio?: string;
  jobTitle?: string;
  phone?: string;
  timezone?: string;
  language?: string;
  theme?: 'light' | 'dark' | 'system';

  // Notification preferences
  notifications: {
    email: boolean;
    taskAssigned: boolean;
    taskCompleted: boolean;
    weeklyDigest: boolean;
    push: boolean;
  };

  // System
  onboarding?: {
    role?: string;
    useCase?: string;
    teamSize?: string;
    completedAt?: Date;
  };
  workspaces: mongoose.Types.ObjectId[];
  activeWorkspace?: mongoose.Types.ObjectId;

  // Two-factor authentication (authenticator app). The secrets are encrypted and never selected by default.
  twoFactor?: {
    enabled: boolean;
    secretEncrypted?: string;
    pendingSecretEncrypted?: string;
    recoveryCodeHashes?: string[];
    enabledAt?: Date;
    /** Last accepted TOTP time step: a code is valid once */
    lastUsedStep?: number;
    failedAttempts?: number;
    lockedUntil?: Date;
  };

  matchPassword(enteredPassword: string): Promise<boolean>;
}

const userSchema: Schema = new Schema({
  // Auth
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationTokenExpires: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },

  // Profile
  avatarUrl: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 280 },
  jobTitle: { type: String, default: '', maxlength: 80 },
  phone: { type: String, default: '', maxlength: 30 },
  timezone: { type: String, default: 'UTC' },
  language: { type: String, default: 'en' },
  theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },

  // Notifications
  notifications: {
    email: { type: Boolean, default: true },
    taskAssigned: { type: Boolean, default: true },
    taskCompleted: { type: Boolean, default: false },
    weeklyDigest: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
  },

  // System
  onboarding: {
    role: { type: String },
    useCase: { type: String },
    teamSize: { type: String },
    completedAt: { type: Date },
  },
  workspaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }],
  activeWorkspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },

  // Two-factor authentication
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secretEncrypted: { type: String, select: false },
    pendingSecretEncrypted: { type: String, select: false },
    recoveryCodeHashes: { type: [String], select: false },
    enabledAt: { type: Date },
    lastUsedStep: { type: Number },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
}, {
  timestamps: true,
  // Defence in depth: serialized users never carry the password hash or token hashes
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.password;
      delete ret.verificationToken;
      delete ret.resetPasswordToken;
      // Only whether 2FA is on and since when; never secrets, hashes or counters
      const twoFactor = ret.twoFactor as { enabled?: boolean; enabledAt?: Date } | undefined;
      if (twoFactor) ret.twoFactor = { enabled: Boolean(twoFactor.enabled), enabledAt: twoFactor.enabledAt };
      return ret;
    },
  },
});

userSchema.pre('save', async function () {
  const user = this as unknown as IUser;
  if (!user.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(user.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword: string) {
  const user = await this as unknown as IUser;
  return await bcrypt.compare(enteredPassword, user.password);
};

const User = mongoose.model<IUser>('User', userSchema);
export default User;