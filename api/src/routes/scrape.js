// ================================================================
// Route: Scrape (Core single-URL + batch + async poll)
// ================================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const { validate } = require('../middleware/validator');
const { creditCheckMiddleware } = require('../middleware/creditCheck');
const { ssrfGuardMiddleware } = require('../middleware/ssrfGuard');
const { smartRouter } = require('../services/smartRouter');
const { calculateCredits, chargeCredits } = require('../services/creditBilling');
const { formatOutput } = require('../services/outputFormatter');
const extractionEngine = require('../services/extractionEngine');
const batchQueue = require('../queue/batchQueue');
const Request = require('../models/Request');
const Result = require('../models/Result');

// ── POST /scrape — Core single-URL scrape ──
router.post('/', validate('POST /scrape'), ssrfGuardMiddleware, creditCheckMiddleware, async (req, res) => {
    try {
        const params = req.validatedBody;
        const requestId = `req_${uuid()}`;

        // 1. Smart Route
        const routing = await smartRouter.route(params);

        // 2. Create request record
        const requestDoc = await Request.create({
            requestId,
            apiKeyId: req.apiKey?._id || null,
            userId: req.user._id,
            url: params.url,
            method: params.method || 'GET',
            params,
            status: 'queued',
            creditsEstimated: req.creditsEstimated || calculateCredits(params, '/scrape'),
            workerType: routing.workerType,
            stealthLevel: routing.stealthLevel,
            maxRetries: params.max_retries || 3,
            webhookUrl: params.webhook_url,
        });

        // 3. Add to queue
        const jobData = {
            requestId,
            url: params.url,
            params,
            routing,
            userId: req.user._id.toString(),
            apiKeyId: req.apiKey?._id?.toString() || null,
        };

        // Route to isolated queue via SmartRouter prediction
        const { Queue } = require('bullmq');
        const { getRedisConnection } = require('../queue/connection');

        // Map workerType string to proper hyphenated queue name
        const workerTypeRaw = routing.workerType || 'python-http';
        const queueName = `scrape-${workerTypeRaw.replace('_', '-')}`;

        const targetQueue = new Queue(queueName, { connection: getRedisConnection() });

        await targetQueue.add('scrape', jobData, {
            jobId: requestId,
            priority: routing.stealthLevel >= 3 ? 1 : 5,  // High stealth = higher priority
            timeout: params.timeout || 30000,
        });
        // Immediately close queue to prevent connection leaks
        await targetQueue.close();

        // 5. If webhook → return immediately (async)
        if (params.webhook_url) {
            return res.status(202).json({
                success: true,
                requestId,
                status: 'queued',
                message: 'Request queued. Results will be delivered via webhook.',
                poll_url: `/api/v1/scrape/${requestId}`,
            });
        }

        // 6. Synchronous: wait for result (up to timeout)
        const timeout = Math.min(params.timeout || 30000, 120000);
        let result = await waitForResult(requestId, timeout);
        let currentRouting = routing;
        const maxEscalations = params.auto_escalate !== false ? 2 : 0; // Auto-escalate by default

        // ── Auto-Escalation: retry with higher stealth on block or worker error ──
        for (let attempt = 0; attempt < maxEscalations && result; attempt++) {
            // Check if result indicates a failure that could benefit from escalation
            const isBlocked = result.blocked || (result.success === false && (
                result.statusCode === 403 || result.statusCode === 429 || result.statusCode === 503 ||
                result.challengeType || (result.error && result.error.includes('challenge'))
            ));

            const isWorkerError = !isBlocked && result.success === false;

            if (!isBlocked && !isWorkerError) break; // Successful — stop escalating

            // Escalate stealth configuration
            const escalatedStealth = Math.min((currentRouting.stealthLevel || 0) + 2, 4);
            const escalatedWorker = escalatedStealth >= 2 ? 'node-browser' : currentRouting.workerType;
            const escalatedProxy = escalatedStealth >= 3 ? 'residential' : currentRouting.proxyConfig?.type || 'datacenter';

            console.log(`[Scrape] Auto-escalating ${requestId}: stealth ${currentRouting.stealthLevel} → ${escalatedStealth}, worker → ${escalatedWorker}`);

            const escalatedRouting = {
                ...currentRouting,
                workerType: escalatedWorker,
                stealthLevel: escalatedStealth,
                proxyConfig: { ...currentRouting.proxyConfig, type: escalatedProxy },
            };

            // Enqueue a retry with escalated settings
            const retryRequestId = `${requestId}_esc${attempt + 1}`;
            const retryQueueName = `scrape-${escalatedWorker.replace('_', '-')}`;
            const { Queue } = require('bullmq');
            const { getRedisConnection } = require('../queue/connection');
            const retryQueue = new Queue(retryQueueName, { connection: getRedisConnection() });

            await retryQueue.add('scrape', {
                requestId: retryRequestId,
                url: params.url,
                params,
                routing: escalatedRouting,
                userId: req.user._id.toString(),
                apiKeyId: req.apiKey?._id?.toString() || null,
            }, {
                jobId: retryRequestId,
                priority: 1,
            });
            await retryQueue.close();

            // Wait for escalated result
            const retryResult = await waitForResult(retryRequestId, Math.max(timeout - (Date.now() - Date.parse(requestDoc.createdAt || new Date())), 15000));
            if (retryResult) {
                result = retryResult;
                currentRouting = escalatedRouting;
            }
            if (retryResult?.success) break; // Success — stop escalating
        }

        if (result) {
            // Determine if the final result is actually successful
            const scrapeSucceeded = result.success !== false && result.statusCode >= 200 && result.statusCode < 400;

            if (scrapeSucceeded) {
                const formatted = formatOutput(result, params.output_format || 'json', params);
                const credits = calculateCredits(params, '/scrape');

                // Update DB record with final escalated worker/stealth and success status atomically
                const reqDoc = await Request.findOneAndUpdate(
                    { requestId },
                    {
                        $set: {
                            status: 'completed',
                            workerType: currentRouting.workerType,
                            stealthLevel: currentRouting.stealthLevel,
                            creditsUsed: credits,
                            latencyMs: result.latencyMs,
                            completedAt: new Date()
                        }
                    }
                );

                // Charge credits and log usage (works with or without an API key)
                await chargeCredits(req.apiKey?._id || null, requestId, credits, false, req.user._id);

                const Dataset = require('../models/Dataset');
                const DatasetItem = require('../models/DatasetItem');
                const datasetId = `ds_${Date.now()}`;

                let dsData = result.extractedData || result.data || result;
                if (Array.isArray(dsData)) {
                    if (dsData.length > 0 && dsData[0].organic_results) dsData = dsData[0].organic_results;
                } else if (dsData.organic_results) {
                    dsData = dsData.organic_results;
                }

                let sizeBytes = 0;
                try { sizeBytes = Buffer.byteLength(JSON.stringify(dsData), 'utf8'); } catch (e) { }

                const dbOps = [
                    Dataset.create({
                        datasetId,
                        userId: req.user._id,
                        name: `Scrape: ${params.url}`,
                        sourceType: 'scrape',
                        format: 'json',
                        itemCount: Array.isArray(dsData) ? dsData.length : 1,
                        sizeBytes
                    })
                ];

                if (Array.isArray(dsData)) {
                    dsData.forEach((item, idx) => {
                        dbOps.push(DatasetItem.create({ datasetId, order: idx + 1, data: item }));
                    });
                } else {
                    dbOps.push(DatasetItem.create({ datasetId, order: 1, data: dsData }));
                }

                dbOps.push(
                    Result.create({
                        requestId,
                        url: result.url,
                        extractedData: result.extractedData || result.data || result,
                        formattedOutput: formatted,
                        contentHash: result.contentHash || `hash_${Date.now()}`,
                        cachedUntil: new Date(Date.now() + 3600000),
                    }).catch(e => { })
                );

                await Promise.all(dbOps);

                return res.json({
                    success: true,
                    data: formatted,
                    requestId,
                    credits_used: credits,
                    metadata: {
                        workerType: currentRouting.workerType,
                        stealthLevel: currentRouting.stealthLevel,
                        proxyType: currentRouting.proxyConfig.type,
                        latencyMs: result.latencyMs,
                    },
                });
            }

            // Update DB record with final escalated worker/stealth and failure status atomically
            const reqDocFail = await Request.findOneAndUpdate(
                { requestId },
                {
                    $set: {
                        status: 'failed',
                        workerType: currentRouting.workerType,
                        stealthLevel: currentRouting.stealthLevel,
                        errorMessage: result.error || `HTTP ${result.statusCode}`,
                        latencyMs: result.latencyMs,
                        completedAt: new Date()
                    }
                }
            );

            // Record failure in usage logs (works with or without an API key)
            if (reqDocFail) {
                await chargeCredits(req.apiKey?._id || null, requestId, 0, true, req.user._id);
            }

            // Scrape failed (blocked or error)
            return res.json({
                success: false,
                error: result.error || `HTTP ${result.statusCode}`,
                statusCode: result.statusCode,
                blocked: result.blocked || false,
                challengeType: result.challengeType || null,
                requestId,
                credits_used: 0,
                metadata: {
                    workerType: currentRouting.workerType,
                    stealthLevel: currentRouting.stealthLevel,
                    proxyType: currentRouting.proxyConfig.type,
                    latencyMs: result.latencyMs,
                    escalationAttempts: maxEscalations,
                },
            });
        }

        // Still processing
        res.status(202).json({
            success: true,
            requestId,
            status: 'processing',
            message: 'Request is still processing.',
            poll_url: `/api/v1/scrape/${requestId}`,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'ScrapeError',
            message: err.message,
        });
    }
});

