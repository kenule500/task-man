import mongoose, { Document, Schema } from 'mongoose';
import { ACTIVITY_ACTIONS } from './activityModel.js';

export const MAX_WEBHOOKS_PER_WORKSPACE = 10;
export const MAX_WEBHOOK_NAME = 60;
// A webhook that failed this many deliveries in a row is switched off
export const AUTO_DISABLE_AFTER_FAILURES = 20;
export const ALL_EVENTS = '*';
export const WEBHOOK_EVENTS: readonly string[] = ACTIVITY_ACTIONS;

export interface IWebhook extends Document {
  workspace: mongoose.Types.ObjectId;
  name: string;
  url: string;
  // HMAC key ("whsec_..."); excluded from queries unless asked for with select('+secret'), shown once to the admin
  secret: string;
  // Activity actions, or ['*'] for everything
  events: string[];
  active: boolean;
  createdBy: mongoose.Types.ObjectId;
  lastDeliveryAt: Date | null;
  // Consecutive failures; reset by a success
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSchema = new Schema<IWebhook>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_WEBHOOK_NAME },
  url: { type: String, required: true, maxlength: 2000 },
  secret: { type: String, required: true, select: false },
  events: { type: [String], default: [ALL_EVENTS] },
  active: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastDeliveryAt: { type: Date, default: null },
  failureCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

webhookSchema.index({ workspace: 1, active: 1 });

const Webhook = mongoose.model<IWebhook>('Webhook', webhookSchema);
export default Webhook;
