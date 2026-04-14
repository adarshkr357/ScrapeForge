// ================================================================
// Queue Listeners — DB synchronization for all job completions
// ================================================================
const { QueueEvents } = require('bullmq');
const { getRedisConnection } = require('./connection');
const Request = require('../models/Request');
const Result = require('../models/Result');
const Crawl = require('../models/Crawl');
const Dataset = require('../models/Dataset');
const DatasetItem = require('../models/DatasetItem');
const { chargeCredits, calculateCredits, CREDIT_TABLE } = require('../services/creditBilling');

/**
 * Structured log helper for queue events.
 */
function queueLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'queue-listener',
    level,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

function startQueueListeners() {
  const connection = getRedisConnection();

  // ── Active job tracking: set status='processing' when worker starts ──
  const handleActive = async (queueName, jobId) => {
    try {
      const originalRequestId = jobId.split('_esc')[0];

      await Request.findOneAndUpdate(
        { requestId: originalRequestId, status: 'queued' },
        { status: 'processing', startedAt: new Date() }
      );

      queueLog('info', 'Job started processing', {
        event: 'status_transition',
        requestId: originalRequestId,
        queue: queueName,
        from: 'queued',
        to: 'processing',
      });
    } catch (err) {
      queueLog('error', 'Active handler error', {
        event: 'active_error', jobId, error: err.message,
      });
    }
  };

  // ── Completion handler ──
  const handleCompletion = async (queueName, jobId) => {
    try {
      const cached = await connection.get(`result:${jobId}`);
      if (!cached) return;
      const result = JSON.parse(cached);

      const originalRequestId = jobId.split('_esc')[0];
      const reqDocCheck = await Request.findOne({ requestId: originalRequestId }).lean();

      // If it's a synchronous scrape that was already handled by scrape.js, skip
      // BUT: always handle crawl_, batch_, serp_ jobs here
      // AND: handle any req_ job whose status is still queued/processing (sync path timed out)
      if (
        reqDocCheck &&
        !reqDocCheck.webhookUrl &&
        !reqDocCheck.isBatch &&
        !originalRequestId.startsWith('crawl_') &&
        !originalRequestId.startsWith('batch_') &&
        !originalRequestId.startsWith('serp_') &&
        reqDocCheck.status !== 'queued' &&
        reqDocCheck.status !== 'processing'
      ) {
        return;
      }

      // Determine final status
      const finalStatus = result.success ? 'completed' : 'failed';
      const previousStatus = reqDocCheck?.status || 'queued';

      // ── Crawl-specific handling ──
      if (originalRequestId.startsWith('crawl_')) {
        await handleCrawlCompletion(originalRequestId, result, reqDocCheck);
        return;
      }

      // ── Generic job completion (scrape, SERP, batch) ──
      const creditsUsed = result.credits_used || result.creditsUsed || 0;

      const reqDoc = await Request.findOneAndUpdate(
        { requestId: originalRequestId, status: { $in: ['queued', 'processing'] } },
        {
          status: finalStatus,
          completedAt: new Date(),
          latencyMs: result.latencyMs,
          creditsUsed: creditsUsed,
          errorMessage: result.success ? null : result.error,
        },
        { new: false } // return the OLD doc so we can check billed status
      );

      if (!reqDoc) return; // Already processed

      // Charge credits (billed flag checked inside chargeCredits)
      if (!reqDoc.billed) {
        await chargeCredits(
          reqDoc.apiKeyId, originalRequestId,
          creditsUsed, !result.success, reqDoc.userId
        );
      }

      queueLog('info', 'Job completed', {
        event: 'status_transition',
        requestId: originalRequestId,
        queue: queueName,
        from: previousStatus,
        to: finalStatus,
        credits: creditsUsed,
        latencyMs: result.latencyMs,
      });

      // Save result to DB
      if (result.success) {
        await saveResult(originalRequestId, result, reqDoc);
      }
    } catch (err) {
      queueLog('error', 'Completion handler error', {
        event: 'completion_error', jobId, queue: queueName, error: err.message,
      });
    }
  };

  // ── Crawl-specific completion handler ──
  async function handleCrawlCompletion(crawlId, result, reqDoc) {
    const pagesScraped = result.pagesScraped || 0;
    const pagesFailed = result.pagesFailed || 0;

    // Determine crawl status per rules:
    // pagesScraped > 0 -> completed (even if some failed = partial success)
    // pagesScraped == 0 -> failed
    const crawlStatus = pagesScraped > 0 ? 'completed' : 'failed';
    const creditsToCharge = pagesScraped * CREDIT_TABLE.crawl_per_page;

    // Update Crawl document
    await Crawl.findOneAndUpdate(
      { crawlId },
      {
        status: crawlStatus,
        completedAt: new Date(),
        pagesScraped,
        pagesFailed,
        pagesFound: result.totalUrls || 0,
        creditsUsed: creditsToCharge,
      }
    );

    // Update Request document
    await Request.findOneAndUpdate(
      { requestId: crawlId, status: { $in: ['queued', 'processing'] } },
      {
        status: crawlStatus,
        completedAt: new Date(),
        creditsUsed: creditsToCharge,
        errorMessage: crawlStatus === 'failed' ? 'No pages could be scraped' : null,
      }
    );

    // Charge credits (only for successfully scraped pages)
    if (reqDoc && !reqDoc.billed) {
      await chargeCredits(
        reqDoc.apiKeyId, crawlId,
        creditsToCharge, crawlStatus === 'failed', reqDoc.userId
      );
    }

    // Save CrawlPage records from the summary data in result
    const CrawlPage = require('../models/CrawlPage');
    if (result.pages && Array.isArray(result.pages)) {
      const pageOps = result.pages.map(p =>
        CrawlPage.create({
          crawlId,
          url: p.url,
          status: p.status || 'completed',
          depth: p.depth || 0,
          statusCode: p.statusCode || 200,
          title: p.title || '',
          contentPreview: (p.content || '').substring(0, 500),
          linksFound: p.links_found || 0,
          contentLength: p.content_length || 0,
        }).catch(e => {
          queueLog('error', 'CrawlPage save error', {
            crawlId, url: p.url, error: e.message,
          });
        })
      );
      await Promise.allSettled(pageOps);
    }

    // Create Dataset with structured page data
    if (pagesScraped > 0 && reqDoc?.userId) {
      const datasetId = `ds_${Date.now()}`;
      const pages = result.pages || [];
      const dataItems = pages
        .filter(p => p.status === 'completed')
        .map(p => ({
          url: p.url,
          title: p.title || '',
          content: (p.content || '').substring(0, 10000), // Cap per-item content
          depth: p.depth || 0,
          statusCode: p.statusCode || 200,
        }));

      let sizeBytes = 0;
      try { sizeBytes = Buffer.byteLength(JSON.stringify(dataItems), 'utf8'); } catch (_) {}

      await Dataset.create({
        datasetId,
        userId: reqDoc.userId,
        name: `Crawl: ${reqDoc.url || crawlId}`,
        sourceType: 'crawl',
        format: 'json',
        itemCount: dataItems.length,
        sizeBytes,
      });

      const itemOps = dataItems.map((item, idx) =>
        DatasetItem.create({ datasetId, order: idx + 1, data: item })
          .catch(e => { /* ignore */ })
      );
      await Promise.allSettled(itemOps);

      // Link dataset to crawl
      await Crawl.findOneAndUpdate({ crawlId }, { datasetId });
    }

    queueLog('info', 'Crawl completed', {
      event: 'crawl_completed',
      crawlId,
      status: crawlStatus,
      pagesScraped,
      pagesFailed,
      totalUrls: result.totalUrls || 0,
      credits: creditsToCharge,
    });
  }

  // ── Save result + dataset for non-crawl jobs ──
  async function saveResult(requestId, result, reqDoc) {
    try {
      await Result.create({
        requestId,
        url: result.url,
        extractedData: result.extractedData || result.data || result,
        formattedOutput: result.formattedOutput,
        contentHash: result.contentHash || `hash_${Date.now()}`,
        cachedUntil: new Date(Date.now() + 3600000),
      }).catch(() => { /* ignore dupe errors */ });

      if (reqDoc?.userId) {
        const datasetId = `ds_${Date.now()}`;
        let dsData = result.extractedData || result.data || result;
        if (!Array.isArray(dsData)) {
          if (dsData.organic_results) {
            dsData = dsData.organic_results;
          } else {
            dsData = [dsData];
          }
        }

        let sizeBytes = 0;
        try { sizeBytes = Buffer.byteLength(JSON.stringify(dsData), 'utf8'); } catch (_) {}

        await Dataset.create({
          datasetId,
          userId: reqDoc.userId,
          name: requestId.startsWith('serp_') ? `SERP: ${reqDoc.url}` : `Scrape: ${reqDoc.url}`,
          sourceType: requestId.startsWith('serp_') ? 'serp' : 'scrape',
          format: 'json',
          itemCount: Array.isArray(dsData) ? dsData.length : 1,
          sizeBytes,
        });

        if (Array.isArray(dsData)) {
          const itemOps = dsData.map((item, idx) =>
            DatasetItem.create({ datasetId, order: idx + 1, data: item }).catch(() => {})
          );
          await Promise.allSettled(itemOps);
        }
      }
    } catch (err) {
      queueLog('error', 'Save result error', {
        requestId, error: err.message,
      });
    }
  }

  // ── Failure handler ──
  const handleFailure = async (queueName, jobId, failedReason) => {
    try {
      const originalRequestId = jobId.split('_esc')[0];

      await Request.findOneAndUpdate(
        { requestId: originalRequestId, status: { $in: ['queued', 'processing'] } },
        {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: failedReason || 'Job failed in worker',
        }
      );

      // Update crawl status too if applicable
      if (originalRequestId.startsWith('crawl_')) {
        await Crawl.findOneAndUpdate(
          { crawlId: originalRequestId, status: { $in: ['queued', 'running'] } },
          {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: failedReason || 'Crawl failed in worker',
          }
        );
      }

      queueLog('error', 'Job failed', {
        event: 'job_failed',
        requestId: originalRequestId,
        queue: queueName,
        error: failedReason,
      });
    } catch (err) {
      queueLog('error', 'Failure handler error', {
        event: 'failure_handler_error', jobId, error: err.message,
      });
    }
  };

  // ── Attach listeners to all queues ──
  const queues = ['scrape-node-browser', 'scrape-python-http', 'scrape-python-browser', 'serp', 'crawl', 'batch'];

  queues.forEach(qName => {
    const events = new QueueEvents(qName, { connection });
    events.on('active', ({ jobId }) => handleActive(qName, jobId));
    events.on('completed', ({ jobId }) => handleCompletion(qName, jobId));
    events.on('failed', ({ jobId, failedReason }) => handleFailure(qName, jobId, failedReason));
  });

  console.log(`[ScrapeForge] Queue listeners attached for: ${queues.join(', ')}`);
}

module.exports = { startQueueListeners };
