// ================================================================
// Middleware: Auth (API Key + JWT)
// ================================================================
const jwt = require('jsonwebtoken');
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const { getRedisConnection } = require('../queue/connection');

const AUTH_CACHE_TTL = 300;  // 5 minutes

/**
 * Dual authentication middleware:
 * - X-API-Key header: For programmatic API access
 * - Authorization: Bearer <JWT>: For dashboard access
 */
async function authMiddleware(req, res, next) {
  try {
    const apiKeyHeader = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    if (apiKeyHeader) {
      return await authenticateApiKey(apiKeyHeader, req, res, next);
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return await authenticateJWT(authHeader.split(' ')[1], req, res, next);
    }

    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing authentication. Provide X-API-Key header or Bearer token.',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'AuthError',
      message: 'Authentication failed',
    });
  }
}

async function authenticateApiKey(rawKey, req, res, next) {
  const redis = getRedisConnection();
  const cacheKey = `auth:apikey:${rawKey.substring(0, 16)}`;

  // Check Redis cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    req.user = data.user;
    req.apiKey = data.apiKey;
    return next();
  }

  // Lookup in DB
  const apiKey = await ApiKey.findByKey(rawKey);
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'InvalidApiKey',
      message: 'Invalid or inactive API key',
    });
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return res.status(401).json({
      success: false,
      error: 'ExpiredApiKey',
      message: 'API key has expired',
    });
  }

  const user = await User.findById(apiKey.userId).lean();
  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'InactiveAccount',
      message: 'User account is inactive',
    });
  }

  // Update last used
  apiKey.lastUsedAt = new Date();
  await apiKey.save();

  const authData = {
    user: { _id: user._id, email: user.email, role: user.role, plan: user.plan },
    apiKey: {
      _id: apiKey._id,
      keyPrefix: apiKey.keyPrefix,
      permissions: apiKey.permissions,
      rateLimit: apiKey.rateLimit,
      credits: apiKey.credits,
      creditsUsed: apiKey.creditsUsed,
    },
  };

  // Cache in Redis
  await redis.setex(cacheKey, AUTH_CACHE_TTL, JSON.stringify(authData));

  req.user = authData.user;
  req.apiKey = authData.apiKey;
  next();
}

async function authenticateJWT(token, req, res, next) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-me');
    const user = await User.findById(decoded.userId).lean();

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'InvalidToken',
        message: 'User not found or inactive',
      });
    }

    const apiKey = await ApiKey.findOne({ userId: user._id, isActive: true }).lean();
    
    req.user = { _id: user._id, email: user.email, role: user.role, plan: user.plan };
    if (apiKey) req.apiKey = apiKey;
    req.authType = 'jwt';
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({
      success: false,
      error: 'InvalidToken',
      message,
    });
  }
}

/**
 * RBAC middleware: Restrict access to specific roles.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Requires role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

/**
 * Permission check: Verify API key has required permission.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.apiKey && !req.apiKey.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: 'InsufficientPermission',
        message: `API key lacks permission: ${permission}`,
      });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, requirePermission };
