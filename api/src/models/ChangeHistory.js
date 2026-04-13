// ================================================================
// Model: ChangeHistory
// ================================================================
const mongoose = require('mongoose');

const changeHistorySchema = new mongoose.Schema({
  monitorId: { type: String, required: true, index: true },  // scheduleId
  url: { type: String, required: true },
  field: { type: String, required: true },
  oldValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  changeType: {
    type: String,
    enum: ['added', 'modified', 'removed'],
    default: 'modified',
  },
  detectedAt: { type: Date, default: Date.now, index: true },
  requestId: { type: String },
  notified: { type: Boolean, default: false },
}, {
  timestamps: true,
  collection: 'change_history',
});

changeHistorySchema.index({ url: 1, detectedAt: -1 });
changeHistorySchema.index({ monitorId: 1, detectedAt: -1 });

module.exports = mongoose.model('ChangeHistory', changeHistorySchema);
