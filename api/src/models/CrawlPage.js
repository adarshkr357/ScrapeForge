// ================================================================
// Model: CrawlPage
// ================================================================
const mongoose = require('mongoose');

const crawlPageSchema = new mongoose.Schema({
  crawlId: { type: String, required: true, index: true },
  url: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'skipped'],
    default: 'pending',
    index: true,
  },
  depth: { type: Number, default: 0 },
  parentUrl: { type: String },
  title: { type: String, default: '' },
  contentPreview: { type: String, default: '' },
  contentLength: { type: Number, default: 0 },
  contentHash: { type: String, index: true },
  statusCode: { type: Number },
  extractedData: { type: mongoose.Schema.Types.Mixed },
  markdown: { type: String },
  linksFound: { type: Number, default: 0 },
  errorMessage: { type: String },
  latencyMs: { type: Number },
  processedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'crawl_pages',
});

crawlPageSchema.index({ crawlId: 1, status: 1 });
crawlPageSchema.index({ crawlId: 1, url: 1 }, { unique: true });
crawlPageSchema.index({ url: 1, contentHash: 1 });

module.exports = mongoose.model('CrawlPage', crawlPageSchema);
