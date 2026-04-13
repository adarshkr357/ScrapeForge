// ================================================================
// Background Service: Scheduler
// ================================================================
// Runs every minute. Queries schedules collection for due jobs,
// enqueues them into the appropriate BullMQ queue.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Redis = require('ioredis');
const { Queue } = require('bullmq');
const cron = require('node-cron');
const { v4: uuid } = require('uuid');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapeforge';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// ── Inline schema ──
const scheduleSchema = new mongoose.Schema({
  scheduleId: { type: String, unique: true },
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  type: String,
  config: mongoose.Schema.Types.Mixed,
  cron: String,
  timezone: { type: String, default: 'UTC' },
  isActive: { type: Boolean, default: true },
  notifyOn: [String],
  notifyChannels: [String],
  notifyWebhookUrl: String,
  maxRetriesPerRun: { type: Number, default: 3 },
  changeDetection: mongoose.Schema.Types.Mixed,
  lastRunId: String,
  lastRunAt: Date,
  lastRunStatus: String,
  nextRun: Date,
  totalRuns: { type: Number, default: 0 },
  totalSuccesses: { type: Number, default: 0 },
  totalFailures: { type: Number, default: 0 },
}, { collection: 'schedules', strict: false });

let Schedule;

async function start() {
  console.log('[Scheduler] Starting...');

  await mongoose.connect(MONGO_URI, { maxPoolSize: 10 });
  console.log('[Scheduler] MongoDB connected');

  Schedule = mongoose.model('Schedule', scheduleSchema);

  const connection = new Redis({
    host: REDIS_HOST, port: REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });

  // Create queues for each job type
  const queues = {
    'scrape-python-http': new Queue('scrape-python-http', { connection }),
    'scrape-node-browser': new Queue('scrape-node-browser', { connection }),
    batch: new Queue('batch', { connection }),
    crawl: new Queue('crawl', { connection }),
    serp: new Queue('serp', { connection }),
    schedule: new Queue('schedule', { connection }),
  };

  // Check every minute
  console.log('[Scheduler] Polling every 60 seconds for due schedules...');

  const tick = async () => {
    try {
      await processSchedules(queues);
    } catch (err) {
      console.error('[Scheduler] Tick error:', err.message);
    }
  };

  // Run immediately, then every minute
  await tick();
  setInterval(tick, 60000);
}

