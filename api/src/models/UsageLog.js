// ================================================================
// Model: UsageLog
// ================================================================
const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
  apiKeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiKey' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },  // YYYY-MM-DD
  creditsUsed: { type: Number, default: 0 },
  requestCount: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failCount: { type: Number, default: 0 },
  cachedCount: { type: Number, default: 0 },
  byWorkerType: {
    type: Map,
    of: { count: Number, credits: Number },
    default: {},
  },
  byEndpoint: {
    type: Map,
    of: { count: Number, credits: Number },
    default: {},
  },
}, {
  timestamps: true,
  collection: 'usage_logs',
});

usageLogSchema.index({ apiKeyId: 1, date: -1 });
usageLogSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('UsageLog', usageLogSchema);
