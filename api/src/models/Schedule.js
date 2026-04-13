// ================================================================
// Model: Schedule
// ================================================================
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  scheduleId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    enum: ['scrape', 'scrape_batch', 'crawl', 'actor'],
    required: true,
  },
  config: { type: mongoose.Schema.Types.Mixed, required: true },
  cron: { type: String, required: true },  // Cron expression
  timezone: { type: String, default: 'UTC' },
  isActive: { type: Boolean, default: true },
  notifyOn: {
    type: [String],
    default: ['failure'],
    enum: ['completion', 'failure', 'change_detected'],
  },
  notifyChannels: {
    type: [String],
    default: ['webhook'],
    enum: ['webhook', 'email'],
  },
  notifyWebhookUrl: { type: String },
  notifyEmail: { type: String },
  maxRetriesPerRun: { type: Number, default: 3 },
  changeDetection: {
    enabled: { type: Boolean, default: false },
    fields: [String],
    alertOnChange: { type: Boolean, default: true },
  },
  lastRunId: { type: String },
  lastRunAt: { type: Date },
  lastRunStatus: { type: String },
  nextRun: { type: Date, index: true },
  totalRuns: { type: Number, default: 0 },
  totalSuccesses: { type: Number, default: 0 },
  totalFailures: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'schedules',
});

module.exports = mongoose.model('Schedule', scheduleSchema);
