// ================================================================
// Model: ProxyCheckResult
// ================================================================
const mongoose = require('mongoose');

const proxyCheckResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  proxyHost: { type: String, required: true },
  proxyPort: { type: Number },
  proxyType: { type: String, enum: ['http', 'https', 'socks4', 'socks5'], default: 'http' },
  proxyUser: { type: String },
  targetUrl: { type: String, default: 'https://httpbin.org/ip' },
  success: { type: Boolean, required: true },
  testedIp: { type: String },
  latencyMs: { type: Number },
  statusCode: { type: Number },
  error: { type: String },
}, {
  timestamps: true,
  collection: 'proxy_check_results',
});

proxyCheckResultSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ProxyCheckResult', proxyCheckResultSchema);
