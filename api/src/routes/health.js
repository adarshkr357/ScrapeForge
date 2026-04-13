// ================================================================
// Route: Health Check
// ================================================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { getRedisConnection } = require('../queue/connection');

router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    instance: process.env.INSTANCE_ID || 'unknown',
    version: '1.0.0',
    services: {},
  };

  // Check MongoDB
  try {
    const mongoState = mongoose.connection.readyState;
    health.services.mongodb = mongoState === 1 ? 'connected' : 'disconnected';
  } catch {
    health.services.mongodb = 'error';
    health.status = 'degraded';
  }

  // Check Redis
  try {
    const redis = getRedisConnection();
    await redis.ping();
    health.services.redis = 'connected';
  } catch {
    health.services.redis = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
