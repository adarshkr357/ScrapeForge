import { useState } from 'react';
import { BookOpen, Code, Key, Globe, Zap, Search, Link, FileJson, Terminal, ChevronRight, Database, Clock, Shield, Webhook, Calendar, Server, CreditCard, Settings } from 'lucide-react';

const API_BASE = `${window.location.origin}/api/v1`;

const sections = [
  { id: 'auth', label: 'Authentication', icon: Key },
  { id: 'scrape', label: 'Scrape API', icon: Zap },
  { id: 'batch', label: 'Batch Scrape', icon: Server },
  { id: 'params', label: 'All Parameters', icon: FileJson },
  { id: 'js-instructions', label: 'JS Instructions', icon: Code },
  { id: 'crawl', label: 'Crawl API', icon: Globe },
  { id: 'search', label: 'SERP API', icon: Search },
  { id: 'extract', label: 'Extract / Screenshot / PDF', icon: Terminal },
  { id: 'datasets', label: 'Datasets API', icon: Database },
  { id: 'schedules', label: 'Schedules API', icon: Calendar },
  { id: 'webhooks', label: 'Webhooks API', icon: Webhook },
  { id: 'proxy', label: 'Proxy Health', icon: Shield },
  { id: 'account', label: 'Account API', icon: Settings },
  { id: 'credits', label: 'Credit Pricing', icon: CreditCard },
  { id: 'rate-limits', label: 'Rate Limits', icon: Clock },
  { id: 'responses', label: 'Response Format', icon: Terminal },
  { id: 'errors', label: 'Error Codes', icon: Link },
  { id: 'sdks', label: 'SDK Quick Start', icon: Code },
];

function CodeBlock({ code, language }) {
  return (
    <div style={{ position: 'relative' }}>
      {language && (
        <div style={{ position: 'absolute', top: 0, left: 0, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--sf-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {language}
        </div>
      )}
      <pre className="code-block" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: language ? '32px 16px 16px' : 16 }}>
        {code}
      </pre>
      <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', top: 8, right: 8, background: 'var(--sf-bg-card)', border: '1px solid var(--sf-border)', fontSize: 11 }}
        onClick={() => { navigator.clipboard.writeText(code); }}>
        Copy
      </button>
    </div>
  );
}

function Param({ name, type, required, desc, def }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr auto',
      gap: 12, padding: '14px 16px',
      borderBottom: '1px solid var(--sf-border)',
      alignItems: 'start',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <code style={{
          fontSize: 13, fontWeight: 700, color: 'var(--sf-text-primary)',
          background: 'var(--sf-bg-elevated)', padding: '3px 8px', borderRadius: 5,
          fontFamily: "'JetBrains Mono', monospace",
        }}>{name}</code>
        <span style={{ fontSize: 12, color: 'var(--sf-success)', fontWeight: 500 }}>[{type}]</span>
        {def && <span style={{ fontSize: 12, color: 'var(--sf-danger)', fontWeight: 500 }}>({def})</span>}
        {required && <span className="badge badge-danger" style={{ fontSize: 10, padding: '2px 6px' }}>Required</span>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--sf-text-secondary)', lineHeight: 1.5 }}>
        {desc}
      </div>
      <div style={{ fontSize: 12, color: 'var(--sf-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        Learn more ›
      </div>
    </div>
  );
}

function ParamTable({ children }) {
  return (
    <div style={{ marginBottom: 24, marginTop: 12, border: '1px solid var(--sf-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--sf-bg-card)' }}>
      {children}
    </div>
  );
}

function Endpoint({ method, path, desc }) {
  const colors = {
    POST: { bg: 'rgba(16,185,129,0.1)', text: '#10b981', border: 'rgba(16,185,129,0.3)' },
    GET: { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', border: 'rgba(99,102,241,0.3)' },
    PUT: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    DELETE: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  };
  const c = colors[method] || colors.GET;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, marginTop: 20,
      padding: '12px 16px', background: 'var(--sf-bg-card)',
      borderRadius: 10, border: '1px solid var(--sf-border)',
    }}>
      <span style={{
        background: c.bg, color: c.text, padding: '4px 12px', borderRadius: 6,
        fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
        border: `1px solid ${c.border}`, fontFamily: "'JetBrains Mono', monospace",
      }}>{method}</span>
      <code style={{ fontSize: 14, color: 'var(--sf-primary-light)', fontWeight: 600 }}>{path}</code>
      {desc && <span style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginLeft: 'auto' }}>{desc}</span>}
    </div>
  );
}

