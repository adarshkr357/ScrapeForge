// ================================================================
// Route: Search (SERP scraping)
// ================================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const { validate } = require('../middleware/validator');
const { creditCheckMiddleware } = require('../middleware/creditCheck');
const { chargeCredits, calculateCredits } = require('../services/creditBilling');
const serpQueue = require('../queue/serpQueue');
const Request = require('../models/Request');
const Result = require('../models/Result');

// ── POST /search — Full SERP scrape ──
router.post('/', validate('POST /search'), creditCheckMiddleware, async (req, res) => {
  try {
    const params = req.validatedBody;
    const requestId = `serp_${uuid()}`;
    const creditCost = calculateCredits(params, '/search');

    await Request.create({
      requestId,
      apiKeyId: req.apiKey?._id || null,
      userId: req.user._id,
      url: `serp://${params.engine}?q=${encodeURIComponent(params.query)}`,
      params,
      status: 'queued',
      workerType: 'serp',
    });

    await serpQueue.add('serp', {
      requestId,
      engine: params.engine,
      query: params.query,
      num_results: params.num_results || 10,
      type: params.type || 'web',
      country: params.country || null,
      language: params.language || null,
      device: params.device || 'desktop',
      page: params.page || 1,
      parse: params.parse !== false,
      userId: req.user._id.toString(),
      apiKeyId: req.apiKey?._id?.toString() || null,
    }, {
      jobId: requestId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    });

    // Wait for result (SERP is usually fast)
    const result = await waitForSerpResult(requestId, 30000);

    if (result) {
      // Truncate organic_results to the requested num_results
      const numResults = params.num_results || 10;
      if (result.organic_results && Array.isArray(result.organic_results)) {
        result.organic_results = result.organic_results.slice(0, numResults);
      }

      // Update Request status to completed
      await Request.findOneAndUpdate(
        { requestId },
        {
          status: 'completed',
          completedAt: new Date(),
          latencyMs: result.search_time ? Math.round(result.search_time * 1000) : undefined,
        }
      );

      // Charge credits
      const isFailed = false;
      await chargeCredits(
        req.apiKey?._id || null,
        requestId,
        creditCost,
        isFailed,
        req.user._id
      );

      console.log(JSON.stringify({
        event: 'status_transition', requestId,
        from: 'queued', to: 'completed',
        engine: params.engine, credits: creditCost,
        timestamp: new Date().toISOString(),
      }));

      return res.json({
        success: true,
        requestId,
        data: result,
        credits_used: creditCost,
      });
    }

    // Timed out — update status to failed
    await Request.findOneAndUpdate(
      { requestId },
      {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Search timed out after 30s',
      }
    );

    // Charge 0 credits for failed requests
    await chargeCredits(
      req.apiKey?._id || null,
      requestId,
      creditCost,
      true, // isFailed
      req.user._id
    );

    console.log(JSON.stringify({
      event: 'status_transition', requestId,
      from: 'queued', to: 'failed',
      reason: 'timeout', timestamp: new Date().toISOString(),
    }));

    res.status(202).json({
      success: true,
      requestId,
      status: 'processing',
      poll_url: `/api/v1/scrape/${requestId}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'SearchError', message: err.message });
  }
});

// ── POST /search/fast — Ultra-fast SERP (<1s) ──
router.post('/fast', validate('POST /search'), creditCheckMiddleware, async (req, res) => {
  try {
    const params = { ...req.validatedBody, fast: true };
    const requestId = `serp_fast_${uuid()}`;
    const creditCost = calculateCredits(params, '/search/fast');

    await Request.create({
      requestId,
      apiKeyId: req.apiKey?._id || null,
      userId: req.user._id,
      url: `serp://${params.engine}?q=${encodeURIComponent(params.query)}`,
      params,
      status: 'queued',
      workerType: 'serp',
    });

    await serpQueue.add('serp_fast', {
      requestId,
      ...params,
      userId: req.user._id.toString(),
      apiKeyId: req.apiKey?._id?.toString() || null,
    }, {
      jobId: requestId,
      priority: 1,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
    });

    const result = await waitForSerpResult(requestId, 5000);

    if (result) {
      // Update Request status
      await Request.findOneAndUpdate(
        { requestId },
        { status: 'completed', completedAt: new Date() }
      );

      await chargeCredits(
        req.apiKey?._id || null, requestId, creditCost, false, req.user._id
      );

      return res.json({
        success: true,
        requestId,
        data: {
          organic_results: result.organic_results || [],
          total_results: result.total_results,
          search_time: result.search_time,
        },
        credits_used: creditCost,
      });
    }

    // Fast search timed out
    await Request.findOneAndUpdate(
      { requestId },
      { status: 'failed', completedAt: new Date(), errorMessage: 'Fast search timed out' }
    );

    await chargeCredits(
      req.apiKey?._id || null, requestId, creditCost, true, req.user._id
    );

    res.status(504).json({
      success: false,
      error: 'Timeout',
      message: 'Fast search timed out. Try /search for standard scraping.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'FastSearchError', message: err.message });
  }
});

async function waitForSerpResult(requestId, timeout) {
  const { getRedisConnection } = require('../queue/connection');
  const redis = getRedisConnection();
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Check Redis cache first (results land here before DB sync)
    const cached = await redis.get(`result:${requestId}`);
    if (cached) {
      const result = JSON.parse(cached);
      if (result.success) return result.extractedData || result;
      return null;  // Failed result
    }

    const request = await Request.findOne({ requestId }).lean();
    if (request?.status === 'completed') {
      const result = await Result.findOne({ requestId }).lean();
      return result?.extractedData;
    }
    if (request?.status === 'failed') return null;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

module.exports = router;
