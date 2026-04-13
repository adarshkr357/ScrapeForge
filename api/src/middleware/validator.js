// ================================================================
// Middleware: Request Validator (Zod schemas)
// ================================================================
const { z } = require('zod');

// ── Scrape Request Schema ──
const scrapeSchema = z.object({
  url: z.string().url('Invalid URL format'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),

  // ── Scraper Engine Selection ──
  // 'auto' = SmartRouter decides based on domain intelligence (default)
  // 'http' = Python httpx — fastest, for static pages (200 concurrent)
  // 'browser' = Python undetected-chromedriver — Selenium stealth, best for anti-bot bypass
  // 'node-browser' = Node.js Playwright — JS rendering, screenshots, PDF, scenarios
  scraper_type: z.enum(['auto', 'http', 'browser', 'node-browser']).default('auto'),

  render_js: z.boolean().default(false),
  wait_for_selector: z.string().optional(),
  wait_for_delay: z.number().int().min(0).max(30000).optional(),
  block_resources: z.array(z.enum(['image', 'font', 'media', 'stylesheet', 'script', 'xhr'])).optional(),
  viewport: z.object({
    width: z.number().int().min(320).max(3840).default(1920),
    height: z.number().int().min(240).max(2160).default(1080),
  }).optional(),
  device: z.enum(['desktop', 'mobile', 'tablet']).default('desktop'),
  js_scenario: z.array(z.object({
    action: z.string(),
    selector: z.string().optional(),
    value: z.string().optional(),
    timeout: z.number().optional(),
    delay: z.number().optional(),
    direction: z.string().optional(),
    count: z.number().optional(),
    key: z.string().optional(),
    script: z.string().optional(),
    expression: z.string().optional(),
    url: z.string().optional(),
    max_scrolls: z.number().optional(),
    full_page: z.boolean().optional(),
    format: z.string().optional(),
    button: z.string().optional(),
    human_typing: z.boolean().optional(),
    cookies: z.array(z.any()).optional(),
    file_path: z.string().optional(),
    text: z.string().optional(),
    condition: z.string().optional(),
    attribute: z.string().optional(),
    stop_selector: z.string().optional(),
  })).optional(),
  js_instructions: z.union([z.string(), z.array(z.record(z.any()))]).optional(),

  // ── Proxy Configuration ──
  custom_proxy: z.string().optional(),
  proxy_type: z.enum(['none', 'datacenter', 'residential', 'isp', 'premium', 'mobile']).default('none'),
  country_code: z.string().length(2).optional(),
  proxy_country: z.string().length(2).optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  premium_proxy: z.boolean().optional(),
  sticky_session: z.boolean().optional(),
  session_id: z.string().optional(),
  session_ttl: z.number().int().min(1).max(3600).optional(),

  // ── Stealth Mode ──
  // 'none' (Level 0) = No stealth. Raw request. Fastest.
  // 'basic' (Level 1) = Header rotation. Random User-Agent, Accept-Language, sec-ch-ua.
  // 'standard' (Level 2) = Header rotation + TLS fingerprint mimicry (JA3/JA4 via curl_cffi).
  // 'advanced' (Level 3) = All above + residential proxy + behavioral simulation (mouse, scroll).
  // 'maximum' (Level 4) = All above + premium proxy + CAPTCHA solving + full browser fingerprint rotation.
  // 'adaptive' = Auto-selected based on domain intelligence from past scrape outcomes.
  stealth_mode: z.enum(['none', 'basic', 'standard', 'advanced', 'maximum', 'adaptive']).default('none'),

  bypass_captcha: z.boolean().optional(),
  custom_headers: z.record(z.string()).optional(),
  custom_cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string().optional(),
    path: z.string().optional(),
  })).optional(),

  // ── Extraction ──
  extraction_rules: z.any().optional(),
  xpath_rules: z.record(z.string()).optional(),
  regex_rules: z.record(z.string()).optional(),
  css_extractor: z.string().optional(),
  autoparse: z.boolean().optional(),
  json_response: z.boolean().optional(),
  original_status: z.boolean().optional(),
  allowed_status_codes: z.string().optional(),

  // ── Output ──
  output_format: z.enum(['json', 'markdown', 'html', 'raw_html', 'text', 'csv', 'ndjson', 'xml', 'rss', 'screenshot', 'pdf', 'links']).default('json'),
  markdown_options: z.object({
    include_links: z.boolean().default(true),
    include_images: z.boolean().default(false),
    main_content_only: z.boolean().default(true),
  }).optional(),
  screenshot: z.object({
    enabled: z.boolean().default(false),
    full_page: z.boolean().default(true),
    format: z.enum(['png', 'jpeg', 'webp']).default('png'),
    quality: z.number().min(1).max(100).default(90),
    selector: z.string().optional(),
  }).optional(),
  pdf: z.boolean().default(false),
  raw_html: z.boolean().default(false),

  // ── Retry & Escalation ──
  max_retries: z.number().int().min(0).max(10).default(3),
  retry_backoff: z.enum(['exponential', 'exponential_jitter', 'linear', 'fixed']).default('exponential_jitter'),
  retry_on: z.array(z.union([z.number(), z.string()])).optional(),
  timeout: z.number().int().min(1000).max(120000).default(30000),
  auto_escalate: z.boolean().default(true),

  // ── Webhooks ──
  webhook_url: z.string().url().optional(),
  webhook_headers: z.record(z.string()).optional(),
}).strict();

