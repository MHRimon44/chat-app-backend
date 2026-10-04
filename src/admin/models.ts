import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface AdminAuditDocument {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  action: 'user.status_changed' | 'user.sessions_revoked' | 'user.password_reset' | 'user.deleted';
  targetUserId?: Types.ObjectId;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const adminAuditSchema = new Schema<AdminAuditDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: {
      type: String,
      enum: ['user.status_changed', 'user.sessions_revoked', 'user.password_reset', 'user.deleted'],
      required: true,
      index: true,
    },
    targetUserId: { type: Schema.Types.ObjectId, index: true },
    metadata: { type: Schema.Types.Mixed, default: {}, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
adminAuditSchema.index({ createdAt: -1, _id: -1 });

export const AdminAuditModel: Model<AdminAuditDocument> =
  (models.AdminAudit as Model<AdminAuditDocument> | undefined) ??
  model<AdminAuditDocument>('AdminAudit', adminAuditSchema);
