// ================================================================
// Background Service: Change Detector
// ================================================================
// Runs every 5 minutes. Compares latest scrape results for monitored
// URLs, detects field-level diffs, and triggers webhook alerts.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Redis = require('ioredis');
const crypto = require('crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapeforge';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CHECK_INTERVAL = parseInt(process.env.CHANGE_DETECT_INTERVAL || '300000', 10); // 5 min

// ── Inline schemas ──
const scheduleSchema = new mongoose.Schema({
  scheduleId: String,
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  type: String,
  config: mongoose.Schema.Types.Mixed,
  isActive: Boolean,
  changeDetection: {
    enabled: Boolean,
    fields: [String],
    alertOnChange: Boolean,
  },
  notifyWebhookUrl: String,
  notifyOn: [String],
}, { collection: 'schedules', strict: false });

const resultSchema = new mongoose.Schema({
  requestId: String,
  url: String,
  contentHash: String,
  extractedData: mongoose.Schema.Types.Mixed,
}, { collection: 'results', strict: false, timestamps: true });

const changeHistorySchema = new mongoose.Schema({
  monitorId: String,
  url: String,
  field: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  changeType: String,
  detectedAt: { type: Date, default: Date.now },
  requestId: String,
  notified: { type: Boolean, default: false },
}, { collection: 'change_history', timestamps: true });

let Schedule, Result, ChangeHistory;

async function start() {
  console.log('[ChangeDetector] Starting...');

  await mongoose.connect(MONGO_URI, { maxPoolSize: 10 });
  console.log('[ChangeDetector] MongoDB connected');

  Schedule = mongoose.model('Schedule', scheduleSchema);
  Result = mongoose.model('Result', resultSchema);
  ChangeHistory = mongoose.model('ChangeHistory', changeHistorySchema);

  const redis = new Redis({
    host: REDIS_HOST, port: REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });

  // Run immediately, then on interval
  await runDetection(redis);
  setInterval(() => runDetection(redis), CHECK_INTERVAL);
}

async function runDetection(redis) {
  const startTime = Date.now();
  console.log('[ChangeDetector] Starting detection cycle...');

  try {
    // Find all schedules with change detection enabled
    const monitors = await Schedule.find({
      isActive: true,
      'changeDetection.enabled': true,
    }).lean();

    if (monitors.length === 0) {
      console.log('[ChangeDetector] No monitors configured. Skipping.');
      return;
    }

    let changesDetected = 0;

    for (const monitor of monitors) {
      const url = monitor.config?.url;
      if (!url) continue;

      try {
        // Get the two most recent results for this URL
        const results = await Result.find({ url })
          .sort({ createdAt: -1 })
          .limit(2)
          .lean();

        if (results.length < 2) continue;

        const [latest, previous] = results;

        // Compare content hash (quick full-page change detection)
        if (latest.contentHash && previous.contentHash && latest.contentHash === previous.contentHash) {
          continue;  // No change
        }

        // Field-level comparison
        const fields = monitor.changeDetection?.fields || [];
        const latestData = latest.extractedData || {};
        const previousData = previous.extractedData || {};

        if (fields.length > 0) {
          for (const field of fields) {
            const oldVal = getNestedValue(previousData, field);
            const newVal = getNestedValue(latestData, field);

            if (!deepEqual(oldVal, newVal)) {
              const changeType = oldVal === undefined ? 'added' : newVal === undefined ? 'removed' : 'modified';

              await ChangeHistory.create({
                monitorId: monitor.scheduleId,
                url,
                field,
                oldValue: oldVal,
                newValue: newVal,
                changeType,
                requestId: latest.requestId,
              });

              changesDetected++;
              console.log(`[ChangeDetector] Change in ${url} → ${field}: ${changeType}`);
            }
          }
        } else {
          // No specific fields — compare entire extracted data
          if (!deepEqual(latestData, previousData)) {
            await ChangeHistory.create({
              monitorId: monitor.scheduleId,
              url,
              field: '*',
              oldValue: hashObject(previousData),
              newValue: hashObject(latestData),
              changeType: 'modified',
              requestId: latest.requestId,
            });

            changesDetected++;
          }
        }

        // Trigger alert if changes detected
        if (changesDetected > 0 && monitor.changeDetection?.alertOnChange) {
          await triggerAlert(monitor, url, changesDetected, redis);
        }

      } catch (err) {
        console.error(`[ChangeDetector] Error checking ${url}:`, err.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ChangeDetector] Cycle complete: ${monitors.length} monitors checked, ${changesDetected} changes detected (${duration}ms)`);

    await redis.set('change:detector:lastRun', JSON.stringify({
      monitorsChecked: monitors.length,
      changesDetected,
      durationMs: duration,
      timestamp: Date.now(),
    }));

  } catch (err) {
    console.error('[ChangeDetector] Detection cycle error:', err.message);
  }
}

async function triggerAlert(monitor, url, changeCount, redis) {
  // Publish to Redis for real-time dashboard updates
  await redis.publish('change:detected', JSON.stringify({
    scheduleId: monitor.scheduleId,
    name: monitor.name,
    url,
    changeCount,
    timestamp: Date.now(),
  }));

  // Enqueue webhook delivery if configured
  if (monitor.notifyWebhookUrl && (monitor.notifyOn || []).includes('change_detected')) {
    const { Queue } = require('bullmq');
    const webhookQueue = new Queue('webhook', {
      connection: redis,
    });

    await webhookQueue.add('webhook', {
      webhookUrl: monitor.notifyWebhookUrl,
      payload: {
        event: 'change.detected',
        scheduleId: monitor.scheduleId,
        scheduleName: monitor.name,
        url,
        changeCount,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[ChangeDetector] Alert queued for ${url} → ${monitor.notifyWebhookUrl}`);
  }
}

// ── Utilities ──

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

function hashObject(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj || {})).digest('hex');
}

process.on('SIGTERM', async () => {
  console.log('[ChangeDetector] Shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

start().catch((err) => {
  console.error('[ChangeDetector] Fatal error:', err);
  process.exit(1);
});
