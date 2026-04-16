// ================================================================
// Route: Crawl + Map
// ================================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const { validate } = require('../middleware/validator');
const { creditCheckMiddleware } = require('../middleware/creditCheck');
const { ssrfGuardMiddleware } = require('../middleware/ssrfGuard');
const { authMiddleware } = require('../middleware/auth');
const crawlQueue = require('../queue/crawlQueue');
const Crawl = require('../models/Crawl');
const CrawlPage = require('../models/CrawlPage');
const Request = require('../models/Request');
const { getRedisConnection } = require('../queue/connection');

// ── GET /crawl — List user crawls ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    const crawls = await Crawl.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: crawls });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ListCrawlError', message: err.message });
  }
});

// ── POST /crawl — Start a site crawl ──
router.post('/', validate('POST /crawl'), ssrfGuardMiddleware, creditCheckMiddleware, async (req, res) => {
  try {
    const params = req.validatedBody;
    const crawlId = `crawl_${uuid()}`;

    const crawl = await Crawl.create({
      crawlId,
      apiKeyId: req.apiKey?._id || null,
      userId: req.user._id,
      baseUrl: params.url,
      config: {
        maxPages: params.max_pages || 100,
        maxDepth: params.max_depth || 3,
        includePatterns: params.include_patterns || [],
        excludePatterns: params.exclude_patterns || [],
        respectRobotsTxt: params.respect_robots_txt !== false,
        followSitemaps: params.follow_sitemaps !== false,
        allowSubdomains: params.allow_subdomains || false,
        scraperType: params.scraper_type || 'auto',
        scrapeOptions: params.scrape_options || {},
        adaptiveMode: params.adaptive_mode || { enabled: false },
        deduplication: params.deduplication || 'content_hash',
        rateLimit: params.rate_limit || { requestsPerSecond: 5 },
      },
      webhookUrl: params.webhook_url,
    });

    await Request.create({
      requestId: crawlId,
      apiKeyId: req.apiKey?._id || null,
      userId: req.user._id,
      url: `crawl://${params.url.replace(/^https?:\/\//, '')}`,
      params: params,
      status: 'queued',
      workerType: 'crawl',
      workerId: null,
      stealthLevel: 0
    });

    await crawlQueue.add('crawl', {
      crawlId,
      baseUrl: params.url,
      config: crawl.config,
      userId: req.user._id.toString(),
      apiKeyId: req.apiKey?._id?.toString() || null,
    }, { jobId: crawlId });

    res.status(202).json({
      success: true,
      crawlId,
      status: 'queued',
      baseUrl: params.url,
      maxPages: params.max_pages || 100,
      maxDepth: params.max_depth || 3,
      poll_url: `/api/v1/crawl/${crawlId}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'CrawlError', message: err.message });
  }
});

// ── GET /crawl/:crawlId — Poll crawl progress ──
router.get('/:crawlId', async (req, res) => {
  try {
    const crawl = await Crawl.findOne({
      crawlId: req.params.crawlId,
      userId: req.user._id,
    }).lean();

    if (!crawl) {
      return res.status(404).json({ success: false, error: 'NotFound', message: 'Crawl not found' });
    }

    const pages = await CrawlPage.find({ crawlId: crawl.crawlId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const progress = crawl.pagesFound > 0
      ? Math.round((crawl.pagesScraped / crawl.pagesFound) * 100)
      : 0;

    res.json({
      success: true,
      crawlId: crawl.crawlId,
      status: crawl.status,
      baseUrl: crawl.baseUrl,
      progress,
      pagesFound: crawl.pagesFound,
      pagesScraped: crawl.pagesScraped,
      pagesFailed: crawl.pagesFailed,
      creditsUsed: crawl.creditsUsed,
      startedAt: crawl.startedAt,
      completedAt: crawl.completedAt,
      estimatedCompletion: crawl.estimatedCompletion,
      recentPages: pages.map(p => ({
        url: p.url,
        status: p.status,
        depth: p.depth,
        statusCode: p.statusCode,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'CrawlPollError', message: err.message });
  }
});

// ── POST /crawl/:crawlId/cancel — Cancel crawl ──
router.post('/:crawlId/cancel', async (req, res) => {
  try {
    const crawl = await Crawl.findOne({
      crawlId: req.params.crawlId,
      userId: req.user._id,
    });

    if (!crawl) {
      return res.status(404).json({ success: false, error: 'NotFound' });
    }

    crawl.status = 'cancelled';
    crawl.completedAt = new Date();
    await crawl.save();

    // Signal worker to stop via Redis
    await getRedisConnection().set(`crawl:cancel:${crawl.crawlId}`, '1', 'EX', 3600);

    res.json({ success: true, crawlId: crawl.crawlId, status: 'cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'CancelError', message: err.message });
  }
});

// ── DELETE /crawl — Bulk delete crawls ──
router.delete('/', async (req, res) => {
  try {
    const { crawlIds } = req.body;
    let result;
    
    if (crawlIds && Array.isArray(crawlIds) && crawlIds.length > 0) {
      result = await Crawl.deleteMany({ userId: req.user._id, crawlId: { $in: crawlIds } });
      // Also delete associated pages
      await CrawlPage.deleteMany({ crawlId: { $in: crawlIds } });
    } else {
      // Delete all
      const userCrawls = await Crawl.find({ userId: req.user._id }, { crawlId: 1 }).lean();
      const ids = userCrawls.map(c => c.crawlId);
      result = await Crawl.deleteMany({ userId: req.user._id });
      await CrawlPage.deleteMany({ crawlId: { $in: ids } });
    }

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: 'DeleteError', message: err.message });
  }
});


module.exports = router;
