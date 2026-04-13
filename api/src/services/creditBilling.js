// ================================================================
// Service: Credit Billing
// ================================================================
const mongoose = require('mongoose');

/**
 * Credit pricing table (from Part 14 of the spec).
 */
const CREDIT_TABLE = {
  // Base costs by rendering + proxy combo
  'static_datacenter':      1,
  'static_residential':     5,
  'js_datacenter':          5,
  'js_residential':         10,
  'js_premium':             25,
  'js_scenario':            25,  // multi-step scenarios

  // Per-page crawl
  'crawl_per_page':         1,

  // SERP
  'serp_parsed':            5,
  'serp_fast':              10,

  // Add-ons
  'addon_captcha_solve':    10,
  'addon_screenshot':       2,
  'addon_pdf':              3,

  // Extract from provided HTML
  'extract_html':           0,
};

/**
 * Calculate estimated credits for a request.
 * @param {Object} params - Request parameters
 * @param {string} endpoint - Request endpoint path
 * @returns {number} Estimated credits
 */
function calculateCredits(params, endpoint) {
  let credits = 0;

  // ── Screenshot ──
  if (endpoint.includes('/screenshot')) {
    return CREDIT_TABLE.addon_screenshot;
  }

  // ── PDF ──
  if (endpoint.includes('/pdf')) {
    return CREDIT_TABLE.addon_pdf;
  }

  // ── Extract (HTML→data, free) ──
  if (endpoint.includes('/extract')) {
    return CREDIT_TABLE.extract_html;
  }

  // ── SERP ──
  if (endpoint.includes('/search/fast')) {
    return CREDIT_TABLE.serp_fast;
  }
  if (endpoint.includes('/search')) {
    return CREDIT_TABLE.serp_parsed;
  }

  // ── Crawl ──
  if (endpoint.includes('/crawl') || endpoint.includes('/map')) {
    const maxPages = params.max_pages || 100;
    return maxPages * CREDIT_TABLE.crawl_per_page;
  }

  // ── Base scrape cost ──
  const hasJS = params.render_js || params.js_scenario?.length > 0;
  const proxyType = params.proxy_type || 'datacenter';
  const isScenario = params.js_scenario?.length > 0;

  if (isScenario) {
    credits += CREDIT_TABLE.js_scenario;
    // Additional credits for complex scenarios (>5 steps)
    if (params.js_scenario.length > 5) {
      credits += Math.floor(params.js_scenario.length / 5) * 5;
    }
  } else if (hasJS && (proxyType === 'premium' || proxyType === 'isp')) {
    credits += CREDIT_TABLE.js_premium;
  } else if (hasJS && proxyType === 'residential') {
    credits += CREDIT_TABLE.js_residential;
  } else if (hasJS) {
    credits += CREDIT_TABLE.js_datacenter;
  } else if (proxyType === 'residential') {
    credits += CREDIT_TABLE.static_residential;
  } else {
    credits += CREDIT_TABLE.static_datacenter;
  }

  // ── Add-ons ──
  if (params.bypass_captcha) {
    credits += CREDIT_TABLE.addon_captcha_solve;
  }
  if (params.screenshot?.enabled) {
    credits += CREDIT_TABLE.addon_screenshot;
  }
  if (params.pdf) {
    credits += CREDIT_TABLE.addon_pdf;
  }

  return credits;
}

/**
 * Structured logger helper (uses console with JSON for structured output).
 * Will be picked up by Winston transports in app.js.
 */
function billingLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'credit-billing',
    level,
    message,
    ...meta,
  };
  if (level === 'error' || level === 'warn') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Pre-flight credit check. Returns true if user has enough credits.
 * Does NOT deduct — only validates.
 */
async function validateCredits(userId, apiKeyId, creditsRequired) {
  if (creditsRequired <= 0) return true;

  const User = require('../models/User');
  const user = await User.findById(userId).select('credits').lean();
  if (!user) return false;

  if ((user.credits || 0) < creditsRequired) {
    billingLog('warn', 'Pre-flight credit check failed', {
      event: 'credit_preflight_failed',
      userId: userId.toString(),
      required: creditsRequired,
      available: user.credits || 0,
    });
    return false;
  }

  return true;
}

/**
 * Charge credits after a request completes.
 * Uses atomic conditional update and billed flag to prevent double-charging.
 * Failed/blocked requests → 0 credits.
 *
 * Attempts MongoDB transaction when replica set is available.
 * Falls back to sequential atomic operations for standalone deployments.
 */
async function chargeCredits(apiKeyId, requestId, credits, isFailed = false, userId = null) {
  const ApiKey = require('../models/ApiKey');
  const UsageLog = require('../models/UsageLog');
  const User = require('../models/User');
  const Request = require('../models/Request');

  // Don't charge for failed requests
  if (isFailed) credits = 0;

  // Determine if replica set is available for transactions
  let useTransaction = false;
  try {
    const topology = mongoose.connection?.db?.s?.topology;
    if (topology && (topology.description?.type === 'ReplicaSetWithPrimary' || topology.description?.type === 'Single')) {
      // Only use transactions with replica sets
      useTransaction = topology.description?.type === 'ReplicaSetWithPrimary';
    }
  } catch (_) { /* standalone, no transactions */ }

  if (useTransaction) {
    return _chargeWithTransaction(apiKeyId, requestId, credits, isFailed, userId,
      { ApiKey, UsageLog, User, Request });
  }
  return _chargeSequential(apiKeyId, requestId, credits, isFailed, userId,
    { ApiKey, UsageLog, User, Request });
}

