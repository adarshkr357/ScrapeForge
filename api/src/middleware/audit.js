// ================================================================
// Middleware: Audit Logging
// ================================================================
const winston = require('winston');

const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'audit' },
  transports: [
    new winston.transports.Console(),
    // In production, add file transport or external log service:
    // new winston.transports.File({ filename: 'logs/audit.log' }),
  ],
});

/**
 * Audit logging middleware — logs all authenticated API requests.
 */
function auditMiddleware(req, res, next) {
  const start = Date.now();

  // Log on response finish
  res.on('finish', () => {
    const entry = {
      event: 'api_request',
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      requestId: req.requestId,
      userId: req.user?._id?.toString(),
      apiKeyPrefix: req.apiKey?.keyPrefix,
      authType: req.authType || 'api_key',
      ip: req.headers['x-forwarded-for'] || req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Classify event type
    if (req.originalUrl.includes('/auth/')) {
      entry.event = 'auth_event';
    } else if (req.method === 'POST' && req.originalUrl.includes('/api-keys')) {
      entry.event = 'api_key_operation';
    } else if (req.method === 'DELETE') {
      entry.event = 'destructive_action';
    }

    if (res.statusCode >= 400) {
      auditLogger.warn(entry);
    } else {
      auditLogger.info(entry);
    }
  });

  next();
}

/**
 * Log a specific audit event (for use in services).
 */
function logAuditEvent(event, userId, details = {}) {
  auditLogger.info({
    event,
    userId: userId?.toString(),
    timestamp: new Date().toISOString(),
    ...details,
  });
}

module.exports = { auditMiddleware, logAuditEvent };