// ── POST /scrape/batch — Batch scrape (up to 5,000 URLs) ──
router.post('/batch', validate('POST /scrape/batch'), ssrfGuardMiddleware, creditCheckMiddleware, async (req, res) => {
    try {
        const { urls, options = {}, webhook_url } = req.validatedBody;
        const batchId = `batch_${uuid()}`;

        // Create request records for each URL
        const requestIds = [];
        for (const url of urls) {
            const requestId = `req_${uuid()}`;
            requestIds.push(requestId);

            await Request.create({
                requestId,
                apiKeyId: req.apiKey?._id || null,
                userId: req.user._id,
                url,
                params: { ...options, url },
                status: 'queued',
                isBatch: true,
                batchId,
            });
        }

        // Add batch job
        await batchQueue.add('batch', {
            batchId,
            urls,
            options,
            requestIds,
            userId: req.user._id.toString(),
            apiKeyId: req.apiKey?._id?.toString() || null,
            webhookUrl: webhook_url,
        }, {
            jobId: batchId,
        });

        res.status(202).json({
            success: true,
            batchId,
            totalUrls: urls.length,
            requestIds,
            status: 'queued',
            poll_url: `/api/v1/scrape/${batchId}`,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'BatchError',
            message: err.message,
        });
    }
});

// ── GET /scrape/:requestId — Poll async result ──
router.get('/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;

        // Check if it's a batch
        if (requestId.startsWith('batch_')) {
            const requests = await Request.find({ batchId: requestId }).lean();
            const completed = requests.filter(r => r.status === 'completed').length;
            const failed = requests.filter(r => r.status === 'failed').length;

            return res.json({
                success: true,
                batchId: requestId,
                status: completed + failed === requests.length ? 'completed' : 'processing',
                total: requests.length,
                completed,
                failed,
                pending: requests.length - completed - failed,
                results: requests.map(r => ({
                    requestId: r.requestId,
                    url: r.url,
                    status: r.status,
                    creditsUsed: r.creditsUsed,
                })),
            });
        }

        const request = await Request.findOne({
            requestId,
            userId: req.user._id,
        }).lean();

        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'NotFound',
                message: 'Request not found',
            });
        }

        if (request.status === 'completed') {
            const result = await Result.findOne({ requestId }).lean();
            return res.json({
                success: true,
                requestId,
                status: 'completed',
                data: result?.formattedOutput || result?.extractedData || result || {},
                creditsUsed: request.creditsUsed,
                latencyMs: request.latencyMs,
            });
        }

        if (request.status === 'failed') {
            return res.json({
                success: false,
                requestId,
                status: 'failed',
                error: request.errorMessage || 'Request failed',
                creditsUsed: 0,
                latencyMs: request.latencyMs,
            });
        }

        // Failsafe: Check Redis directly in case QueueEvent listener missed the completion event
        const { getRedisConnection } = require('../queue/connection');
        const redis = getRedisConnection();
        const cached = await redis.get(`result:${requestId}`);
        if (cached) {
            const result = JSON.parse(cached);
            // Determine actual status from the result — don't blindly assume completed
            const isSuccess = result.success !== false && result.statusCode >= 200 && result.statusCode < 400;
            const finalStatus = isSuccess ? 'completed' : 'failed';
            const finalCredits = isSuccess ? (result.credits_used || 1) : 0;

            // Lazily update DB with the CORRECT status
            await Request.updateOne(
                { requestId, status: { $in: ['queued', 'processing'] } },
                {
                    status: finalStatus,
                    creditsUsed: finalCredits,
                    latencyMs: result.latencyMs,
                    errorMessage: isSuccess ? null : (result.error || `HTTP ${result.statusCode}`),
                    completedAt: new Date(),
                }
            ).catch(() => { });

            return res.json({
                success: isSuccess,
                requestId,
                status: finalStatus,
                data: isSuccess ? (result.formattedOutput || result.extractedData || result.data || result) : undefined,
                error: isSuccess ? undefined : (result.error || `HTTP ${result.statusCode}`),
                blocked: result.blocked || false,
                creditsUsed: finalCredits,
                latencyMs: result.latencyMs,
            });
        }

        res.json({
            success: true,
            requestId,
            status: request.status,
            queuedAt: request.createdAt,
            startedAt: request.startedAt,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'PollError', message: err.message });
    }
});

/**
 * Wait for a scrape result (polling Redis).
 */
async function waitForResult(requestId, timeout) {
    const { getRedisConnection } = require('../queue/connection');
    const redis = getRedisConnection();
    const start = Date.now();
    const pollInterval = 500;  // 500ms

    while (Date.now() - start < timeout) {
        const cached = await redis.get(`result:${requestId}`);
        if (cached) {
            return JSON.parse(cached);
        }

        const request = await Request.findOne({ requestId }).lean();
        if (request?.status === 'completed') {
            const result = await Result.findOne({ requestId }).lean();
            return {
                success: true,
                statusCode: 200,
                latencyMs: request.latencyMs,
                credits_used: request.creditsUsed,
                data: result?.formattedOutput || result?.extractedData || result || {},
            };
        }
        if (request?.status === 'failed') {
            throw new Error(request.errorMessage || 'Scrape failed');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;  // Timeout
}

module.exports = router;
