// ================================================================
// Model: Domain (Intelligence Registry)
// ================================================================
const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true, index: true },
  difficultyScore: { type: Number, min: 1, max: 10, default: 1 },
  antiBot: {
    type: String,
    enum: [
      'none', 'cloudflare', 'cloudflare_turnstile', 'cloudflare_under_attack',
      'datadome', 'perimeterx', 'akamai', 'imperva', 'kasada',
      'shape_security', 'aws_waf', 'custom', 'unknown',
    ],
    default: 'unknown',
  },
  requiresJS: { type: Boolean, default: false },
  avgLatencyMs: { type: Number, default: 0 },
  successRate: { type: Number, min: 0, max: 1, default: 1 },
  totalRequests: { type: Number, default: 0 },
  totalSuccesses: { type: Number, default: 0 },
  totalFailures: { type: Number, default: 0 },
  bestStealthLevel: { type: Number, min: 0, max: 4, default: 0 },
  bestProxyType: {
    type: String,
    enum: ['datacenter', 'residential', 'isp', 'premium', 'mobile'],
    default: 'datacenter',
  },
  commonChallenges: [{ type: String }],
  stealthHistory: [{
    level: Number,
    proxyType: String,
    successRate: Number,
    sampleSize: Number,
    lastTested: Date,
  }],
  robotsTxt: { type: String },
  robotsTxtParsed: { type: mongoose.Schema.Types.Mixed },
  sitemaps: [{ type: String }],
  lastUpdated: { type: Date, default: Date.now },
  lastScrapedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'domains',
});

// Update success rate
domainSchema.methods.recordOutcome = function (success, latencyMs, stealthLevel, proxyType) {
  this.totalRequests += 1;
  if (success) {
    this.totalSuccesses += 1;
  } else {
    this.totalFailures += 1;
  }
  this.successRate = this.totalSuccesses / this.totalRequests;
  this.avgLatencyMs = ((this.avgLatencyMs * (this.totalRequests - 1)) + latencyMs) / this.totalRequests;
  this.lastScrapedAt = new Date();
  this.lastUpdated = new Date();

  // Update best combo if this succeeded
  if (success && (this.successRate < 0.9 || stealthLevel < this.bestStealthLevel)) {
    this.bestStealthLevel = stealthLevel;
    this.bestProxyType = proxyType;
  }
};

module.exports = mongoose.model('Domain', domainSchema);
