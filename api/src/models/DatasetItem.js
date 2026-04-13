// ================================================================
// Model: DatasetItem
// ================================================================
const mongoose = require('mongoose');

const datasetItemSchema = new mongoose.Schema({
  datasetId: { type: String, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  sourceUrl: { type: String },
  sourceRequestId: { type: String },
  order: { type: Number },
}, {
  timestamps: true,
  collection: 'dataset_items',
});

datasetItemSchema.index({ datasetId: 1, createdAt: -1 });

module.exports = mongoose.model('DatasetItem', datasetItemSchema);
