import { useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Play, Loader2, Copy, Settings2, Code, Globe, Info, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OUTPUT_FORMATS = ['html', 'markdown', 'json', 'screenshot', 'pdf'];
const STEALTH_MODES = ['none', 'basic', 'standard', 'advanced', 'maximum', 'adaptive'];
const SCRAPER_TYPES = ['auto', 'http', 'browser', 'node-browser'];
const SCREENSHOT_FORMATS = ['png', 'jpeg', 'webp'];

const STEALTH_INFO = {
  none: 'Raw HTTP request. No fingerprinting. Fast but easily blocked.',
  basic: 'Rotated headers + User-Agent matching. Bypasses basic WAFs.',
  standard: 'TLS/JA3 fingerprint mimicry (curl_cffi). Perfect for Datadome/Cloudflare.',
  advanced: 'Headless browser with behavioral simulation (mouse movements, Canvas spoofing).',
  maximum: 'Headless browser + CAPTCHA solving enabled.',
  adaptive: 'Auto-escalates stealth from low to maximum if blocked. (Recommended)'
};

const SCRAPER_INFO = {
  auto: 'Automatically selects the best engine based on URL and stealth level.',
  http: 'Fast HTTP client. Best for static pages and APIs.',
  browser: 'Python browser with Selenium. Good for JS-heavy sites.',
  'node-browser': 'Node.js Playwright. Best for complex SPAs and JS rendering.'
};

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080/api/v1`;

const LANGUAGES = [
  { id: 'curl', label: 'cURL', icon: '⌘' },
  { id: 'python', label: 'Python', icon: '🐍' },
  { id: 'javascript', label: 'JavaScript', icon: '🟨' },
  { id: 'php', label: 'PHP', icon: '🐘' },
  { id: 'ruby', label: 'Ruby', icon: '💎' },
  { id: 'go', label: 'Go', icon: '🔵' },
  { id: 'java', label: 'Java', icon: '☕' },
  { id: 'csharp', label: 'C#', icon: '🟣' },
];

export default function ScrapePlayground() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [renderJs, setRenderJs] = useState(false);
  const [outputFormat, setOutputFormat] = useState('html');
  const [stealthMode, setStealthMode] = useState('adaptive');
  const [scraperType, setScraperType] = useState('auto');
  const [proxyOption, setProxyOption] = useState('free');
  const [customProxy, setCustomProxy] = useState('');
  const [device, setDevice] = useState('desktop');
  
  const [webhookUrl, setWebhookUrl] = useState('');
  const [jsInstructions, setJsInstructions] = useState('');
  const [cssExtractor, setCssExtractor] = useState('');
  const [jsonResponse, setJsonResponse] = useState(false);
  const [originalStatus, setOriginalStatus] = useState(false);

  // Tools specific config
  const [fullPage, setFullPage] = useState(true);
  const [ssFormat, setSsFormat] = useState('png');
  const [ssQuality, setSsQuality] = useState(90);
  const [viewportWidth, setViewportWidth] = useState(1920);
  const [viewportHeight, setViewportHeight] = useState(1080);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [latency, setLatency] = useState(0);
  const [activeTab, setActiveTab] = useState('config');
  const [codeLang, setCodeLang] = useState('curl');
  const [showStealthInfo, setShowStealthInfo] = useState(false);
  const [showScraperInfo, setShowScraperInfo] = useState(false);
  const [showJsInfo, setShowJsInfo] = useState(false);

  const generateBody = () => {
    const body = { url, render_js: renderJs, output_format: outputFormat, stealth_mode: stealthMode, scraper_type: scraperType, device };
    if (proxyOption === 'custom' && customProxy) body.custom_proxy = customProxy;
    if (webhookUrl) body.webhook_url = webhookUrl;
    if (jsonResponse) body.json_response = true;
    if (originalStatus) body.original_status = true;
    if (jsInstructions) {
      try { body.js_instructions = JSON.parse(jsInstructions); } catch(_) { body.js_instructions = jsInstructions; }
    }
    if (cssExtractor) {
      try { JSON.parse(cssExtractor); body.css_extractor = cssExtractor; } catch(_) {}
    }
    
    // Tools logic
    if (outputFormat === 'screenshot') {
      body.scraper_type = 'node-browser'; // Must be browser
      body.screenshot = { enabled: true, full_page: fullPage, format: ssFormat };
      if (ssFormat === 'jpeg' || ssFormat === 'webp') body.screenshot.quality = ssQuality;
      body.viewport = { width: viewportWidth, height: viewportHeight };
    }
    if (outputFormat === 'pdf') {
      body.scraper_type = 'node-browser';
      body.pdf = true;
    }
    return body;
  };

  // Helper to find base64 fields in various response shapes
  const findField = (obj, field) => {
    if (!obj) return null;
    if (obj[field]) return obj[field];
    if (obj.data?.[field]) return obj.data[field];
    return null;
  };

  const handleScrape = async () => {
    if (!url) return toast.error('Enter a URL');
    setLoading(true);
    setResult(null);
    setPdfBlobUrl(null);
    const start = Date.now();
    try {
      const body = generateBody();
      let res = await api.post('/scrape', body);
      
      // Poll if async
      if (res.status === 'processing' || res.status === 'queued') {
        const pollUrl = res.poll_url || `/scrape/${res.requestId}`;
        const cleanPath = pollUrl.replace(/^\/api\/v1/, '');
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const p = await api.get(cleanPath);
            if (p.status === 'completed' || p.status === 'failed' || (p.success !== undefined && p.status !== 'processing' && p.status !== 'queued')) {
              res = p;
              break;
            }
          } catch (pollErr) { throw new Error(pollErr.message); }
        }
      }

      setLatency(Date.now() - start);
      setResult(res);
      toast.success(`Scraped in ${Date.now() - start}ms`);

      // If PDF, generate blob URL to avoid CSP issues with data URIs
      const pdfB64 = findField(res, 'pdfBase64');
      if (pdfB64) {
        try {
          const byteCharacters = atob(pdfB64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          setPdfBlobUrl(URL.createObjectURL(blob));
        } catch (e) {
          console.error("PDF Blob generation failed", e);
        }
      }

    } catch (err) {
      toast.error(err.message);
      setResult({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (base64, mimeType, extension) => {
    try {
      const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrapeforge_${Date.now()}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e) {
      toast.error('Failed to download file');
    }
  };

  const getCodeSnippet = (lang) => {
    const body = generateBody();
    const bodyStr = JSON.stringify(body, null, 2);
    const bodyStr4 = JSON.stringify(body, null, 4);

    switch (lang) {
      case 'curl': return `curl -X POST "${API_BASE}/scrape" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '${bodyStr}'`;

      case 'python': return `import requests

response = requests.post(
    "${API_BASE}/scrape",
    headers={"X-API-Key": "YOUR_API_KEY"},
    json=${bodyStr4}
)
print(response.json())`;

      case 'javascript': return `const response = await fetch("${API_BASE}/scrape", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY"
  },
  body: JSON.stringify(${bodyStr})
});
const data = await response.json();
console.log(data);`;

      case 'php': return `<?php
