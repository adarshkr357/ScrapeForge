// ================================================================
// Model: Crawl
// ================================================================
const mongoose = require('mongoose');

const crawlSchema = new mongoose.Schema({
  crawlId: { type: String, required: true, unique: true, index: true },
  apiKeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiKey' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  baseUrl: { type: String, required: true },
  config: {
    maxPages: { type: Number, default: 100 },
    maxDepth: { type: Number, default: 3 },
    includePatterns: [String],
    excludePatterns: [String],
    respectRobotsTxt: { type: Boolean, default: true },
    followSitemaps: { type: Boolean, default: true },
    allowSubdomains: { type: Boolean, default: false },
    scrapeOptions: { type: mongoose.Schema.Types.Mixed, default: {} },
    adaptiveMode: {
      enabled: { type: Boolean, default: false },
      query: String,
      stopWhenSufficient: { type: Boolean, default: true },
      informationThreshold: { type: Number, default: 0.85 },
    },
    deduplication: { type: String, default: 'content_hash' },
    rateLimit: {
      requestsPerSecond: { type: Number, default: 5 },
    },
  },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled', 'paused'],
    default: 'queued',
    index: true,
  },
  pagesFound: { type: Number, default: 0 },
  pagesScraped: { type: Number, default: 0 },
  pagesFailed: { type: Number, default: 0 },
  creditsUsed: { type: Number, default: 0 },
  errorMessage: { type: String },
  webhookUrl: { type: String },
  datasetId: { type: String },
  startedAt: { type: Date },
  completedAt: { type: Date },
  estimatedCompletion: { type: Date },
}, {
  timestamps: true,
  collection: 'crawls',
});

crawlSchema.index({ apiKeyId: 1, status: 1 });
crawlSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Crawl', crawlSchema);
