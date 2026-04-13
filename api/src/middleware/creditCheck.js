// ================================================================
// Middleware: Credit Check
// ================================================================
const { calculateCredits, validateCredits } = require('../services/creditBilling');

/**
 * Pre-flight credit check before processing a request.
 * Validates credits BEFORE enqueuing jobs.
 * Blocks if insufficient credits for BOTH API key and JWT users.
 */
async function creditCheckMiddleware(req, res, next) {
  try {
    // Skip for non-billable endpoints
    const nonBillable = ['/api/v1/health', '/api/v1/account', '/api/v1/usage', '/api/v1/proxy/health'];
    if (nonBillable.some(p => req.originalUrl.startsWith(p))) {
      return next();
    }

    const estimated = calculateCredits(req.body || {}, req.path);
    req.creditsEstimated = estimated;

    // Check 1: API Key credits (if authenticating via API key)
    if (req.apiKey) {
      const available = (req.apiKey.credits || 0) - (req.apiKey.creditsUsed || 0);
      if (available < estimated) {
        return res.status(402).json({
          success: false,
          error: 'InsufficientCredits',
          message: `Insufficient API key credits. Required: ${estimated}, Available: ${available}`,
          creditsRequired: estimated,
          creditsAvailable: available,
        });
      }
    }

    // Check 2: User account credits (always, for both JWT and API key users)
    if (req.user?._id && estimated > 0) {
      const hasCredits = await validateCredits(req.user._id, req.apiKey?._id, estimated);
      if (!hasCredits) {
        return res.status(402).json({
          success: false,
          error: 'InsufficientCredits',
          message: `Insufficient account credits. Required: ${estimated}`,
          creditsRequired: estimated,
        });
      }
    }

    next();
  } catch (err) {
    console.error('[CreditCheck] Error:', err.message);
    next();  // Fail-open on errors
  }
}

module.exports = { creditCheckMiddleware };