async function processSchedules(queues) {
  const now = new Date();

  // Find all active schedules that are due
  const dueSchedules = await Schedule.find({
    isActive: true,
    $or: [
      { nextRun: { $lte: now } },
      { nextRun: null },
    ],
  }).lean();

  if (dueSchedules.length === 0) return;

  console.log(`[Scheduler] Found ${dueSchedules.length} due schedule(s)`);

  for (const schedule of dueSchedules) {
    try {
      // Validate cron expression
      if (!cron.validate(schedule.cron)) {
        console.warn(`[Scheduler] Invalid cron for ${schedule.scheduleId}: ${schedule.cron}`);
        continue;
      }

      // Check if it's actually time (using cron expression)
      const isReady = shouldRun(schedule);
      if (!isReady && schedule.nextRun) continue;

      const runId = `${schedule.type}_sched_${uuid()}`;

      // Enqueue the job based on type
      switch (schedule.type) {
        case 'scrape': {
          // Route to proper worker queue based on config
          const needsBrowser = schedule.config.render_js === true || schedule.config.js_scenario?.length > 0;
          const scrapeQueueName = needsBrowser ? 'scrape-node-browser' : 'scrape-python-http';
          await queues[scrapeQueueName].add('scrape', {
            requestId: runId,
            url: schedule.config.url,
            params: schedule.config,
            routing: { workerType: needsBrowser ? 'node-browser' : 'python-http' },
            userId: schedule.userId?.toString(),
            scheduleId: schedule.scheduleId,
            isScheduled: true,
          }, { jobId: runId });
          break;
        }

        case 'scrape_batch': {
          await queues.batch.add('batch', {
            batchId: runId,
            urls: schedule.config.urls || [],
            options: schedule.config.options || {},
            userId: schedule.userId?.toString(),
            scheduleId: schedule.scheduleId,
            isScheduled: true,
          }, { jobId: runId });
          break;
        }

        case 'crawl': {
          await queues.crawl.add('crawl', {
            crawlId: runId,
            baseUrl: schedule.config.url,
            config: schedule.config,
            userId: schedule.userId?.toString(),
            scheduleId: schedule.scheduleId,
            isScheduled: true,
          }, { jobId: runId });
          break;
        }

        case 'serp': {
          await queues.serp.add('serp', {
            requestId: runId,
            ...schedule.config,
            userId: schedule.userId?.toString(),
            scheduleId: schedule.scheduleId,
            isScheduled: true,
          }, { jobId: runId });
          break;
        }

        case 'actor': {
          await queues['scrape-python-http'].add('actor_run', {
            runId,
            actorId: schedule.config.actorId,
            input: schedule.config.input || {},
            userId: schedule.userId?.toString(),
            scheduleId: schedule.scheduleId,
            isScheduled: true,
          }, { jobId: runId });
          break;
        }

        default:
          console.warn(`[Scheduler] Unknown schedule type: ${schedule.type}`);
          continue;
      }

      // Calculate next run time
      const nextRun = getNextCronDate(schedule.cron);

      // Update schedule record
      await Schedule.findOneAndUpdate(
        { scheduleId: schedule.scheduleId },
        {
          lastRunId: runId,
          lastRunAt: now,
          lastRunStatus: 'queued',
          nextRun,
          $inc: { totalRuns: 1 },
        }
      );

      console.log(`[Scheduler] Enqueued ${schedule.type} job: ${runId} (next: ${nextRun?.toISOString()})`);

    } catch (err) {
      console.error(`[Scheduler] Failed to enqueue ${schedule.scheduleId}:`, err.message);

      await Schedule.findOneAndUpdate(
        { scheduleId: schedule.scheduleId },
        { lastRunStatus: 'error', $inc: { totalFailures: 1 } }
      );
    }
  }
}

function shouldRun(schedule) {
  // If no nextRun is set, the schedule has never run — run it now
  if (!schedule.nextRun) return true;

  return new Date() >= new Date(schedule.nextRun);
}

function getNextCronDate(cronExpression) {
  // Parse cron to calculate next execution
  // node-cron doesn't expose next date directly, so we calculate it
  try {
    const parts = cronExpression.split(' ');
    const now = new Date();

    // Simple heuristic for common patterns
    if (parts[0] === '*') {
      // Every minute
      return new Date(now.getTime() + 60000);
    }
    if (parts[1] === '*' && parts[0] !== '*') {
      // Every hour at specific minute
      const nextHour = new Date(now);
      nextHour.setMinutes(parseInt(parts[0]));
      nextHour.setSeconds(0);
      if (nextHour <= now) nextHour.setHours(nextHour.getHours() + 1);
      return nextHour;
    }

    // Default: next run in interval based on the cron
    // For production, use a cron parser library like 'cron-parser'
    const intervals = {
      '*/5': 5 * 60000,
      '*/10': 10 * 60000,
      '*/15': 15 * 60000,
      '*/30': 30 * 60000,
      '0': 60 * 60000,      // Every hour
    };

    const minutePart = parts[0];
    if (intervals[minutePart]) {
      return new Date(now.getTime() + intervals[minutePart]);
    }

    // Fallback: 1 hour
    return new Date(now.getTime() + 3600000);
  } catch {
    return new Date(Date.now() + 3600000);
  }
}

process.on('SIGTERM', async () => {
  console.log('[Scheduler] Shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

start().catch((err) => {
  console.error('[Scheduler] Fatal error:', err);
  process.exit(1);
});
