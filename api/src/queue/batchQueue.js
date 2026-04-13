// ================================================================
// Queue: Batch Queue (up to 5,000 URLs, async)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const batchQueue = new Queue('batch', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
});

module.exports = batchQueue;
