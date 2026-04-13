// ================================================================
// Route: Extract + Screenshot + PDF
// ================================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const extractionEngine = require('../services/extractionEngine');
const { creditCheckMiddleware } = require('../middleware/creditCheck');
const { calculateCredits } = require('../services/creditBilling');

// ── POST /extract — Extraction from raw HTML ──
router.post('/', creditCheckMiddleware, async (req, res) => {
  try {
    const { html, url, extraction_rules, xpath_rules, regex_rules } = req.body;

    if (!html && !url) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Provide either html or url',
      });
    }

    let result = {};

    // Traditional extraction
    if (html && (extraction_rules || xpath_rules || regex_rules)) {
      result = extractionEngine.extract(html, { extraction_rules, xpath_rules, regex_rules });
    }

    res.json({
      success: true,
      requestId: `ext_${uuid()}`,
      data: result,
      credits_used: calculateCredits(req.body, '/extract'),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ExtractionError', message: err.message });
  }
});

// ── POST /screenshot — Capture page screenshot ──
router.post('/screenshot', creditCheckMiddleware, async (req, res) => {
  try {
    const { url, full_page = true, format = 'png', quality = 90, selector, viewport } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'ValidationError', message: 'URL required' });
    }

    const requestId = `ss_${uuid()}`;
    const { Queue } = require('bullmq');
    const { getRedisConnection } = require('../queue/connection');
    const browserQueue = new Queue('scrape-node-browser', { connection: getRedisConnection() });

    await browserQueue.add('screenshot', {
      requestId,
      url,
      params: {
        screenshot: { enabled: true, full_page, format, quality, selector },
        viewport: viewport || { width: 1920, height: 1080 },
      },
      routing: { workerType: 'node-browser' },
      userId: req.user._id.toString(),
      apiKeyId: req.apiKey?._id?.toString() || null,
    }, { jobId: requestId });
    await browserQueue.close();

    res.status(202).json({
      success: true,
      requestId,
      status: 'queued',
      credits_used: calculateCredits(req.body, '/screenshot'),
      poll_url: `/api/v1/scrape/${requestId}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ScreenshotError', message: err.message });
  }
});

// ── POST /pdf — Render page as PDF ──
router.post('/pdf', creditCheckMiddleware, async (req, res) => {
  try {
    const { url, viewport } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'ValidationError', message: 'URL required' });
    }

    const requestId = `pdf_${uuid()}`;
    const { Queue } = require('bullmq');
    const { getRedisConnection } = require('../queue/connection');
    const browserQueue = new Queue('scrape-node-browser', { connection: getRedisConnection() });

    await browserQueue.add('pdf', {
      requestId,
      url,
      params: {
        pdf: true,
        viewport: viewport || { width: 1920, height: 1080 },
      },
      routing: { workerType: 'node-browser' },
      userId: req.user._id.toString(),
      apiKeyId: req.apiKey?._id?.toString() || null,
    }, { jobId: requestId });
    await browserQueue.close();

    res.status(202).json({
      success: true,
      requestId,
      status: 'queued',
      credits_used: calculateCredits(req.body, '/pdf'),
      poll_url: `/api/v1/scrape/${requestId}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'PDFError', message: err.message });
  }
});

module.exports = router;
