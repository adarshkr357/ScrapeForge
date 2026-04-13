// ================================================================
// Model: Result
// ================================================================
const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  url: { type: String, required: true },
  contentHash: { type: String, index: true },
  statusCode: { type: Number },
  headers: { type: mongoose.Schema.Types.Mixed },
  rawHtml: { type: String },
  markdown: { type: String },
  text: { type: String },
  extractedData: { type: mongoose.Schema.Types.Mixed },
  aiExtracted: { type: mongoose.Schema.Types.Mixed },
  nlpExtracted: { type: mongoose.Schema.Types.Mixed },
  screenshotUrl: { type: String },
  pdfUrl: { type: String },
  links: [{ type: String }],
  outputFormat: { type: String, default: 'json' },
  formattedOutput: { type: mongoose.Schema.Types.Mixed },
  metadata: {
    title: String,
    description: String,
    language: String,
    contentLength: Number,
    loadTimeMs: Number,
  },
  cachedUntil: { type: Date, index: true },
}, {
  timestamps: true,
  collection: 'results',
});

resultSchema.index({ url: 1, contentHash: 1 });

module.exports = mongoose.model('Result', resultSchema);
