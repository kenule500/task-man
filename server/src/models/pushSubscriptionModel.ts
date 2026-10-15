import mongoose, { Document, Schema } from 'mongoose';

// A browser's Web Push endpoint for one signed-in user. An endpoint belongs to one browser profile,
// so it is unique: subscribing from another account on the same browser moves it to that account.
export const MAX_PUSH_ENDPOINT = 2048;
export const MAX_PUSH_KEY = 200;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface IPushSubscription extends Document {
  user: mongoose.Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  createdAt: Date;
  lastUsedAt: Date;
}

const keyField = {
  type: String,
  required: true,
  maxlength: MAX_PUSH_KEY,
  validate: { validator: (value: string) => BASE64URL.test(value), message: 'Invalid push key' },
};

const pushSubscriptionSchema = new Schema<IPushSubscription>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: {
    type: String,
    required: true,
    unique: true,
    maxlength: MAX_PUSH_ENDPOINT,
    validate: {
      validator: (value: string) => {
        try { return new URL(value).protocol === 'https:'; } catch { return false; }
      },
      message: 'Push endpoint must be an https URL',
    },
  },
  keys: {
    p256dh: keyField,
    auth: keyField,
  },
  userAgent: { type: String, default: '', maxlength: 300 },
  lastUsedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false } });

const PushSubscription = mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);
export default PushSubscription;