$ch = curl_init("${API_BASE}/scrape");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "X-API-Key: YOUR_API_KEY"
  ],
  CURLOPT_POSTFIELDS => json_encode(${bodyStr4})
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;`;

      case 'ruby': return `require 'net/http'
require 'json'

uri = URI("${API_BASE}/scrape")
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = uri.scheme == 'https'

request = Net::HTTP::Post.new(uri)
request["Content-Type"] = "application/json"
request["X-API-Key"] = "YOUR_API_KEY"
request.body = ${bodyStr}.to_json

response = http.request(request)
puts JSON.parse(response.body)`;

      case 'go': return `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "io"
  "net/http"
)

func main() {
  body, _ := json.Marshal(map[string]interface{}{
    "url": "${body.url || 'https://example.com'}",
    "render_js": ${body.render_js || false},
    "output_format": "${body.output_format}",
  })
  
  req, _ := http.NewRequest("POST", "${API_BASE}/scrape", bytes.NewBuffer(body))
  req.Header.Set("Content-Type", "application/json")
  req.Header.Set("X-API-Key", "YOUR_API_KEY")
  
  resp, _ := http.DefaultClient.Do(req)
  defer resp.Body.Close()
  data, _ := io.ReadAll(resp.Body)
  fmt.Println(string(data))
}`;

      case 'java': return `import java.net.http.*;
