// ================================================================
// Model: Entity (Knowledge Graph)
// ================================================================
const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
  entityId: { type: String, required: true, unique: true, index: true },
  type: {
    type: String,
    enum: ['person', 'organization', 'product', 'location', 'event', 'concept', 'other'],
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  aliases: [{ type: String }],
  properties: { type: mongoose.Schema.Types.Mixed, default: {} },
  sources: [{ type: String }],  // requestIds that contributed
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  mentions: { type: Number, default: 1 },
  sentiment: { type: Number, min: -1, max: 1, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'entities',
});

entitySchema.index({ name: 1, type: 1 });
entitySchema.index({ 'properties.domain': 1 });

module.exports = mongoose.model('Entity', entitySchema);
