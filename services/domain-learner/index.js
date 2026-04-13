// ================================================================
// Background Service: Domain Learner
// ================================================================
// Aggregates request outcomes every 10 minutes.
// Updates domain intelligence: difficulty scores, best stealth combos,
// anti-bot classification, and optimal proxy types.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Redis = require('ioredis');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapeforge';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const LEARN_INTERVAL = parseInt(process.env.DOMAIN_LEARN_INTERVAL || '600000', 10); // 10 min
const MIN_SAMPLE_SIZE = 5;

// ── Inline schemas (self-contained service) ──
const requestSchema = new mongoose.Schema({
  requestId: String,
  url: String,
  status: String,
  workerType: String,
  stealthLevel: Number,
  latencyMs: Number,
  challengeType: String,
  errorCode: String,
  proxyUsed: { type: String, ip: String, country: String, provider: String },
  completedAt: Date,
}, { collection: 'requests', strict: false });

const domainSchema = new mongoose.Schema({
  domain: { type: String, unique: true },
  difficultyScore: { type: Number, default: 1 },
  antiBot: { type: String, default: 'unknown' },
  requiresJS: { type: Boolean, default: false },
  avgLatencyMs: { type: Number, default: 0 },
  successRate: { type: Number, default: 1 },
  totalRequests: { type: Number, default: 0 },
  totalSuccesses: { type: Number, default: 0 },
  totalFailures: { type: Number, default: 0 },
  bestStealthLevel: { type: Number, default: 0 },
  bestProxyType: { type: String, default: 'datacenter' },
  commonChallenges: [String],
  stealthHistory: [mongoose.Schema.Types.Mixed],
  lastUpdated: Date,
}, { collection: 'domains', strict: false });

let Request, Domain;

async function start() {
  console.log('[DomainLearner] Starting...');

  await mongoose.connect(MONGO_URI, { maxPoolSize: 10 });
  console.log('[DomainLearner] MongoDB connected');

  Request = mongoose.model('Request', requestSchema);
  Domain = mongoose.model('Domain', domainSchema);

  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: process.env.REDIS_PASSWORD || undefined });

  // Run immediately, then on interval
  await runLearningCycle(redis);
  setInterval(() => runLearningCycle(redis), LEARN_INTERVAL);
}

async function runLearningCycle(redis) {
  const startTime = Date.now();
  console.log('[DomainLearner] Starting learning cycle...');

  try {
    // 1. Aggregate recent request outcomes by domain
    const since = new Date(Date.now() - LEARN_INTERVAL * 2);  // 2x interval lookback

    const domainStats = await Request.aggregate([
      { $match: { completedAt: { $gte: since }, status: { $in: ['completed', 'failed'] } } },
      {
        $addFields: {
          domain: {
            $arrayElemAt: [
              { $split: [{ $arrayElemAt: [{ $split: ['$url', '://'] }, 1] }, '/'] },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$domain',
          totalRequests: { $sum: 1 },
          successes: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          avgLatency: { $avg: '$latencyMs' },
          challenges: { $addToSet: '$challengeType' },
          workerTypes: { $addToSet: '$workerType' },
          stealthLevels: { $push: { level: '$stealthLevel', success: { $eq: ['$status', 'completed'] } } },
          proxyTypes: { $push: { type: '$proxyUsed.type', success: { $eq: ['$status', 'completed'] } } },
        },
      },
      { $match: { totalRequests: { $gte: MIN_SAMPLE_SIZE } } },
    ]);

    let updated = 0;

    for (const stat of domainStats) {
      if (!stat._id) continue;

      const domain = stat._id;
      const successRate = stat.successes / stat.totalRequests;

      // Calculate difficulty score (1-10)
      const difficultyScore = Math.max(1, Math.min(10, Math.round((1 - successRate) * 10)));

      // Determine anti-bot type from challenges
      const challenges = (stat.challenges || []).filter(c => c && c !== 'none');
      const antiBot = challenges.length > 0 ? challenges[0] : 'unknown';

      // Determine if JS is required (if browser workers succeed more)
      const browserWorkerUsed = (stat.workerTypes || []).some(w =>
        w === 'python-browser' || w === 'node-browser'
      );

      // Find best stealth level (lowest level with highest success rate)
      const stealthStats = {};
      for (const entry of (stat.stealthLevels || [])) {
        if (entry.level === undefined || entry.level === null) continue;
        if (!stealthStats[entry.level]) stealthStats[entry.level] = { total: 0, successes: 0 };
        stealthStats[entry.level].total++;
        if (entry.success) stealthStats[entry.level].successes++;
      }

      let bestStealthLevel = 0;
      let bestStealthRate = 0;
      for (const [level, stats] of Object.entries(stealthStats)) {
        const rate = stats.successes / stats.total;
        if (rate > bestStealthRate || (rate === bestStealthRate && parseInt(level) < bestStealthLevel)) {
          bestStealthLevel = parseInt(level);
          bestStealthRate = rate;
        }
      }

      // Find best proxy type
      const proxyStats = {};
      for (const entry of (stat.proxyTypes || [])) {
        if (!entry.type) continue;
        if (!proxyStats[entry.type]) proxyStats[entry.type] = { total: 0, successes: 0 };
        proxyStats[entry.type].total++;
        if (entry.success) proxyStats[entry.type].successes++;
      }

      let bestProxyType = 'datacenter';
      let bestProxyRate = 0;
      for (const [type, stats] of Object.entries(proxyStats)) {
        const rate = stats.successes / stats.total;
        if (rate > bestProxyRate) {
          bestProxyType = type;
          bestProxyRate = rate;
        }
      }

      // Upsert domain record
      await Domain.findOneAndUpdate(
        { domain },
        {
          $set: {
            difficultyScore,
            antiBot,
            requiresJS: browserWorkerUsed && difficultyScore >= 5,
            avgLatencyMs: Math.round(stat.avgLatency || 0),
            successRate,
            bestStealthLevel,
            bestProxyType,
            lastUpdated: new Date(),
          },
          $inc: {
            totalRequests: stat.totalRequests,
            totalSuccesses: stat.successes,
            totalFailures: stat.failures,
          },
          $addToSet: {
            commonChallenges: { $each: challenges },
          },
          $push: {
            stealthHistory: {
              $each: [{
                level: bestStealthLevel,
                proxyType: bestProxyType,
                successRate,
                sampleSize: stat.totalRequests,
                lastTested: new Date(),
              }],
              $slice: -20,  // Keep last 20 entries
            },
          },
        },
        { upsert: true }
      );

      // Invalidate Smart Router cache
      await redis.del(`domain:${domain}`);
      updated++;
    }

    const duration = Date.now() - startTime;
    console.log(`[DomainLearner] Cycle complete: ${updated} domains updated (${duration}ms)`);

    // Publish learning stats
    await redis.set('domain:learner:lastRun', JSON.stringify({
      domainsUpdated: updated,
      durationMs: duration,
      timestamp: Date.now(),
    }));

  } catch (err) {
    console.error('[DomainLearner] Learning cycle error:', err.message);
  }
}

process.on('SIGTERM', async () => {
  console.log('[DomainLearner] Shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

start().catch((err) => {
  console.error('[DomainLearner] Fatal error:', err);
  process.exit(1);
});
