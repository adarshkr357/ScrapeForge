// ================================================================
// WebSocket: Handler (Socket.io)
// ================================================================

/**
 * Setup WebSocket event handling.
 * Rooms: per-user, per-crawl, global worker health.
 */
function setupWebSocket(io, logger) {
  // Auth middleware for WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-me');
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`[WS] Connected: ${socket.userId} (${socket.id})`);

    // Join personal room
    socket.join(`user:${socket.userId}`);

    // Join global rooms based on role
    if (socket.userRole === 'admin') {
      socket.join('admin');
      socket.join('workers');
    }

    // ── Subscribe to crawl progress ──
    socket.on('subscribe:crawl', (crawlId) => {
      socket.join(`crawl:${crawlId}`);
      logger.info(`[WS] ${socket.userId} subscribed to crawl:${crawlId}`);
    });

    socket.on('unsubscribe:crawl', (crawlId) => {
      socket.leave(`crawl:${crawlId}`);
    });

    // ── Subscribe to request updates ──
    socket.on('subscribe:request', (requestId) => {
      socket.join(`request:${requestId}`);
    });

    // ── Request live feed ──
    socket.on('subscribe:live_feed', () => {
      socket.join(`live_feed:${socket.userId}`);
    });

    // ── Ping/Pong for connection health ──
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`[WS] Disconnected: ${socket.userId} (${reason})`);
    });
  });

  // ── Emitter functions (used by other services) ──
  return {
    /**
     * Emit request status update to the owner.
     */
    emitRequestUpdate(userId, requestId, data) {
      io.to(`user:${userId}`).to(`request:${requestId}`).emit('request:update', {
        requestId,
        ...data,
        timestamp: Date.now(),
      });
      io.to(`live_feed:${userId}`).emit('live_feed:entry', {
        requestId,
        ...data,
        timestamp: Date.now(),
      });
    },

    /**
     * Emit crawl progress.
     */
    emitCrawlProgress(crawlId, data) {
      io.to(`crawl:${crawlId}`).emit('crawl:progress', {
        crawlId,
        ...data,
        timestamp: Date.now(),
      });
    },

    /**
     * Emit worker status update (admin only).
     */
    emitWorkerStatus(workerData) {
      io.to('workers').emit('worker:status', {
        ...workerData,
        timestamp: Date.now(),
      });
    },

    /**
     * Emit usage update.
     */
    emitUsageUpdate(userId, usageData) {
      io.to(`user:${userId}`).emit('usage:update', {
        ...usageData,
        timestamp: Date.now(),
      });
    },
  };
}

module.exports = { setupWebSocket };
