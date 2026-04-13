// ================================================================
// Model: Request
// ================================================================
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  apiKeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiKey' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  method: { type: String, default: 'GET' },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'queued',
    index: true,
  },
  creditsUsed: { type: Number, default: 0 },
  creditsEstimated: { type: Number, default: 0 },
  workerType: {
    type: String,
    enum: ['python-http', 'python-browser', 'node-browser', 'crawl', 'serp', 'nlp'],
  },
  workerId: { type: String },
  proxyUsed: {
    ip: String,
    type: String,
    country: String,
    provider: String,
  },
  stealthLevel: { type: Number, min: 0, max: 4, default: 0 },
  latencyMs: { type: Number },
  retries: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  challengeType: { type: String },
  errorMessage: { type: String },
  errorCode: { type: String },
  isBatch: { type: Boolean, default: false },
  batchId: { type: String },
  webhookUrl: { type: String },
  webhookDelivered: { type: Boolean, default: false },
  cached: { type: Boolean, default: false },
  userHidden: { type: Boolean, default: false },
  billed: { type: Boolean, default: false },
  startedAt: { type: Date },
  completedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'requests',
});

requestSchema.index({ apiKeyId: 1, createdAt: -1 });
requestSchema.index({ userId: 1, createdAt: -1 });
requestSchema.index({ url: 1, status: 1 });
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ batchId: 1, status: 1 });
requestSchema.index({ userId: 1, status: 1, createdAt: -1 });
requestSchema.index({ userId: 1, userHidden: 1, createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);
