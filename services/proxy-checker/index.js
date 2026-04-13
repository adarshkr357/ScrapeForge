// ================================================================
// Background Service: Proxy Checker
// ================================================================
// Runs every 5 minutes. Pings all proxies, tracks latency,
// auto-blacklists after 3 consecutive failures.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Redis = require('ioredis');
const http = require('http');
const https = require('https');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapeforge';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CHECK_INTERVAL = parseInt(process.env.PROXY_CHECK_INTERVAL || '300000', 10); // 5 min
const BATCH_SIZE = 50;
const CHECK_TIMEOUT = 10000;  // 10s
const BLACKLIST_THRESHOLD = 3;
const TEST_URL = 'https://httpbin.org/ip';

// ── Models (inline to keep this service self-contained) ──
const proxySchema = new mongoose.Schema({
  ip: String,
  port: Number,
  type: String,
  protocol: { type: String, default: 'http' },
  country: String,
  status: { type: String, default: 'healthy' },
  latencyMs: { type: Number, default: 0 },
  successRate: { type: Number, default: 1 },
  totalRequests: { type: Number, default: 0 },
  totalSuccesses: { type: Number, default: 0 },
  consecutiveFailures: { type: Number, default: 0 },
  lastChecked: Date,
  lastFailedAt: Date,
}, { collection: 'proxy_pool' });

let Proxy;

async function start() {
  console.log('[ProxyChecker] Starting...');

  await mongoose.connect(MONGO_URI, { maxPoolSize: 10 });
  console.log('[ProxyChecker] MongoDB connected');

  Proxy = mongoose.model('Proxy', proxySchema);

  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: process.env.REDIS_PASSWORD || undefined });
  await redis.ping();
  console.log('[ProxyChecker] Redis connected');

  // Run immediately, then on interval
  await runCheck(redis);
  setInterval(() => runCheck(redis), CHECK_INTERVAL);
}

async function runCheck(redis) {
  const startTime = Date.now();
  console.log(`[ProxyChecker] Starting health check cycle...`);

  const totalProxies = await Proxy.countDocuments();
  if (totalProxies === 0) {
    console.log('[ProxyChecker] No proxies in pool. Skipping.');
    return;
  }

  let checked = 0;
  let healthy = 0;
  let degraded = 0;
  let dead = 0;

  // Process in batches
  const cursor = Proxy.find({}).cursor({ batchSize: BATCH_SIZE });

  const batch = [];
  for await (const proxy of cursor) {
    batch.push(proxy);

    if (batch.length >= BATCH_SIZE) {
      const results = await checkBatch(batch);
      checked += results.checked;
      healthy += results.healthy;
      degraded += results.degraded;
      dead += results.dead;
      batch.length = 0;
    }
  }

  // Process remaining
  if (batch.length > 0) {
    const results = await checkBatch(batch);
    checked += results.checked;
    healthy += results.healthy;
    degraded += results.degraded;
    dead += results.dead;
  }

  const duration = Date.now() - startTime;

  // Publish stats to Redis for dashboard
  const stats = { checked, healthy, degraded, dead, durationMs: duration, timestamp: Date.now() };
  await redis.set('proxy:checker:lastRun', JSON.stringify(stats));
  await redis.publish('proxy:health:update', JSON.stringify(stats));

  console.log(`[ProxyChecker] Cycle complete: ${checked} checked, ${healthy} healthy, ${degraded} degraded, ${dead} dead (${duration}ms)`);
}

async function checkBatch(proxies) {
  const results = { checked: 0, healthy: 0, degraded: 0, dead: 0 };

  const checks = proxies.map(async (proxy) => {
    results.checked++;

    try {
      const startTime = Date.now();
      const success = await pingProxy(proxy);
      const latencyMs = Date.now() - startTime;

      if (success) {
        proxy.consecutiveFailures = 0;
        proxy.latencyMs = latencyMs;
        proxy.totalRequests += 1;
        proxy.totalSuccesses += 1;
        proxy.successRate = proxy.totalSuccesses / proxy.totalRequests;

        // Determine status based on latency
        if (latencyMs > 5000) {
          proxy.status = 'degraded';
          results.degraded++;
        } else {
          proxy.status = 'healthy';
          results.healthy++;
        }
      } else {
        proxy.consecutiveFailures += 1;
        proxy.totalRequests += 1;
        proxy.successRate = proxy.totalSuccesses / proxy.totalRequests;
        proxy.lastFailedAt = new Date();

        if (proxy.consecutiveFailures >= BLACKLIST_THRESHOLD) {
          proxy.status = 'dead';
          results.dead++;
        } else {
          proxy.status = 'degraded';
          results.degraded++;
        }
      }

      proxy.lastChecked = new Date();
      await proxy.save();
    } catch (err) {
      console.error(`[ProxyChecker] Error checking ${proxy.ip}:${proxy.port}:`, err.message);
    }
  });

  await Promise.allSettled(checks);
  return results;
}

async function pingProxy(proxy) {
  return new Promise((resolve) => {
    const proxyUrl = `${proxy.protocol || 'http'}://${proxy.ip}:${proxy.port}`;
    const timer = setTimeout(() => resolve(false), CHECK_TIMEOUT);

    try {
      // Simple HTTP test through the proxy
      const url = new URL(TEST_URL);
      const options = {
        hostname: proxy.ip,
        port: proxy.port,
        path: TEST_URL,
        method: 'GET',
        timeout: CHECK_TIMEOUT,
        headers: {
          'Host': url.hostname,
          'User-Agent': 'ScrapeForge-ProxyChecker/1.0',
        },
      };

      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        clearTimeout(timer);
        // Any response (even 403) means proxy is alive
        resolve(res.statusCode < 500);
        res.resume();
      });

      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      req.on('timeout', () => {
        clearTimeout(timer);
        req.destroy();
        resolve(false);
      });

      req.end();
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

// ── Graceful Shutdown ──
process.on('SIGTERM', async () => {
  console.log('[ProxyChecker] Shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

start().catch((err) => {
  console.error('[ProxyChecker] Fatal error:', err);
  process.exit(1);
});
