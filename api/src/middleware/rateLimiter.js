// ================================================================
// Middleware: Rate Limiter (Per-Key, Redis-backed)
// ================================================================
const { getRedisConnection } = require('../queue/connection');

const PLAN_LIMITS = {
  free:       { rpm: 10,   rpd: 500 },
  pro:        { rpm: 100,  rpd: 10000 },
  enterprise: { rpm: 1000, rpd: 100000 },
};

/**
 * Sliding window rate limiter using Redis.
 * Checks both per-minute and per-day limits.
 */
async function rateLimiterMiddleware(req, res, next) {
  try {
    const redis = getRedisConnection();
    const identifier = req.apiKey ? req.apiKey._id.toString() : req.user?._id?.toString();

    if (!identifier) return next();  // No auth context, skip

    const plan = req.user?.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const customLimit = req.apiKey?.rateLimit;

    const rpm = customLimit || limits.rpm;
    const rpd = limits.rpd;

    const now = Date.now();
    const minuteKey = `rl:min:${identifier}`;
    const dayKey = `rl:day:${identifier}:${new Date().toISOString().slice(0, 10)}`;

    // Lua script for atomic sliding window check + increment
    const luaScript = `
      local minuteKey = KEYS[1]
      local dayKey = KEYS[2]
      local now = tonumber(ARGV[1])
      local rpm = tonumber(ARGV[2])
      local rpd = tonumber(ARGV[3])
      local windowMs = 60000

      -- Clean old entries from minute window
      redis.call('ZREMRANGEBYSCORE', minuteKey, 0, now - windowMs)

      -- Check minute limit
      local minuteCount = redis.call('ZCARD', minuteKey)
      if minuteCount >= rpm then
        return {0, minuteCount, rpm, 'minute'}
      end

      -- Check day limit
      local dayCount = tonumber(redis.call('GET', dayKey) or '0')
      if dayCount >= rpd then
        return {0, dayCount, rpd, 'day'}
      end

      -- Add to minute window
      redis.call('ZADD', minuteKey, now, now .. ':' .. math.random(100000))
      redis.call('EXPIRE', minuteKey, 120)

      -- Increment day counter
      redis.call('INCR', dayKey)
      redis.call('EXPIRE', dayKey, 86400)

      return {1, minuteCount + 1, rpm, 'ok'}
    `;

    const result = await redis.eval(luaScript, 2, minuteKey, dayKey, now, rpm, rpd);

    const [allowed, count, limit, windowType] = result;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + 60000) / 1000));

    if (!allowed) {
      const retryAfter = windowType === 'minute' ? 60 : 3600;
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: 'RateLimitExceeded',
        message: `Rate limit exceeded (${windowType}). ${count}/${limit} requests.`,
        retryAfter,
      });
    }

    next();
  } catch (err) {
    // On Redis failure, allow the request through (fail-open)
    console.error('[RateLimiter] Error:', err.message);
    next();
  }
}

module.exports = { rateLimiterMiddleware };
