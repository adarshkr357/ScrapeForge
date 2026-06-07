// ================================================================
// ScrapeForge — API Gateway Entry Point
// ================================================================
// Express.js + Socket.io + MongoDB + Redis

require('dotenv').config();
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server: SocketServer } = require('socket.io');
const winston = require('winston');

// ── Logger ──
const path = require('path');
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console — human-readable in dev, JSON in production
    new winston.transports.Console({
      format: process.env.LOG_FORMAT === 'json'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) =>
              `${timestamp} [${level}] ${message}${Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`
            )
          ),
    }),
    // File — all logs (combined)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // File — errors only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// ── Express App ──
const app = express();
const server = http.createServer(app);

// ── Socket.io ──
const io = new SocketServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
});

// Make io accessible in routes
app.set('io', io);
app.set('logger', logger);

// ── Middleware Stack ──
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || require('uuid').v4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
      requestId: req.requestId,
    });
  });
  next();
});

// ── Import Middleware ──
const { authMiddleware } = require('./middleware/auth');
const { rateLimiterMiddleware } = require('./middleware/rateLimiter');
const { auditMiddleware } = require('./middleware/audit');

// ── Import Routes ──
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const scrapeRoutes = require('./routes/scrape');
const crawlRoutes = require('./routes/crawl');
const searchRoutes = require('./routes/search');
const toolsRoutes = require('./routes/tools');
const datasetsRoutes = require('./routes/datasets');
const schedulesRoutes = require('./routes/schedules');
const webhooksRoutes = require('./routes/webhooks');
const proxyRoutes = require('./routes/proxy');
const accountRoutes = require('./routes/account');

// ── Public Routes (no auth) ──
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);

// ── Protected Routes (auth + rate limit + audit) ──
const protectedRouter = express.Router();
protectedRouter.use(authMiddleware);
protectedRouter.use(rateLimiterMiddleware);
protectedRouter.use(auditMiddleware);

protectedRouter.use('/scrape', scrapeRoutes);
protectedRouter.use('/crawl', crawlRoutes);
protectedRouter.use('/search', searchRoutes);
protectedRouter.use('/', toolsRoutes);
protectedRouter.use('/datasets', datasetsRoutes);
protectedRouter.use('/schedule', schedulesRoutes);
protectedRouter.use('/webhooks', webhooksRoutes);
protectedRouter.use('/proxy', proxyRoutes);
protectedRouter.use('/account', accountRoutes);
protectedRouter.use('/usage', accountRoutes);

app.use('/api/v1', protectedRouter);

// ── WebSocket Handler ──
const { setupWebSocket } = require('./websocket/handler');
setupWebSocket(io, logger);

// ── Serve React Dashboard (Heroku Unification) ──
const dashboardPath = path.join(__dirname, '../../dashboard/dist');
app.use(express.static(dashboardPath));

// For React Router, catch all non-API GET routes and serve index.html
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Error Handler ──
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    url: req.originalUrl,
  });
  res.status(err.status || 500).json({
    success: false,
    error: err.name || 'InternalServerError',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
  });
});

// ── Database & Server Startup ──
async function start() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapeforge';
  const PORT = parseInt(process.env.API_PORT || '3000', 10);

  try {
    // Connect MongoDB
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info(`MongoDB connected: ${MONGO_URI}`);

    // Connect Redis (via queue connection — shared)
    const { getRedisConnection } = require('./queue/connection');
    const redis = getRedisConnection();
    await redis.ping();
    logger.info(`Redis connected: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 ScrapeForge API running on port ${PORT} [${process.env.INSTANCE_ID || 'single'}]`);
    });

    // Start Queue DB Synchronization
    const { startQueueListeners } = require('./queue/listeners');
    startQueueListeners();
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// ── Graceful Shutdown ──
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);
  server.close(() => logger.info('HTTP server closed'));
  await mongoose.connection.close();
  logger.info('MongoDB disconnected');
  const { getRedisConnection } = require('./queue/connection');
  getRedisConnection().disconnect();
  logger.info('Redis disconnected');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: err?.message, stack: err?.stack });
});

start();

module.exports = { app, server, io };
