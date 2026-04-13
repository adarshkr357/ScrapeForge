// ================================================================
// Queue: SERP Queue (Search engine scraping)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const serpQueue = new Queue('serp', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 3000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1500,
    },
  },
});

module.exports = serpQueue;
