// ================================================================
// Queue: Crawl Queue (site-wide crawl jobs)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const crawlQueue = new Queue('crawl', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 1000 },
    attempts: 1,  // Crawls manage their own retries internally
  },
});

module.exports = crawlQueue;
