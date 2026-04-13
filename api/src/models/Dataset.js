// ================================================================
// Model: Dataset
// ================================================================
const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema({
  datasetId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, default: '' },
  itemCount: { type: Number, default: 0 },
  sizeBytes: { type: Number, default: 0 },
  format: { type: String, default: 'json' },
  sourceType: {
    type: String,
    enum: ['scrape', 'crawl', 'actor', 'batch', 'manual'],
    default: 'scrape',
  },
  sourceId: { type: String },  // requestId, crawlId, or actorRunId
  tags: [{ type: String }],
  isPublic: { type: Boolean, default: false },
  expiresAt: { type: Date },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'datasets',
});

module.exports = mongoose.model('Dataset', datasetSchema);