/**
 * Transaction-based credit charging (for replica set deployments).
 */
async function _chargeWithTransaction(apiKeyId, requestId, credits, isFailed, userId, models) {
  const { ApiKey, UsageLog, User, Request } = models;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Step 1: Mark request as billed (prevents double-charge)
    const request = await Request.findOneAndUpdate(
      { requestId, billed: { $ne: true } },
      { $set: { billed: true, creditsUsed: credits } },
      { session, new: true }
    );
    if (!request) {
      await session.abortTransaction();
      billingLog('warn', 'Double-charge blocked or request not found', {
        event: 'credit_double_charge_blocked', requestId,
      });
      return 0;
    }

    // Step 2: Deduct from User.credits with floor guard
    if (credits > 0 && userId) {
      const userResult = await User.findOneAndUpdate(
        { _id: userId, credits: { $gte: credits } },
        { $inc: { credits: -credits } },
        { session, new: true }
      );
      if (!userResult) {
        await session.abortTransaction();
        billingLog('warn', 'Insufficient credits during charge', {
          event: 'credit_insufficient', requestId, userId: userId.toString(), required: credits,
        });
        return 0;
      }
    }

    // Step 3: Deduct from ApiKey (if present)
    if (credits > 0 && apiKeyId) {
      await ApiKey.findByIdAndUpdate(apiKeyId, { $inc: { creditsUsed: credits } }, { session });
    }

    // Step 4: Update daily usage log
    const today = new Date().toISOString().slice(0, 10);
    await UsageLog.findOneAndUpdate(
      { userId: userId || null, date: today },
      {
        $inc: {
          creditsUsed: credits,
          requestCount: 1,
          successCount: isFailed ? 0 : 1,
          failCount: isFailed ? 1 : 0,
        },
        $setOnInsert: { apiKeyId: apiKeyId || null },
      },
      { upsert: true, session }
    );

    await session.commitTransaction();

    billingLog('info', 'Credits charged', {
      event: 'credit_deduction', requestId, credits,
      userId: userId?.toString(), apiKeyId: apiKeyId?.toString(),
    });
    return credits;
  } catch (err) {
    await session.abortTransaction();
    billingLog('error', 'Transaction failed', {
      event: 'credit_transaction_failed', requestId, error: err.message,
    });
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Sequential atomic credit charging (for standalone MongoDB deployments).
 * Uses billed flag as the primary double-charge guard.
 */
async function _chargeSequential(apiKeyId, requestId, credits, isFailed, userId, models) {
  const { ApiKey, UsageLog, User, Request } = models;

  // Step 1: Mark request as billed atomically (prevents double-charge)
  const request = await Request.findOneAndUpdate(
    { requestId, billed: { $ne: true } },
    { $set: { billed: true, creditsUsed: credits } },
    { new: true }
  );
  if (!request) {
    billingLog('warn', 'Double-charge blocked or request not found', {
      event: 'credit_double_charge_blocked', requestId,
    });
    return 0;
  }

  // Step 2: Deduct from User.credits with floor guard
  if (credits > 0 && userId) {
    const userResult = await User.findOneAndUpdate(
      { _id: userId, credits: { $gte: credits } },
      { $inc: { credits: -credits } },
      { new: true }
    );
    if (!userResult) {
      // Rollback billed flag
      await Request.updateOne({ requestId }, { $set: { billed: false, creditsUsed: 0 } });
      billingLog('warn', 'Insufficient credits during charge', {
        event: 'credit_insufficient', requestId, userId: userId.toString(), required: credits,
      });
      return 0;
    }
  }

  // Step 3: Deduct from ApiKey (if present)
  if (credits > 0 && apiKeyId) {
    await ApiKey.findByIdAndUpdate(apiKeyId, { $inc: { creditsUsed: credits } });
  }

  // Step 4: Update daily usage log
  const today = new Date().toISOString().slice(0, 10);
  const logFilter = userId ? { userId, date: today } : { apiKeyId, date: today };
  await UsageLog.findOneAndUpdate(
    logFilter,
    {
      $inc: {
        creditsUsed: credits,
        requestCount: 1,
        successCount: isFailed ? 0 : 1,
        failCount: isFailed ? 1 : 0,
      },
      $setOnInsert: { apiKeyId: apiKeyId || null, userId: userId || null },
    },
    { upsert: true }
  );

  billingLog('info', 'Credits charged (sequential)', {
    event: 'credit_deduction', requestId, credits,
    userId: userId?.toString(), apiKeyId: apiKeyId?.toString(),
  });
  return credits;
}

module.exports = { calculateCredits, chargeCredits, validateCredits, CREDIT_TABLE };
