// ================================================================
// Model: Actor
// ================================================================
const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  actorId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['ecommerce', 'real_estate', 'social_media', 'news', 'jobs', 'finance', 'general', 'custom'],
    default: 'general',
  },
  inputSchema: { type: mongoose.Schema.Types.Mixed, default: {} },
  steps: [{
    action: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    order: { type: Number },
  }],
  code: { type: String },  // Custom code (for advanced actors)
  isPublic: { type: Boolean, default: false, index: true },
  isMarketplace: { type: Boolean, default: false },
  marketplaceStats: {
    runs: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },
  },
  schedule: { type: String },  // Cron expression
  computeUnitsPerRun: { type: Number, default: 10 },
  lastRunAt: { type: Date },
  totalRuns: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  tags: [{ type: String }],
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'actors',
});

actorSchema.index({ isPublic: 1, category: 1 });

module.exports = mongoose.model('Actor', actorSchema);
