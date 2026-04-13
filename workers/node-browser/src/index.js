// ================================================================
// Node.js Browser Worker — Playwright-based JS renderer
// ================================================================
// Handles: render_js, js_scenario, screenshot, PDF
// Concurrency: ~50 concurrent browser tabs

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { chromium } = require('playwright');
const crypto = require('crypto');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '50', 10);

const connection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
}

async function processJob(job) {
  const { requestId, url, params = {}, routing = {} } = job.data;
  const start = Date.now();
  let context = null;
  let page = null;

  try {
    const browserInstance = await getBrowser();

    // Create context with fingerprint
    const viewport = params.viewport || { width: 1920, height: 1080 };
    context = await browserInstance.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      userAgent: routing.fingerprint?.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'en-US',
      timezoneId: routing.fingerprint?.timezone || 'America/New_York',
      ignoreHTTPSErrors: true,
    });

    page = await context.newPage();

    // Block resources if requested
    if (params.block_resources?.length > 0) {
      const typeMap = {
        image: 'image',
        font: 'font',
        media: 'media',
        stylesheet: 'stylesheet',
        script: 'script',
        xhr: 'xhr',
      };
      const blocked = params.block_resources.map(r => typeMap[r] || r);
      await page.route('**/*', (route) => {
        if (blocked.includes(route.request().resourceType())) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    // Navigate
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: params.timeout || 30000,
    });

    // Wait for selector
    if (params.wait_for_selector) {
      await page.waitForSelector(params.wait_for_selector, {
        timeout: params.wait_for_delay || 10000,
      });
    }

    // Wait for delay
    if (params.wait_for_delay) {
      await page.waitForTimeout(params.wait_for_delay);
    }

    // Execute JS scenarios (Legacy)
    if (params.js_scenario?.length > 0) {
      await executeScenario(page, params.js_scenario);
    }

    // Execute JS instructions (ZenRows parity)
    if (params.js_instructions) {
      try {
        let instructions = params.js_instructions;
        if (typeof instructions === 'string') instructions = JSON.parse(instructions);
        await executeJSInstructions(page, instructions);
      } catch (e) {
        console.error(`[NodeBrowser] Failed to execute js_instructions: ${e.message}`);
      }
    }

    // Get HTML
    const html = await page.content();

    // Screenshot
    let screenshotBase64 = null;
    if (params.screenshot?.enabled) {
      const ssOpts = {
        fullPage: params.screenshot.full_page !== false,
        type: params.screenshot.format || 'png',
        quality: params.screenshot.format === 'jpeg' ? (params.screenshot.quality || 90) : undefined,
      };
      if (params.screenshot.selector) {
        const el = await page.$(params.screenshot.selector);
        if (el) {
          screenshotBase64 = (await el.screenshot(ssOpts)).toString('base64');
        }
      } else {
        screenshotBase64 = (await page.screenshot(ssOpts)).toString('base64');
      }
    }

    // PDF
    let pdfBase64 = null;
    if (params.pdf) {
      pdfBase64 = (await page.pdf({ format: 'A4', printBackground: true })).toString('base64');
    }

    // Extract links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => h.startsWith('http'))
        .slice(0, 500);
    });

    const title = await page.title();
    const latencyMs = Date.now() - start;
    const contentHash = crypto.createHash('sha256').update(html).digest('hex');

    const result = {
      requestId,
      success: true,
      url: page.url(),
      statusCode: response?.status() || 200,
      html,
      rawHtml: html,
      contentHash,
      links,
      screenshotBase64,
      pdfBase64,
      metadata: {
        title,
        contentLength: html.length,
        loadTimeMs: latencyMs,
      },
      latencyMs,
    };

    // Store result in Redis for API polling
    await connection.setex(`result:${requestId}`, 3600, JSON.stringify(result));

    return result;
  } catch (err) {
    return {
      requestId,
      success: false,
      error: err.message,
      latencyMs: Date.now() - start,
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

async function executeScenario(page, steps) {
  for (const step of steps) {
    switch (step.action) {
      case 'click':
        await page.click(step.selector, { timeout: step.timeout || 5000 });
        break;
      case 'type':
        if (step.human_typing) {
          await page.type(step.selector, step.value || '', { delay: Math.random() * 100 + 50 });
        } else {
          await page.fill(step.selector, step.value || '');
        }
        break;
      case 'wait_for_selector':
        await page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
        break;
      case 'wait_for_delay':
        await page.waitForTimeout(step.delay || 1000);
        break;
      case 'scroll':
        if (step.selector) {
          await page.evaluate((sel) => {
            document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' });
          }, step.selector);
        } else {
          await page.evaluate(() => window.scrollBy(0, 500));
        }
        break;
      case 'infinite_scroll':
        await infiniteScroll(page, step.max_scrolls || 10, step.stop_selector);
        break;
      case 'select':
        await page.selectOption(step.selector, step.value);
        break;
      case 'hover':
        await page.hover(step.selector);
        break;
      case 'press':
        await page.press(step.selector || 'body', step.key);
        break;
      case 'screenshot':
        break;  // Handled at top level
      case 'evaluate':
        await page.evaluate(step.expression || step.script);
        break;
      case 'wait_for_navigation':
        await page.waitForNavigation({ timeout: step.timeout || 10000 });
        break;
      default:
        console.warn(`[Scenario] Unknown action: ${step.action}`);
    }

    // Delay between steps
    if (step.delay) {
      await page.waitForTimeout(step.delay);
    }
  }
}

async function infiniteScroll(page, maxScrolls, stopSelector) {
  for (let i = 0; i < maxScrolls; i++) {
    const prevHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    if (stopSelector) {
      const found = await page.$(stopSelector);
      if (found) break;
    }

    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === prevHeight) break;
  }
}

async function executeJSInstructions(page, instructions) {
  for (const step of instructions) {
    if (step.click) {
      // Supports string matching XPath if starting with '//'
      if (step.click.startsWith('//')) {
        await page.click(`xpath=${step.click}`);
      } else {
        await page.click(step.click);
      }
    } else if (step.wait_for) {
      if (step.wait_for.startsWith('//')) {
        await page.waitForSelector(`xpath=${step.wait_for}`);
      } else {
        await page.waitForSelector(step.wait_for);
      }
    } else if (step.wait) {
      await page.waitForTimeout(step.wait);
    } else if (step.wait_event) {
      await page.waitForLoadState(step.wait_event);
    } else if (step.fill && Array.isArray(step.fill)) {
      if (step.fill[0].startsWith('//')) {
        await page.fill(`xpath=${step.fill[0]}`, step.fill[1]);
      } else {
        await page.fill(step.fill[0], step.fill[1]);
      }
    } else if (step.check) {
      await page.check(step.check.startsWith('//') ? `xpath=${step.check}` : step.check);
    } else if (step.uncheck) {
      await page.uncheck(step.uncheck.startsWith('//') ? `xpath=${step.uncheck}` : step.uncheck);
    } else if (step.select_option && Array.isArray(step.select_option)) {
      await page.selectOption(
        step.select_option[0].startsWith('//') ? `xpath=${step.select_option[0]}` : step.select_option[0],
        step.select_option[1]
      );
    } else if (step.scroll_y) {
      await page.evaluate((y) => window.scrollBy(0, y), step.scroll_y);
    } else if (step.scroll_x) {
      await page.evaluate((x) => window.scrollBy(x, 0), step.scroll_x);
    } else if (step.hover) {
      await page.hover(step.hover.startsWith('//') ? `xpath=${step.hover}` : step.hover);
    } else if (step.evaluate) {
      await page.evaluate(step.evaluate);
    }
  }
}

// ── Start BullMQ Worker ──
const worker = new Worker('scrape-node-browser', processJob, {
  connection,
  concurrency: CONCURRENCY,
  limiter: { max: CONCURRENCY, duration: 1000 },
});

worker.on('completed', (job) => {
  console.log(`[NodeBrowser] Completed: ${job.data.requestId}`);
});

worker.on('failed', (job, err) => {
  console.error(`[NodeBrowser] Failed: ${job?.data?.requestId}`, err.message);
});

console.log(`🚀 ScrapeForge Node Browser Worker started (concurrency: ${CONCURRENCY})`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM — closing worker...');
  await worker.close();
  if (browser) await browser.close();
  process.exit(0);
});
