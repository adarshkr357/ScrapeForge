// ================================================================
// Model: ActorRun
// ================================================================
const mongoose = require('mongoose');

const actorRunSchema = new mongoose.Schema({
  runId: { type: String, required: true, unique: true, index: true },
  actorId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  input: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out'],
    default: 'queued',
    index: true,
  },
  output: { type: mongoose.Schema.Types.Mixed },
  datasetId: { type: String },
  creditsUsed: { type: Number, default: 0 },
  itemsScraped: { type: Number, default: 0 },
  errorMessage: { type: String },
  logs: [{
    level: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
  }],
  startedAt: { type: Date },
  completedAt: { type: Date },
  durationMs: { type: Number },
}, {
  timestamps: true,
  collection: 'actor_runs',
});

actorRunSchema.index({ actorId: 1, createdAt: -1 });
actorRunSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ActorRun', actorRunSchema);
