// ================================================================
// Model: Proxy
// ================================================================
const mongoose = require('mongoose');

const proxySchema = new mongoose.Schema({
  ip: { type: String, required: true },
  port: { type: Number, required: true },
  type: {
    type: String,
    enum: ['datacenter', 'residential', 'isp', 'premium', 'mobile'],
    required: true,
    index: true,
  },
  protocol: { type: String, enum: ['http', 'https', 'socks5'], default: 'http' },
  country: { type: String, index: true },
  state: { type: String },
  city: { type: String },
  asn: { type: String },
  provider: { type: String },
  status: {
    type: String,
    enum: ['healthy', 'degraded', 'dead', 'blacklisted'],
    default: 'healthy',
    index: true,
  },
  latencyMs: { type: Number, default: 0 },
  successRate: { type: Number, min: 0, max: 1, default: 1, index: true },
  totalRequests: { type: Number, default: 0 },
  totalSuccesses: { type: Number, default: 0 },
  consecutiveFailures: { type: Number, default: 0 },
  domainBlacklist: [{ type: String }],
  domainStats: { type: Map, of: { successRate: Number, totalUses: Number } },
  lastUsed: { type: Date },
  lastChecked: { type: Date },
  lastFailedAt: { type: Date },
  stickySessionId: { type: String },
  stickyExpiresAt: { type: Date },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'proxy_pool',
});

proxySchema.index({ type: 1, country: 1, status: 1 });
proxySchema.index({ stickySessionId: 1 });

module.exports = mongoose.model('Proxy', proxySchema);
