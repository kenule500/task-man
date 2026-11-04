import mongoose, { Document, Schema } from 'mongoose';

export const DELIVERY_RETENTION_DAYS = 14;
export const MAX_DELIVERY_BODY = 8 * 1024;
export const MAX_DELIVERY_ERROR = 300;

export interface IWebhookDelivery extends Document {
  webhook: mongoose.Types.ObjectId;
  workspace: mongoose.Types.ObjectId;
  event: string;
  // Sent as X-TaskMan-Delivery and as `id` in the body, so receivers can ignore repeats
  deliveryId: string;
  status: 'success' | 'failed';
  attempt: number;
  responseStatus: number | null;
  durationMs: number;
  error: string;
  // The JSON that was sent (no secrets), kept so a delivery can be sent again
  requestBody: string;
  createdAt: Date;
}

const deliverySchema = new Schema<IWebhookDelivery>({
  webhook: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  event: { type: String, required: true, maxlength: 60 },
  deliveryId: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  attempt: { type: Number, default: 1, min: 1 },
  responseStatus: { type: Number, default: null },
  durationMs: { type: Number, default: 0, min: 0 },
  error: { type: String, default: '', maxlength: MAX_DELIVERY_ERROR },
  requestBody: { type: String, default: '', maxlength: MAX_DELIVERY_BODY },
}, { timestamps: { createdAt: true, updatedAt: false } });

deliverySchema.index({ webhook: 1, createdAt: -1 });
deliverySchema.index({ webhook: 1, deliveryId: 1 });
deliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: DELIVERY_RETENTION_DAYS * 24 * 60 * 60 });

const WebhookDelivery = mongoose.model<IWebhookDelivery>('WebhookDelivery', deliverySchema);
export default WebhookDelivery;
