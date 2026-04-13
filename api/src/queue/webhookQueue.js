// ================================================================
// Queue: Webhook Queue (async webhook delivery)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const webhookQueue = new Queue('webhook', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
});

module.exports = webhookQueue;
