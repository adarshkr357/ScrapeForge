// ================================================================
// Model: ApiKey
// ================================================================
const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  keyPrefix: { type: String, required: true },  // First 8 chars for display
  keyHash: { type: String, required: true },     // SHA-256 hash for lookup
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: { type: String, default: 'Default API Key' },
  permissions: {
    type: [String],
    default: ['scrape', 'crawl', 'search', 'extract', 'nlp', 'actors', 'datasets'],
  },
  rateLimit: { type: Number, default: 60 },  // requests per minute
  credits: { type: Number, default: 1000 },
  creditsUsed: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  lastUsedAt: { type: Date },
  expiresAt: { type: Date },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'api_keys',
});

// Generate a new API key
apiKeySchema.statics.generateKey = function () {
  const key = `sf_live_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = key.substring(0, 12);
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, keyPrefix, keyHash };
};

// Find by raw key
apiKeySchema.statics.findByKey = async function (rawKey) {
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  return this.findOne({ keyHash, isActive: true });
};

apiKeySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ApiKey', apiKeySchema);
