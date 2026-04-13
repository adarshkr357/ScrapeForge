// ================================================================
// Service: Webhook Delivery
// ================================================================
const crypto = require('crypto');
const { Worker } = require('bullmq');
const { getRedisConnection } = require('../queue/connection');
const Webhook = require('../models/Webhook');
const { isPrivateIP } = require('../middleware/ssrfGuard');

/**
 * Deliver webhook payload to user's endpoint.
 * Features: HMAC signing, retry with backoff, SSRF protection.
 */
async function deliverWebhook(webhookUrl, payload, headers = {}, secret = null) {
  // SSRF check
  try {
    const url = new URL(webhookUrl);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) || isPrivateIP(url.hostname)) {
      throw new Error(`Blocked private webhook URL: ${webhookUrl}`);
    }
  } catch (err) {
    if (err.message.includes('Blocked')) throw err;
  }

  const body = JSON.stringify(payload);

  // Build headers
  const deliveryHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'ScrapeForge-Webhook/1.0',
    'X-ScrapeForge-Event': payload.event || 'scrape.completed',
    'X-ScrapeForge-Delivery-Id': crypto.randomUUID(),
    'X-ScrapeForge-Timestamp': Date.now().toString(),
    ...headers,
  };

  // HMAC signature if secret provided
  if (secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    deliveryHeaders['X-ScrapeForge-Signature'] = `sha256=${signature}`;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: deliveryHeaders,
    body,
    signal: AbortSignal.timeout(15000),  // 15s timeout
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
  }

  return {
    statusCode: response.status,
    deliveryId: deliveryHeaders['X-ScrapeForge-Delivery-Id'],
  };
}

/**
 * Start the webhook delivery worker.
 * Processes jobs from the webhook queue.
 */
function startWebhookWorker() {
  const worker = new Worker('webhook', async (job) => {
    const { webhookUrl, payload, headers, secret, webhookId } = job.data;

    const result = await deliverWebhook(webhookUrl, payload, headers, secret);

    // Update webhook stats
    if (webhookId) {
      await Webhook.findOneAndUpdate(
        { webhookId },
        {
          lastDeliveredAt: new Date(),
          lastDeliveryStatus: result.statusCode,
          $inc: { totalDeliveries: 1 },
        }
      );
    }

    return result;
  }, {
    connection: getRedisConnection(),
    concurrency: 20,
    limiter: { max: 50, duration: 1000 },  // Max 50/sec
  });

  worker.on('failed', async (job, err) => {
    console.error(`[Webhook] Delivery failed (attempt ${job.attemptsMade}):`, err.message);

    if (job.data.webhookId) {
      await Webhook.findOneAndUpdate(
        { webhookId: job.data.webhookId },
        { $inc: { totalFailures: 1 } }
      );
    }
  });

  worker.on('completed', (job) => {
    console.log(`[Webhook] Delivered: ${job.data.webhookUrl}`);
  });

  return worker;
}

module.exports = { deliverWebhook, startWebhookWorker };