import java.net.URI;

HttpClient client = HttpClient.newHttpClient();
String body = ${JSON.stringify(bodyStr)};

HttpRequest request = HttpRequest.newBuilder()
  .uri(URI.create("${API_BASE}/scrape"))
  .header("Content-Type", "application/json")
  .header("X-API-Key", "YOUR_API_KEY")
  .POST(HttpRequest.BodyPublishers.ofString(body))
  .build();

HttpResponse<String> response = client.send(request,
  HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`;

      case 'csharp': return `using System.Net.Http;
using System.Text;

var client = new HttpClient();
var content = new StringContent(
  @"${bodyStr.replace(/"/g, '""')}",
  Encoding.UTF8, "application/json");

client.DefaultRequestHeaders.Add("X-API-Key", "YOUR_API_KEY");
var response = await client.PostAsync(
  "${API_BASE}/scrape", content);
var result = await response.Content.ReadAsStringAsync();
Console.WriteLine(result);`;

      default: return '';
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Scrape Playground</h1>
        <p className="page-subtitle">Test scrape requests in real-time with live preview</p>
      </div>

      <div className="grid-2">
        {/* Input Panel */}
        <div className="glass-card-static">
          <div className="tabs" style={{ marginBottom: 20 }}>
            <button className={`tab ${activeTab === 'config' ? 'active' : ''}`}
              onClick={() => setActiveTab('config')}>
              <Settings2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Config
            </button>
            <button className={`tab ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}>
              <Code size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Code
            </button>
          </div>

          {activeTab === 'config' ? (
            <>
              <div className="form-group">
                <label className="form-label">URL</label>
                <input className="input" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com" onKeyDown={e => e.key === 'Enter' && handleScrape()} />
              </div>

              <div className="form-row" style={{ marginBottom: 16 }}>
                <div>
                  <label className="form-label">Output Format</label>
                  <select className="input" value={outputFormat} onChange={e => setOutputFormat(e.target.value)}>
                    {OUTPUT_FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Scraper Engine
                    <span style={{ position: 'relative', display: 'inline-block' }} className="pg-tooltip-wrap">
                      <Info size={14} style={{ cursor: 'help', opacity: 0.5 }} />
                      <div className="pg-tooltip" style={{
                        position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                        width: 300, background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: 10, padding: '12px 14px', zIndex: 1000, pointerEvents: 'none',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', fontSize: 12, lineHeight: 1.6,
                        opacity: 0, transition: 'opacity 0.15s', whiteSpace: 'normal',
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--sf-primary-light)' }}>Scraper Engines</div>
                        {Object.entries(SCRAPER_INFO).map(([key, desc]) => (
                          <div key={key} style={{ marginBottom: 6 }}>
                            <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, marginRight: 6, color: 'var(--sf-secondary)' }}>{key}</code>
                            <span style={{ color: 'var(--sf-text-muted)' }}>{desc}</span>
                          </div>
                        ))}
                      </div>
                    </span>
                  </label>
                  <select className="input" value={scraperType} onChange={e => setScraperType(e.target.value)}>
                    {SCRAPER_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Device</label>
                  <select className="input" value={device} onChange={e => setDevice(e.target.value)}>
                    {['desktop', 'mobile', 'tablet'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              {/* Proxy */}
              <div className="form-group">
                <label className="form-label">Proxy</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button className={`btn ${proxyOption === 'free' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, fontSize: 13 }}
                    onClick={() => setProxyOption('free')}>
                    🌐 Free Proxies (Auto)
                  </button>
                  <button className={`btn ${proxyOption === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, fontSize: 13 }}
                    onClick={() => setProxyOption('custom')}>
                    🔒 Custom Proxy
                  </button>
                </div>
                {proxyOption === 'custom' && (
                  <input className="input" value={customProxy} onChange={e => setCustomProxy(e.target.value)}
                    placeholder="http://user:pass@host:port" style={{ marginTop: 4 }} />
                )}
              </div>

              {/* Tools Specific Overrides */}
              {outputFormat === 'screenshot' && (
                <div className="form-group" style={{ padding: 12, backgroundColor: 'rgba(236,72,153,0.1)', borderRadius: 8, border: '1px solid rgba(236,72,153,0.2)' }}>
                  <label className="form-label" style={{ color: '#ec4899', marginBottom: 12 }}>📸 Screenshot Settings (Forces Node Browser)</label>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label className="checkbox-label" style={{ marginBottom: 8, marginTop: 4 }}>
                        <input type="checkbox" checked={fullPage} onChange={e => setFullPage(e.target.checked)} />
                        <span>Full Page Capture</span>
                      </label>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Format</label>
                      <select className="input" style={{ padding: '4px 8px', fontSize: 12 }} value={ssFormat} onChange={e => setSsFormat(e.target.value)}>
                        {SCREENSHOT_FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Width</label>
                      <input type="number" className="input" style={{ padding: '4px 8px', fontSize: 12 }} value={viewportWidth} onChange={e => setViewportWidth(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Height</label>
                      <input type="number" className="input" style={{ padding: '4px 8px', fontSize: 12 }} value={viewportHeight} onChange={e => setViewportHeight(Number(e.target.value))} />
                    </div>
                    {(ssFormat === 'jpeg' || ssFormat === 'webp') && (
                      <div>
                        <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Quality</label>
                        <input type="number" className="input" style={{ padding: '4px 8px', fontSize: 12 }} value={ssQuality} onChange={e => setSsQuality(Number(e.target.value))} min={10} max={100} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {outputFormat === 'pdf' && (
                <div className="form-group" style={{ padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                  <label className="form-label" style={{ color: '#ef4444', marginBottom: 4 }}>📄 PDF Export (Forces Node Browser)</label>
                  <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', margin: 0 }}>Generates a high-quality print-media rendered PDF of the target.</p>
                </div>
              )}

              {/* Stealth */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Stealth Mode
                  <span style={{ position: 'relative', display: 'inline-block' }} className="pg-tooltip-wrap">
                    <Info size={14} style={{ cursor: 'help', opacity: 0.5 }} />
                    <div className="pg-tooltip" style={{
                      position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                      width: 320, background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.4)',
                      borderRadius: 10, padding: '12px 14px', zIndex: 1000, pointerEvents: 'none',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', fontSize: 12, lineHeight: 1.6,
                      opacity: 0, transition: 'opacity 0.15s', whiteSpace: 'normal',
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--sf-primary-light)' }}>Stealth Levels</div>
                      {Object.entries(STEALTH_INFO).map(([key, desc]) => (
                        <div key={key} style={{ marginBottom: 6 }}>
                          <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, marginRight: 6, color: 'var(--sf-secondary)' }}>{key}</code>
                          <span style={{ color: 'var(--sf-text-muted)' }}>{desc}</span>
                        </div>
                      ))}
                    </div>
                  </span>
                </label>
                <select className="input" value={stealthMode} onChange={e => setStealthMode(e.target.value)}>
                  {STEALTH_MODES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <label className="checkbox-label">
                  <input type="checkbox" checked={renderJs} onChange={e => setRenderJs(e.target.checked)} />
                  <span>Render JavaScript</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={jsonResponse} onChange={e => setJsonResponse(e.target.checked)} />
                  <span>JSON Response</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={originalStatus} onChange={e => setOriginalStatus(e.target.checked)} />
                  <span>Original Status</span>
                </label>
              </div>

              {/* Advanced */}
              <div className="form-row" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label className="form-label" style={{ margin: 0 }}>JS Instructions (JSON Array)</label>
                      <div className="tooltip-container" style={{ position: 'relative', display: 'inline-block' }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: 4 }} title="Info">
                          <Info size={14} />
                        </button>
                        <div className="tooltip-content" style={{
                          visibility: 'hidden', width: 280, backgroundColor: '#1e1e2d', color: '#fff',
                          textAlign: 'left', borderRadius: 8, padding: 12, position: 'absolute',
                          zIndex: 10, bottom: '125%', left: '50%', transform: 'translateX(-50%)',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #333',
                          fontSize: 12, opacity: 0, transition: 'opacity 0.2s'
                        }}>
                          Execute browser actions before scraping. Requires JS Rendering.
                          <br/><br/>
                          Example:<br/>
                          <code>[{"{"}"action": "wait", "timeout": 2000{"}"}]</code>
                        </div>
                      </div>
                    </div>
                    <a href="/dashboard/docs#js-instructions" style={{ fontSize: 12, color: 'var(--sf-primary-light)', textDecoration: 'none' }}>
                      <ExternalLink size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      API Docs
                    </a>
                  </div>
                  <textarea className="input" rows={3} placeholder='[{"action": "wait_for", "selector": ".content"}]'
                    value={jsInstructions} onChange={e => setJsInstructions(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: 12 }} />
                </div>

                <div className="form-group">
                  <label className="form-label">CSS Extractor (JSON)</label>
                  <textarea className="input" value={cssExtractor} onChange={e => setCssExtractor(e.target.value)}
                    placeholder={'{\n  "title": "h1",\n  "links": ["a @href"]\n}'} style={{ height: 75, fontFamily: 'monospace', resize: 'vertical' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Webhook URL (optional)</label>
                <input className="input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhook" />
              </div>

              <button className="btn btn-primary" onClick={handleScrape} disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Scraping...</> : <><Play size={16} /> Run Scrape</>}
              </button>
            </>
          ) : (
            <div>
              {/* Language Tabs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
                {LANGUAGES.map(lang => (
                  <button key={lang.id}
                    className={`btn ${codeLang === lang.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => setCodeLang(lang.id)}>
                    <span>{lang.icon}</span> {lang.label}
                  </button>
                ))}
              </div>

              <pre className="code-block" style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 400, overflow: 'auto' }}>
                {getCodeSnippet(codeLang)}
              </pre>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                onClick={() => { navigator.clipboard.writeText(getCodeSnippet(codeLang)); toast.success(`Copied ${LANGUAGES.find(l => l.id === codeLang)?.label}`); }}>
                <Copy size={12} /> Copy Code
              </button>
            </div>
          )}
        </div>

        {/* Output Panel */}
        <div className="glass-card-static" style={{ maxHeight: '80vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Response</h3>
            {result && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {latency > 0 && <span className="badge badge-info">{latency}ms</span>}
                {(result.credits_used ?? result.creditsUsed) !== undefined && <span className="badge badge-purple">{result.credits_used ?? result.creditsUsed} credits</span>}
                <button className="btn btn-ghost btn-icon"
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success('Copied'); }}>
                  <Copy size={14} />
                </button>
                {outputFormat === 'screenshot' && findField(result, 'screenshotBase64') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(findField(result, 'screenshotBase64'), `image/${ssFormat}`, ssFormat)}>
                    Download
                  </button>
                )}
                {outputFormat === 'pdf' && findField(result, 'pdfBase64') && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(findField(result, 'pdfBase64'), 'application/pdf', 'pdf')}>
                    Download
                  </button>
                )}
              </div>
            )}
          </div>

          {result ? (
            outputFormat === 'screenshot' && findField(result, 'screenshotBase64') ? (
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <img src={`data:image/${ssFormat};base64,${findField(result, 'screenshotBase64')}`} alt="Screenshot" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--sf-border)' }} />
              </div>
            ) : outputFormat === 'pdf' && findField(result, 'pdfBase64') && pdfBlobUrl ? (
              <iframe src={pdfBlobUrl} style={{ width: '100%', height: 600, border: 'none', borderRadius: 8 }} title="PDF View" />
            ) : (
              <pre className="code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )
          ) : (
            <div className="empty-state">
              <Globe size={48} className="empty-state-icon" style={{ color: 'var(--sf-primary)' }} />
              <p>Enter a URL and click Run to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
