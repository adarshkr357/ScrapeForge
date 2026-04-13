// ================================================================
// Queue: Scrape Queue (Single URL scrape jobs)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const scrapeQueue = new Queue('scrape', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

module.exports = scrapeQueue;
