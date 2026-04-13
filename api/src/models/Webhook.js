// ================================================================
// Model: Webhook
// ================================================================
const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  webhookId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  url: { type: String, required: true },
  events: {
    type: [String],
    default: ['scrape.completed'],
    enum: [
      'scrape.completed', 'scrape.failed',
      'crawl.completed', 'crawl.failed', 'crawl.progress',
      'batch.completed', 'batch.failed',
      'actor.completed', 'actor.failed',
      'schedule.completed', 'schedule.failed',
      'change.detected',
    ],
  },
  secret: { type: String },  // HMAC signing secret
  headers: { type: Map, of: String, default: {} },
  isActive: { type: Boolean, default: true },
  lastDeliveredAt: { type: Date },
  lastDeliveryStatus: { type: Number },
  totalDeliveries: { type: Number, default: 0 },
  totalFailures: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'webhooks',
});

module.exports = mongoose.model('Webhook', webhookSchema);
