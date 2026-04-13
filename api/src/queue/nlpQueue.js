// ================================================================
// Queue: NLP Queue (NLP processing jobs)
// ================================================================
const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const nlpQueue = new Queue('nlp', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
});

module.exports = nlpQueue;