// ── Batch Scrape Schema ──
const batchScrapeSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(5000),
  options: scrapeSchema.omit({ url: true }).optional(),
  webhook_url: z.string().url().optional(),
  webhook_headers: z.record(z.string()).optional(),
});

// ── Crawl Schema ──
const crawlSchema = z.object({
  url: z.string().url(),
  max_pages: z.number().int().min(1).max(50000).default(100),
  max_depth: z.number().int().min(1).max(20).default(3),
  include_patterns: z.array(z.string()).optional(),
  exclude_patterns: z.array(z.string()).optional(),
  respect_robots_txt: z.boolean().default(true),
  follow_sitemaps: z.boolean().default(true),
  allow_subdomains: z.boolean().default(false),
  scrape_options: z.any().optional(),
  adaptive_mode: z.object({
    enabled: z.boolean().default(false),
    query: z.string().optional(),
    stop_when_sufficient: z.boolean().default(true),
    information_threshold: z.number().min(0).max(1).default(0.85),
  }).optional(),
  deduplication: z.enum(['content_hash', 'url', 'none']).default('content_hash'),
  rate_limit: z.object({
    requests_per_second: z.number().min(0.1).max(50).default(5),
  }).optional(),
  webhook_url: z.string().url().optional(),
});

// ── Search / SERP Schema ──
const searchSchema = z.object({
  engine: z.enum(['google', 'bing', 'yahoo', 'duckduckgo', 'yandex', 'baidu', 'naver']).default('google'),
  query: z.string().min(1).max(500),
  type: z.enum(['web', 'images', 'news', 'shopping', 'maps', 'scholar', 'videos']).default('web'),
  country: z.string().length(2).optional(),
  language: z.string().min(2).max(5).optional(),
  location: z.string().optional(),
  device: z.enum(['desktop', 'mobile', 'tablet']).default('desktop'),
  num_results: z.number().int().min(1).max(100).default(10),
  page: z.number().int().min(1).default(1),
  parse: z.boolean().default(true),
});

// ── Map Schema ──
const mapSchema = z.object({
  url: z.string().url(),
  include_patterns: z.array(z.string()).optional(),
  max_pages: z.number().int().min(1).max(50000).default(10000),
  follow_sitemaps: z.boolean().default(true),
  discover_subdomains: z.boolean().default(false),
});

// ── Auth Schemas ──
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Schema Map ──
const schemas = {
  'POST /scrape': scrapeSchema,
  'POST /scrape/batch': batchScrapeSchema,
  'POST /crawl': crawlSchema,
  'POST /map': mapSchema,
  'POST /search': searchSchema,
  'POST /search/fast': searchSchema,
  'POST /auth/register': registerSchema,
  'POST /auth/login': loginSchema,
};

/**
 * Validation middleware factory.
 * @param {string} schemaKey - The schema to validate against
 */
function validate(schemaKey) {
  return (req, res, next) => {
    const schema = schemas[schemaKey];
    if (!schema) return next();

    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Request validation failed',
        details: errors,
      });
    }

    req.validatedBody = result.data;
    next();
  };
}

module.exports = { validate, schemas, scrapeSchema, crawlSchema, searchSchema };
