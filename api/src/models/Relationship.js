// ================================================================
// Model: Relationship (Knowledge Graph)
// ================================================================
const mongoose = require('mongoose');

const relationshipSchema = new mongoose.Schema({
  subjectId: { type: String, required: true, index: true },
  predicate: { type: String, required: true },
  objectId: { type: String, required: true, index: true },
  sources: [{ type: String }],
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'relationships',
});

relationshipSchema.index({ subjectId: 1, predicate: 1 });
relationshipSchema.index({ objectId: 1, predicate: 1 });

module.exports = mongoose.model('Relationship', relationshipSchema);
