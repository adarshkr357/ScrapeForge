// ================================================================
// Queue: Schedule Queue (scheduled job triggers)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const scheduleQueue = new Queue('schedule', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

module.exports = scheduleQueue;
