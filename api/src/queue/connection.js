// ================================================================
// Queue: Shared Redis Connection
// ================================================================
const Redis = require('ioredis');

let connection = null;

/**
 * Get or create a shared Redis connection for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null.
 */
function getRedisConnection() {
  if (!connection) {
    connection = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,  // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    connection.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    connection.on('connect', () => {
      console.log('[Redis] Connected');
    });
  }
  return connection;
}

/**
 * Get a duplicate connection (for subscribers — BullMQ workers need separate connections).
 */
function getRedisSubscriber() {
  const conn = getRedisConnection();
  return conn.duplicate();
}

module.exports = { getRedisConnection, getRedisSubscriber };
