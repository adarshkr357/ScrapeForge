// ================================================================
// Model: Worker
// ================================================================
const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true, index: true },
  type: {
    type: String,
    enum: ['python-http', 'python-browser', 'node-browser', 'crawl', 'serp', 'nlp'],
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['online', 'busy', 'idle', 'offline', 'draining'],
    default: 'offline',
    index: true,
  },
  hostname: { type: String },
  pid: { type: Number },
  currentTasks: { type: Number, default: 0 },
  maxConcurrency: { type: Number, default: 50 },
  totalCompleted: { type: Number, default: 0 },
  totalFailed: { type: Number, default: 0 },
  avgLatencyMs: { type: Number, default: 0 },
  errorRate: { type: Number, default: 0 },
  lastHeartbeat: { type: Date, default: Date.now },
  startedAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'workers',
});

workerSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Worker', workerSchema);