export default function ApiDocsPage() {
  const [activeSection, setActiveSection] = useState('auth');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">API Documentation</h1>
        <p className="page-subtitle">Complete reference for the ScrapeForge Universal Scraper API</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        {/* Sidebar */}
        <div className="glass-card-static" style={{ position: 'sticky', top: 20, alignSelf: 'start', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
          <nav>
            {sections.map(s => (
              <button key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '9px 12px', borderRadius: 8, border: 'none',
                  background: activeSection === s.id ? 'var(--sf-primary-bg)' : 'transparent',
                  color: activeSection === s.id ? 'var(--sf-primary-light)' : 'var(--sf-text-secondary)',
                  cursor: 'pointer', fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400,
                  textAlign: 'left', marginBottom: 2, fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}>
                <s.icon size={14} />
                {s.label}
                {activeSection === s.id && <ChevronRight size={12} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="glass-card-static">
          {/* ═══════════ AUTHENTICATION ═══════════ */}
          {activeSection === 'auth' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Authentication</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                All API requests require authentication via an API key. Include it in the header of every request.
              </p>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Header Authentication</h3>
              <CodeBlock code={`X-API-Key: sf_live_abc123...`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Bearer Token (Alternative)</h3>
              <CodeBlock code={`Authorization: Bearer <jwt_token>`} />

              <Endpoint method="POST" path="/api/v1/auth/register" desc="Create account" />
              <ParamTable>
                <Param name="email" type="string" required desc="Your email address" />
                <Param name="password" type="string" required desc="Minimum 8 characters" />
                <Param name="name" type="string" required desc="Display name" />
              </ParamTable>
              <CodeBlock code={`curl -X POST "${API_BASE}/auth/register" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "password": "securepass", "name": "John Doe"}'`} />

              <Endpoint method="POST" path="/api/v1/auth/login" desc="Get JWT token" />
              <ParamTable>
                <Param name="email" type="string" required desc="Account email" />
                <Param name="password" type="string" required desc="Account password" />
              </ParamTable>
              <CodeBlock code={`curl -X POST "${API_BASE}/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "password": "securepass"}'`} />
            </div>
          )}

          {/* ═══════════ SCRAPE API ═══════════ */}
          {activeSection === 'scrape' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Scrape API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                The core scraping endpoint. Supports static and JS-rendered pages with stealth modes, proxies, and extraction.
              </p>

              <Endpoint method="POST" path="/api/v1/scrape" desc="Scrape a single URL" />
              <ParamTable>
                <Param name="url" type="string" required desc="The URL to scrape" />
                <Param name="output_format" type="string" desc="json | markdown | html | raw_html | text | csv | links" def="json" />
                <Param name="render_js" type="boolean" desc="Enable JavaScript rendering" def="false" />
                <Param name="scraper_type" type="string" desc="auto | http | browser | node-browser" def="auto" />
                <Param name="stealth_mode" type="string" desc="none | basic | standard | advanced | maximum | adaptive" def="none" />
                <Param name="device" type="string" desc="desktop | mobile | tablet" def="desktop" />
                <Param name="proxy_type" type="string" desc="none | datacenter | residential | isp | premium | mobile" def="none" />
                <Param name="custom_proxy" type="string" desc="Custom proxy URL (http://user:pass@host:port)" />
                <Param name="js_instructions" type="array" desc="Array of JS instructions to execute (see JS Instructions)" />
                <Param name="webhook_url" type="string" desc="URL for async result delivery" />
                <Param name="timeout" type="number" desc="Request timeout in ms (1000–120000)" def="30000" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Quick Example</h3>
              <CodeBlock code={`curl -X POST "${API_BASE}/scrape" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "url": "https://example.com",
    "output_format": "markdown",
    "render_js": true,
    "stealth_mode": "adaptive",
    "scraper_type": "auto"
  }'`} />

              <Endpoint method="GET" path="/api/v1/scrape/:requestId" desc="Poll for async result" />
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>
                If a scrape request returns <code>status: "processing"</code>, poll this endpoint until <code>status: "completed"</code>.
              </p>
            </div>
          )}

          {/* ═══════════ BATCH SCRAPE ═══════════ */}
          {activeSection === 'batch' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Batch Scrape API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Scrape up to 5,000 URLs in a single request. All URLs share the same configuration options.
              </p>

              <Endpoint method="POST" path="/api/v1/scrape/batch" desc="Batch scrape multiple URLs" />
              <ParamTable>
                <Param name="urls" type="string[]" required desc="Array of URLs to scrape (1–5000)" />
                <Param name="options" type="object" desc="Shared scrape options (same as single scrape, minus url)" />
                <Param name="webhook_url" type="string" desc="Webhook for batch completion notification" />
              </ParamTable>

              <CodeBlock code={`curl -X POST "${API_BASE}/scrape/batch" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3"
    ],
    "options": {
      "output_format": "markdown",
      "stealth_mode": "standard"
    },
    "webhook_url": "https://your-server.com/batch-done"
  }'`} />
            </div>
          )}

          {/* ═══════════ ALL PARAMETERS ═══════════ */}
          {activeSection === 'params' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Complete Parameter Reference</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Every parameter accepted by the <code>POST /scrape</code> endpoint.
              </p>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Core Parameters</h3>
              <ParamTable>
                <Param name="url" type="string" required desc="Target URL to scrape" />
                <Param name="method" type="string" desc="HTTP method: GET | POST | PUT | DELETE | PATCH" def="GET" />
                <Param name="render_js" type="boolean" desc="Enable headless browser rendering" def="false" />
                <Param name="output_format" type="string" desc="json | markdown | html | raw_html | text | csv | ndjson | xml | rss | screenshot | pdf | links" def="json" />
                <Param name="scraper_type" type="string" desc="auto | http | browser | node-browser" def="auto" />
                <Param name="device" type="string" desc="desktop | mobile | tablet" def="desktop" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Stealth & Proxy</h3>
              <ParamTable>
                <Param name="stealth_mode" type="string" desc="none | basic | standard | advanced | maximum | adaptive" def="none" />
                <Param name="proxy_type" type="string" desc="none | datacenter | residential | isp | premium | mobile" def="none" />
                <Param name="custom_proxy" type="string" desc="Custom proxy: http://user:pass@host:port" />
                <Param name="country_code" type="string" desc="2-letter country code for geo-targeting (e.g. US, DE)" />
                <Param name="premium_proxy" type="boolean" desc="Force premium residential proxy" />
                <Param name="sticky_session" type="boolean" desc="Maintain same proxy IP across requests" />
                <Param name="session_id" type="string" desc="Custom session identifier for sticky proxies" />
                <Param name="session_ttl" type="number" desc="Session time-to-live in seconds (1–3600)" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Wait & Rendering</h3>
              <ParamTable>
                <Param name="wait_for_selector" type="string" desc="Wait for CSS selector before capturing" />
                <Param name="wait_for_delay" type="number" desc="Wait N ms after page load (0–30000)" />
                <Param name="block_resources" type="string[]" desc="Block: image | font | media | stylesheet | script | xhr" />
                <Param name="viewport" type="object" desc='{"width": 1920, "height": 1080}' />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Extraction</h3>
              <ParamTable>
                <Param name="css_extractor" type="string" desc='JSON CSS extraction rules: {"title": "h1", "links": ["a @href"]}' />
                <Param name="extraction_rules" type="object" desc="Advanced extraction configuration" />
                <Param name="xpath_rules" type="object" desc='XPath rules: {"title": "//h1/text()"}' />
                <Param name="regex_rules" type="object" desc='Regex rules: {"emails": "[a-zA-Z0-9._%+-]+@.+"}' />
                <Param name="autoparse" type="boolean" desc="Auto-detect and parse structured data" />
                <Param name="json_response" type="boolean" desc="Force JSON response body" />
                <Param name="original_status" type="boolean" desc="Return original HTTP status code" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Screenshots & PDF</h3>
              <ParamTable>
                <Param name="screenshot" type="object" desc='{"enabled": true, "full_page": true, "format": "png", "quality": 90}' />
                <Param name="pdf" type="boolean" desc="Generate PDF of the page" def="false" />
                <Param name="raw_html" type="boolean" desc="Return raw unprocessed HTML" def="false" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Markdown Options</h3>
              <ParamTable>
                <Param name="markdown_options.include_links" type="boolean" desc="Include hyperlinks in markdown" def="true" />
                <Param name="markdown_options.include_images" type="boolean" desc="Include image tags" def="false" />
                <Param name="markdown_options.main_content_only" type="boolean" desc="Extract only main content (no nav/footer)" def="true" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Custom Headers & Cookies</h3>
              <ParamTable>
                <Param name="custom_headers" type="object" desc='{"Accept-Language": "en-US", "Referer": "..."}' />
                <Param name="custom_cookies" type="array" desc='[{"name": "session", "value": "abc", "domain": ".example.com"}]' />
                <Param name="bypass_captcha" type="boolean" desc="Enable automatic CAPTCHA solving (+10 credits)" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Retry & Webhooks</h3>
              <ParamTable>
                <Param name="max_retries" type="number" desc="Max retry attempts (0–10)" def="3" />
                <Param name="retry_backoff" type="string" desc="exponential | exponential_jitter | linear | fixed" def="exponential_jitter" />
                <Param name="timeout" type="number" desc="Request timeout in ms (1000–120000)" def="30000" />
                <Param name="auto_escalate" type="boolean" desc="Auto-escalate engine/stealth on failure" def="true" />
                <Param name="webhook_url" type="string" desc="Webhook URL for async results" />
                <Param name="webhook_headers" type="object" desc="Custom headers sent with webhook" />
              </ParamTable>
            </div>
          )}

          {/* ═══════════ JS INSTRUCTIONS ═══════════ */}
          {activeSection === 'js-instructions' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>JS Instructions</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 6 }}>
                Execute an ordered sequence of browser automation actions before content capture. Requires <code>render_js: true</code>.
                Uses the same JSON array format as ZenRows — fully compatible.
              </p>
              <p style={{ color: 'var(--sf-text-muted)', fontSize: 13, marginBottom: 20 }}>
                How it works: <strong>Page loads</strong> → <strong>Global wait / wait_for execute</strong> → <strong>JS Instructions run in order</strong> → <strong>DOM updates settle</strong> → <strong>Final content captured</strong>
              </p>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Basic Usage</h3>
              <CodeBlock code={`{
  "url": "https://example.com",
  "render_js": true,
  "js_instructions": [
    {"click": ".load-more-button"},
    {"wait": 2000},
    {"wait_for": ".results-loaded"}
  ]
}`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Available Instructions</h3>

              {/* Click */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-info" style={{ fontSize: 12 }}>click</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Click an element — supports CSS selectors and XPath</span>
                </div>
                <CodeBlock code={`[
  {"click": ".read-more-button"},
  {"click": "#submit-btn"},
  {"click": "button[data-action='load-more']"},
  {"click": "//button[text()='Accept']"}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  Use cases: Expanding collapsed sections, accepting cookie banners, triggering infinite scroll, navigating pagination.
                </p>
              </div>

              {/* wait_for */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-success" style={{ fontSize: 12 }}>wait_for</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Wait until a CSS selector or XPath appears in the DOM</span>
                </div>
                <CodeBlock code={`[
  {"wait_for": ".dynamic-content"},
  {"wait_for": "#ajax-loaded-section"},
  {"wait_for": "[data-loaded='true']"},
  {"wait_for": "//div[@class='content' and @data-loaded='true']"}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  Use cases: AJAX-loaded content, animations, SPAs, ensuring forms are rendered before interaction.
                </p>
              </div>

              {/* wait */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-warning" style={{ fontSize: 12 }}>wait</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Pause execution for N milliseconds</span>
                </div>
                <CodeBlock code={`[
  {"wait": 1000},
  {"wait": 5000},
  {"wait": 500}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  Max: <code>{"{"}"wait": 10000{"}"}</code> (10 seconds). Use when no loading indicator exists or after form submissions.
                </p>
              </div>

              {/* wait_event */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-purple" style={{ fontSize: 12 }}>wait_event</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Wait for a browser lifecycle event</span>
                </div>
                <CodeBlock code={`[
  {"wait_event": "networkidle"},
  {"wait_event": "networkalmostidle"},
  {"wait_event": "load"},
  {"wait_event": "domcontentloaded"}
]`} />
                <div style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  <strong style={{ color: 'var(--sf-text-secondary)' }}>networkidle</strong> — no requests for 500ms (best for SPAs)<br />
                  <strong style={{ color: 'var(--sf-text-secondary)' }}>networkalmostidle</strong> — max 2 requests for 500ms<br />
                  <strong style={{ color: 'var(--sf-text-secondary)' }}>load</strong> — page load event (all resources including images)<br />
                  <strong style={{ color: 'var(--sf-text-secondary)' }}>domcontentloaded</strong> — DOM parsed (faster than load)
                </div>
              </div>

              {/* fill */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-info" style={{ fontSize: 12 }}>fill</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Type text into an input field — array of [selector, value]</span>
                </div>
                <CodeBlock code={`[
  {"fill": ["#username", "john_doe"]},
  {"fill": ["input[name='email']", "user@example.com"]},
  {"fill": [".search-box", "scraping tools"]},
  {"fill": ["//input[@placeholder='Enter email']", "test@test.com"]}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  Works with: text inputs, email fields, password fields, textareas, number inputs.
                </p>
              </div>

              {/* check / uncheck */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-success" style={{ fontSize: 12 }}>check / uncheck</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Check or uncheck a checkbox or radio button</span>
                </div>
                <CodeBlock code={`[
  {"check": "#agree-terms"},
  {"uncheck": "#newsletter-signup"},
  {"check": "input[name='payment'][value='credit']"}
]`} />
              </div>

              {/* select_option */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-warning" style={{ fontSize: 12 }}>select_option</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Select a dropdown option — array of [selector, value]</span>
                </div>
                <CodeBlock code={`[
  {"select_option": ["#country-select", "US"]},
  {"select_option": [".size-dropdown", "large"]},
  {"select_option": ["select[name='category']", "electronics"]}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  ⚠️ The second parameter must match the HTML <code>value</code> attribute, not the visible text.
                </p>
              </div>

              {/* scroll_y / scroll_x */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-secondary" style={{ fontSize: 12 }}>scroll_y / scroll_x</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Scroll page by pixels (negative = reverse direction)</span>
                </div>
                <CodeBlock code={`[
  {"scroll_y": 1000},
  {"scroll_y": -500},
  {"scroll_x": 800},
  {"scroll_x": -400}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  Use for: infinite scroll, lazy-loaded images, horizontal carousels.
                </p>
              </div>

              {/* evaluate */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-danger" style={{ fontSize: 12 }}>evaluate</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Execute arbitrary JavaScript in the browser context</span>
                </div>
                <CodeBlock code={`[
  {"evaluate": "document.querySelector('.modal').style.display = 'none';"},
  {"evaluate": "window.scrollTo(0, document.body.scrollHeight);"},
  {"evaluate": "document.querySelectorAll('.expand-button').forEach(btn => btn.click());"},
  {"evaluate": "document.querySelector('.load-more').scrollIntoView();"}
]`} />
                <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
                  Use cases: Removing overlays/cookie banners, triggering custom events, collecting JS variables, bypassing client-side restrictions.
                </p>
              </div>

              {/* solve_captcha */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-danger" style={{ fontSize: 12 }}>solve_captcha</span>
                  <span style={{ color: 'var(--sf-text-secondary)', fontSize: 13 }}>Solve CAPTCHA challenges (+10 credits per solve)</span>
                </div>
                <CodeBlock code={`[
  {"wait": 3000},
  {"solve_captcha": {"type": "recaptcha"}},
  {"wait": 2000}
]

// Supported types:
// - "recaptcha"            → reCAPTCHA v2 and v3
// - "cloudflare_turnstile" → Cloudflare Turnstile
// Options: {"solve_inactive": true}`} />
              </div>

              {/* iframe instructions */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>Iframe Instructions</h3>
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 13, marginBottom: 12 }}>
                All standard instructions have iframe equivalents prefixed with <code>frame_</code>. The selector array adds the iframe selector as the first element.
              </p>
              <CodeBlock code={`[
  {"frame_click": ["#payment-iframe", ".submit-button"]},
  {"frame_wait_for": ["#content-iframe", ".loaded-content"]},
  {"frame_fill": ["#form-iframe", "#email", "user@example.com"]},
  {"frame_check": ["#options-iframe", "#agree-checkbox"]},
  {"frame_uncheck": ["#settings-iframe", "#notifications"]},
  {"frame_select_option": ["#dropdown-iframe", "#country", "US"]},
  {"frame_evaluate": ["iframe-name", "document.body.style.color = 'red';"]},
  {"frame_reveal": "#payment-iframe"}
]`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>Using XPath Selectors</h3>
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 13, marginBottom: 12 }}>
                Any selector starting with <code>//</code> is automatically treated as XPath.
              </p>
              <CodeBlock code={`[
  {"click": "//button[text()='Submit']"},
  {"wait_for": "//div[@class='content' and @data-loaded='true']"},
  {"fill": ["//input[@placeholder='Enter email']", "user@example.com"]},
  {"click": "//a[contains(@class, 'next-page')]"}
]`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>Debugging with json_response</h3>
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 13, marginBottom: 12 }}>
                Add <code>json_response: true</code> to get a debug report of instruction execution in the response.
              </p>
              <CodeBlock code={`{
  "url": "https://example.com",
  "render_js": true,
  "json_response": true,
  "js_instructions": [
    {"click": ".button"},
    {"wait_for": ".result"}
  ]
}

// Response includes:
{
  "instructions_duration": 5041,
  "instructions_executed": 2,
  "instructions_succeeded": 1,
  "instructions_failed": 1,
  "instructions": [
    {"instruction": "click", "params": {"selector": ".button"}, "success": true, "duration": 150},
    {"instruction": "wait_for", "params": {"selector": ".result"}, "success": false, "duration": 30000}
  ]
}`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>Full Workflow Examples</h3>

              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--sf-text-secondary)' }}>Login and Scrape Protected Content</h4>
              <CodeBlock code={`{
  "url": "https://example.com/login",
  "render_js": true,
  "js_instructions": [
    {"wait_for": "#email"},
    {"fill": ["#email", "user@example.com"]},
    {"fill": ["#password", "secret123"]},
    {"click": "button[type='submit']"},
    {"wait_event": "networkidle"},
    {"wait_for": ".dashboard"}
  ],
  "output_format": "html"
}`} />

              <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--sf-text-secondary)' }}>Multi-Page Pagination Scraping</h4>
              <CodeBlock code={`{
  "url": "https://shop.example.com/products",
  "render_js": true,
  "js_instructions": [
    {"wait_for": ".product-list"},
    {"click": ".pagination .next-page"},
    {"wait_for": ".product-list"},
    {"click": ".pagination .next-page"},
    {"wait_for": ".product-list"},
    {"wait": 1000}
  ],
  "css_extractor": {
    "products": [".product-title"],
    "prices": [".product-price"]
  }
}`} />

              <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--sf-text-secondary)' }}>Infinite Scroll Content Loading</h4>
              <CodeBlock code={`{
  "url": "https://social.example.com/feed",
  "render_js": true,
  "js_instructions": [
    {"wait_for": ".feed-item"},
    {"scroll_y": 2000},
    {"wait": 1500},
    {"scroll_y": 2000},
    {"wait": 1500},
    {"scroll_y": 2000},
    {"wait_event": "networkalmostidle"}
  ]
}`} />

              <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--sf-text-secondary)' }}>Form Submission with Product Selection</h4>
              <CodeBlock code={`{
  "url": "https://shop.example.com/product/123",
  "render_js": true,
  "js_instructions": [
    {"wait_for": ".product-options"},
    {"click": ".size-option[data-size='large']"},
    {"wait": 500},
    {"click": ".color-option[data-color='blue']"},
    {"wait": 500},
    {"click": "#calculate-shipping"},
    {"wait_for": "#zip-input"},
    {"fill": ["#zip-input", "90210"]},
    {"click": ".calc-btn"},
    {"wait_for": ".shipping-result"}
  ]
}`} />

              <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--sf-text-secondary)' }}>Remove Overlays and Direct Capture</h4>
              <CodeBlock code={`{
  "url": "https://example.com/article",
  "render_js": true,
  "js_instructions": [
    {"wait": 2000},
    {"evaluate": "document.querySelectorAll('.paywall, .popup, .modal, .cookie-banner').forEach(el => el.remove());"},
    {"evaluate": "document.body.style.overflow = 'visible';"},
    {"scroll_y": 500},
    {"wait": 1000}
  ],
  "output_format": "markdown"
}`} />

              <div style={{ marginTop: 24, padding: '16px 20px', background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--sf-primary-light)' }}>💡 Best Practices</h4>
                <ul style={{ fontSize: 12, color: 'var(--sf-text-muted)', lineHeight: 2, paddingLeft: 16 }}>
                  <li>Always use <code>wait_for</code> instead of fixed <code>wait</code> when possible — it's faster and more reliable</li>
                  <li>Use XPath (<code>//</code>) when CSS selectors are ambiguous or element text needs matching</li>
                  <li>Combine <code>scroll_y</code> with <code>wait_event: "networkalmostidle"</code> for infinite scroll sites</li>
                  <li>Add <code>json_response: true</code> during development to debug instruction execution</li>
                  <li>Instructions run in strict order — failed instructions are skipped but execution continues</li>
                  <li>Max <code>wait</code> value is 10000ms (10 seconds) per instruction</li>
                  <li>For iframes, use <code>frame_reveal</code> first to make iframe content accessible</li>
                </ul>
              </div>
            </div>
          )}

          {/* ═══════════ CRAWL API ═══════════ */}
          {activeSection === 'crawl' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Crawl API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Crawl entire websites. Automatically discovers and scrapes all pages within a domain.
              </p>

              <Endpoint method="POST" path="/api/v1/crawl" desc="Start a new crawl" />
              <ParamTable>
                <Param name="url" type="string" required desc="Starting URL to crawl" />
                <Param name="max_pages" type="number" desc="Maximum pages to crawl (1–50000)" def="100" />
                <Param name="max_depth" type="number" desc="Maximum link depth (1–20)" def="3" />
                <Param name="include_patterns" type="string[]" desc="Only crawl URLs matching these glob patterns" />
                <Param name="exclude_patterns" type="string[]" desc="Skip URLs matching these patterns" />
                <Param name="respect_robots_txt" type="boolean" desc="Obey robots.txt directives" def="true" />
                <Param name="follow_sitemaps" type="boolean" desc="Discover URLs from sitemap.xml" def="true" />
                <Param name="allow_subdomains" type="boolean" desc="Allow crawling subdomains" def="false" />
                <Param name="deduplication" type="string" desc="content_hash | url | none" def="content_hash" />
                <Param name="rate_limit.requests_per_second" type="number" desc="Crawl speed (0.1–50)" def="5" />
              </ParamTable>

              <Endpoint method="GET" path="/api/v1/crawl" desc="List all crawls" />
              <Endpoint method="GET" path="/api/v1/crawl/:crawlId" desc="Get crawl status" />
              <Endpoint method="POST" path="/api/v1/crawl/:crawlId/cancel" desc="Cancel a running crawl" />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Example</h3>
              <CodeBlock code={`curl -X POST "${API_BASE}/crawl" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.example.com",
    "max_pages": 500,
    "max_depth": 5,
    "include_patterns": ["/docs/*"],
    "exclude_patterns": ["/admin/*", "/api/*"],
    "follow_sitemaps": true
  }'`} />
            </div>
          )}

          {/* ═══════════ SERP API ═══════════ */}
          {activeSection === 'search' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>SERP API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Full-featured search engine results API. Supports Google, Bing, Yahoo, DuckDuckGo, Yandex, Baidu, and Naver.
              </p>

              <Endpoint method="POST" path="/api/v1/search" desc="Parsed SERP results (5 credits)" />
              <Endpoint method="POST" path="/api/v1/search/fast" desc="Fast raw SERP results (10 credits)" />
              <ParamTable>
                <Param name="engine" type="string" required desc="google | bing | yahoo | duckduckgo | yandex | baidu | naver" def="google" />
                <Param name="query" type="string" required desc="Search query (1–500 chars)" />
                <Param name="type" type="string" desc="web | images | news | shopping | maps | scholar | videos" def="web" />
                <Param name="num_results" type="number" desc="Number of results to return (1–100)" def="10" />
                <Param name="page" type="number" desc="Page number for pagination" def="1" />
                <Param name="country" type="string" desc="2-letter country code for localized results" />
                <Param name="language" type="string" desc="Language code (e.g. en, de, fr, ja)" />
                <Param name="location" type="string" desc="Specific location string" />
                <Param name="device" type="string" desc="desktop | mobile | tablet" def="desktop" />
                <Param name="parse" type="boolean" desc="Return parsed structured results" def="true" />
              </ParamTable>

              <CodeBlock code={`curl -X POST "${API_BASE}/search" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "engine": "google",
    "query": "best web scraping API",
    "num_results": 10,
    "country": "US",
    "language": "en",
    "type": "web"
  }'`} />
            </div>
          )}

          {/* ═══════════ EXTRACT / SCREENSHOT / PDF ═══════════ */}
          {activeSection === 'extract' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Extract / Screenshot / PDF</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Specialized endpoints for data extraction, screenshots, and PDF generation.
              </p>

              <Endpoint method="POST" path="/api/v1/extract" desc="Extract structured data using LLM" />
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 13, marginBottom: 16 }}>
                Uses AI/LLM to intelligently extract structured data from any webpage. Provide a schema or natural language prompt.
              </p>

              <Endpoint method="POST" path="/api/v1/screenshot" desc="Capture page screenshot" />
              <ParamTable>
                <Param name="url" type="string" required desc="URL to screenshot" />
                <Param name="full_page" type="boolean" desc="Capture full scrollable page" def="true" />
                <Param name="format" type="string" desc="png | jpeg | webp" def="png" />
                <Param name="quality" type="number" desc="Image quality (1–100)" def="90" />
                <Param name="selector" type="string" desc="Capture specific element only" />
                <Param name="viewport" type="object" desc='{"width": 1920, "height": 1080}' />
              </ParamTable>

              <Endpoint method="POST" path="/api/v1/pdf" desc="Generate PDF" />
              <ParamTable>
                <Param name="url" type="string" required desc="URL to convert to PDF" />
              </ParamTable>
            </div>
          )}

          {/* ═══════════ DATASETS API ═══════════ */}
          {activeSection === 'datasets' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Datasets API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Automatically created from scrape and crawl results. Browse, download, and manage your data.
              </p>

              <Endpoint method="GET" path="/api/v1/datasets" desc="List all datasets" />
              <Endpoint method="GET" path="/api/v1/datasets/:id" desc="Download dataset" />
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 13, marginBottom: 16 }}>
                Query param <code>?format=json|csv|ndjson</code> controls the download format.
              </p>

              <Endpoint method="DELETE" path="/api/v1/datasets/:id" desc="Delete a single dataset" />
              <Endpoint method="DELETE" path="/api/v1/datasets" desc="Bulk delete datasets" />
              <ParamTable>
                <Param name="datasetIds" type="string[]" desc="Array of dataset IDs to delete" />
                <Param name="deleteAll" type="boolean" desc='Set true to delete all datasets' />
              </ParamTable>
            </div>
          )}

          {/* ═══════════ SCHEDULES API ═══════════ */}
          {activeSection === 'schedules' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Schedules API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Schedule recurring scrape jobs using cron expressions.
              </p>

              <Endpoint method="GET" path="/api/v1/schedule" desc="List all schedules" />
              <Endpoint method="POST" path="/api/v1/schedule" desc="Create a schedule" />
              <ParamTable>
                <Param name="name" type="string" required desc="Schedule name" />
                <Param name="cron" type="string" required desc='Cron expression (e.g. "0 */6 * * *" = every 6h)' />
                <Param name="request" type="object" required desc="Scrape request body to execute (same as POST /scrape)" />
                <Param name="enabled" type="boolean" desc="Whether schedule is active" def="true" />
              </ParamTable>

              <Endpoint method="PUT" path="/api/v1/schedule/:id" desc="Update a schedule" />
              <Endpoint method="DELETE" path="/api/v1/schedule/:id" desc="Delete a schedule" />
            </div>
          )}

          {/* ═══════════ WEBHOOKS API ═══════════ */}
          {activeSection === 'webhooks' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Webhooks API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Receive async notifications when scrape/crawl jobs complete.
              </p>

              <Endpoint method="GET" path="/api/v1/webhooks" desc="List webhooks" />
              <Endpoint method="POST" path="/api/v1/webhooks" desc="Create webhook" />
              <ParamTable>
                <Param name="url" type="string" required desc="Webhook endpoint URL" />
                <Param name="events" type="string[]" required desc='Events: ["scrape.completed", "crawl.completed", "scrape.failed"]' />
                <Param name="headers" type="object" desc="Custom headers to include on delivery" />
                <Param name="secret" type="string" desc="Shared secret for HMAC signature verification" />
              </ParamTable>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Webhook Payload</h3>
              <CodeBlock code={`{
  "event": "scrape.completed",
  "timestamp": "2026-04-12T08:00:00Z",
  "data": {
    "requestId": "req_abc123",
    "url": "https://example.com",
    "status": "completed",
    "credits_used": 5,
    "result": { ... }
  }
}`} />
            </div>
          )}

          {/* ═══════════ PROXY HEALTH ═══════════ */}
          {activeSection === 'proxy' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Proxy Health API</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Monitor proxy pool health and test individual proxies.
              </p>

              <Endpoint method="GET" path="/api/v1/proxy/health" desc="Get proxy pool stats" />

              <Endpoint method="POST" path="/api/v1/proxy/check" desc="Test a proxy" />
              <ParamTable>
                <Param name="host" type="string" required desc="Proxy host/IP address (or use proxyUrl)" />
                <Param name="port" type="number" desc="Proxy port" />
                <Param name="username" type="string" desc="Proxy auth username" />
                <Param name="password" type="string" desc="Proxy auth password" />
                <Param name="type" type="string" desc="http | https | socks4 | socks5" def="http" />
                <Param name="targetUrl" type="string" desc="URL to test against" def="https://httpbin.org/ip" />
                <Param name="timeout" type="number" desc="Timeout in ms (3000–30000)" def="10000" />
                <Param name="proxyUrl" type="string" desc="Alternative: full proxy URL (http://user:pass@host:port)" />
              </ParamTable>

              <Endpoint method="GET" path="/api/v1/proxy/check-results" desc="List check history" />
              <Endpoint method="DELETE" path="/api/v1/proxy/check-results" desc="Delete check history" />
            </div>
          )}

          {/* ═══════════ ACCOUNT API ═══════════ */}
          {activeSection === 'account' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Account API</h2>

              <Endpoint method="GET" path="/api/v1/account" desc="Get account info + API keys" />
              <Endpoint method="POST" path="/api/v1/account/change-password" desc="Change password" />
              <ParamTable>
                <Param name="currentPassword" type="string" required desc="Current password" />
                <Param name="newPassword" type="string" required desc="New password (min 8 chars)" />
              </ParamTable>

              <Endpoint method="PUT" path="/api/v1/account/profile" desc="Update profile" />
              <ParamTable>
                <Param name="name" type="string" desc="Display name" />
                <Param name="email" type="string" desc="Email address" />
              </ParamTable>

              <Endpoint method="PUT" path="/api/v1/account/preferences" desc="Save preferences" />
              <Endpoint method="GET" path="/api/v1/account/export" desc="Export all user data" />
              <Endpoint method="GET" path="/api/v1/account/usage-billing" desc="Usage & billing stats" />
              <Endpoint method="GET" path="/api/v1/account/dashboard-stats" desc="Dashboard analytics" />
              <Endpoint method="GET" path="/api/v1/account/scrape-history" desc="Request history" />
              <Endpoint method="DELETE" path="/api/v1/account/scrape-history" desc="Delete request history" />
            </div>
          )}

          {/* ═══════════ CREDIT PRICING ═══════════ */}
          {activeSection === 'credits' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Credit Pricing</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                Credits are consumed based on the scraping method and add-ons used.
              </p>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Operation</th><th>Credits</th><th>Description</th></tr></thead>
                  <tbody>
                    <tr><td>Static + Datacenter</td><td><span className="badge badge-success">1</span></td><td>Basic HTTP request, datacenter proxy</td></tr>
                    <tr><td>Static + Residential</td><td><span className="badge badge-warning">5</span></td><td>HTTP request with residential proxy</td></tr>
                    <tr><td>JS Render + Datacenter</td><td><span className="badge badge-warning">5</span></td><td>Browser rendering, datacenter proxy</td></tr>
                    <tr><td>JS Render + Residential</td><td><span className="badge badge-purple">10</span></td><td>Browser rendering, residential proxy</td></tr>
                    <tr><td>JS Render + Premium</td><td><span className="badge badge-danger">25</span></td><td>Full browser + premium ISP proxy</td></tr>
                    <tr><td>JS Scenario (multi-step)</td><td><span className="badge badge-danger">25+</span></td><td>Multi-step automation scenario</td></tr>
                    <tr><td>Crawl</td><td><span className="badge badge-success">1/page</span></td><td>Per page crawled</td></tr>
                    <tr><td>SERP (parsed)</td><td><span className="badge badge-warning">5</span></td><td>Structured search results</td></tr>
                    <tr><td>SERP (fast)</td><td><span className="badge badge-purple">10</span></td><td>Raw fast search results</td></tr>
                    <tr><td>+ CAPTCHA solve</td><td><span className="badge badge-purple">+10</span></td><td>Automatic CAPTCHA bypass</td></tr>
                    <tr><td>+ Screenshot</td><td><span className="badge badge-info">+2</span></td><td>Page screenshot capture</td></tr>
                    <tr><td>+ PDF</td><td><span className="badge badge-info">+3</span></td><td>PDF generation</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════ RATE LIMITS ═══════════ */}
          {activeSection === 'rate-limits' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Rate Limits & Pagination</h2>
              <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 20 }}>
                API rate limits are enforced per API key. Upgrade your plan for higher limits.
              </p>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Plan</th><th>Rate Limit</th><th>Concurrent</th><th>Credits/Month</th></tr></thead>
                  <tbody>
                    <tr><td>Free</td><td>30 req/min</td><td>5</td><td>1,000</td></tr>
                    <tr><td>Pro</td><td>300 req/min</td><td>50</td><td>50,000</td></tr>
                    <tr><td>Enterprise</td><td>3,000 req/min</td><td>500</td><td>Unlimited</td></tr>
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Rate Limit Headers</h3>
              <CodeBlock code={`X-RateLimit-Limit: 30
X-RateLimit-Remaining: 27
X-RateLimit-Reset: 1712928000`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Pagination</h3>
              <p style={{ color: 'var(--sf-text-secondary)', fontSize: 14 }}>
                List endpoints support <code>?page=1&limit=20</code> query parameters. Response includes <code>total</code> count.
              </p>
            </div>
          )}

          {/* ═══════════ RESPONSE FORMAT ═══════════ */}
          {activeSection === 'responses' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Response Format</h2>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 10 }}>Success (Sync)</h3>
              <CodeBlock code={`{
  "success": true,
  "requestId": "req_abc123",
  "data": {
    "url": "https://example.com",
    "content": "...",
    "metadata": { "title": "...", "statusCode": 200 }
  },
  "credits_used": 5
}`} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Async (Processing)</h3>
              <CodeBlock code={`{
  "success": true,
  "requestId": "req_abc123",
  "status": "processing",
  "poll_url": "/api/v1/scrape/req_abc123"
}`} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Error</h3>
              <CodeBlock code={`{
  "success": false,
  "error": "ValidationError",
  "message": "Request validation failed",
  "details": [{"path": "url", "message": "Invalid URL format"}]
}`} />
            </div>
          )}

          {/* ═══════════ ERROR CODES ═══════════ */}
          {activeSection === 'errors' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Error Codes</h2>
              <div className="table-wrapper" style={{ marginTop: 16 }}>
                <table className="data-table">
                  <thead><tr><th>HTTP</th><th>Error Code</th><th>Description</th></tr></thead>
                  <tbody>
                    <tr><td>400</td><td>ValidationError</td><td>Invalid request parameters</td></tr>
                    <tr><td>401</td><td>Unauthorized</td><td>Missing or invalid API key / JWT</td></tr>
                    <tr><td>403</td><td>Forbidden</td><td>Insufficient permissions</td></tr>
                    <tr><td>404</td><td>NotFound</td><td>Resource not found</td></tr>
                    <tr><td>409</td><td>InsufficientCredits</td><td>Not enough credits for the operation</td></tr>
                    <tr><td>429</td><td>RateLimitExceeded</td><td>Too many requests, wait and retry</td></tr>
                    <tr><td>500</td><td>InternalServerError</td><td>Unexpected server error</td></tr>
                    <tr><td>502</td><td>ScrapeError</td><td>Target website unreachable or blocked</td></tr>
                    <tr><td>504</td><td>TimeoutError</td><td>Request exceeded timeout</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════ SDKs ═══════════ */}
          {activeSection === 'sdks' && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>SDK Quick Start</h2>

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 10 }}>🐍 Python</h3>
              <CodeBlock code={`import requests

API_KEY = "YOUR_API_KEY"
BASE = "${API_BASE}"

# Simple scrape
resp = requests.post(f"{BASE}/scrape", headers={"X-API-Key": API_KEY}, json={
    "url": "https://example.com",
    "output_format": "markdown",
    "stealth_mode": "adaptive",
})
data = resp.json()
print(data["data"]["content"])

# SERP search
resp = requests.post(f"{BASE}/search", headers={"X-API-Key": API_KEY}, json={
    "engine": "google",
    "query": "best scraping API",
    "num_results": 10,
})
for result in resp.json()["data"]["organic_results"]:
    print(result["title"], result["link"])`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>🟨 Node.js</h3>
              <CodeBlock code={`const API_KEY = "YOUR_API_KEY";
const BASE = "${API_BASE}";

// Simple scrape
const response = await fetch(\`\${BASE}/scrape\`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
  body: JSON.stringify({
    url: "https://example.com",
    output_format: "markdown",
    stealth_mode: "adaptive",
  }),
});
const data = await response.json();
console.log(data.data.content);

// Start a crawl
const crawl = await fetch(\`\${BASE}/crawl\`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
  body: JSON.stringify({
    url: "https://docs.example.com",
    max_pages: 100,
    max_depth: 3,
  }),
});
const crawlData = await crawl.json();
console.log("Crawl ID:", crawlData.crawlId);`} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>⌘ cURL</h3>
              <CodeBlock code={`# Scrape with JS rendering
curl -X POST "${API_BASE}/scrape" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","render_js":true,"stealth_mode":"adaptive"}'

# Download a dataset as CSV
curl -H "X-API-Key: YOUR_API_KEY" \\
  "${API_BASE}/datasets/ds_123456?format=csv" -o data.csv

# Check proxy
curl -X POST "${API_BASE}/proxy/check" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"host":"198.51.100.1","port":8080,"targetUrl":"https://google.com"}'`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
