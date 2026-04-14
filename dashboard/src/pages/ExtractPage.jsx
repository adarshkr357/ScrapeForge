import { useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { FileText, Play, Loader2, Code, Info } from 'lucide-react';

export default function ExtractPage() {
  const [sourceType, setSourceType] = useState('url'); // 'url' or 'html'
  const [url, setUrl] = useState('');
  const [html, setHtml] = useState('');
  const [cssExtractor, setCssExtractor] = useState('{\n  "title": "h1",\n  "links": ["a @href"]\n}');
  const [regexRules, setRegexRules] = useState('');
  const [xpathRules, setXpathRules] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [creditsUsed, setCreditsUsed] = useState(0);

  const handleExtract = async () => {
    if (sourceType === 'url' && !url) return toast.error('Enter a URL');
    if (sourceType === 'html' && !html) return toast.error('Enter raw HTML');
    
    let cssObj, regexObj, xpathObj;
    
    try {
      if (cssExtractor) cssObj = JSON.parse(cssExtractor);
    } catch (_) { return toast.error('Invalid CSS Extractor JSON'); }
    
    try {
      if (regexRules) regexObj = JSON.parse(regexRules);
    } catch (_) { return toast.error('Invalid Regex Rules JSON'); }
    
    try {
      if (xpathRules) xpathObj = JSON.parse(xpathRules);
    } catch (_) { return toast.error('Invalid XPath Rules JSON'); }

    if (!cssObj && !regexObj && !xpathObj) {
      return toast.error('Provide at least one extraction rule (CSS, Regex, or XPath)');
    }

    setLoading(true);
    setResult(null);

    const body = {};
    if (sourceType === 'url') body.url = url;
    else body.html = html;

    if (cssObj) body.extraction_rules = cssObj;
    if (regexObj) body.regex_rules = regexObj;
    if (xpathObj) body.xpath_rules = xpathObj;

    try {
      // Direct call since Extract is synchronous when using HTML or URL
      const res = await api.post('/extract', body);
      setResult(res.data || res);
      setCreditsUsed(res.credits_used || 0);
      toast.success('Extraction successful');
    } catch (err) {
      toast.error(err.message || 'Extraction failed');
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: 8, background: 'rgba(99,102,241,0.1)', borderRadius: 8 }}>
            <FileText size={24} color="#6366f1" />
          </div>
          Rule-Based Extraction
        </h1>
        <p className="page-subtitle">Extract structured data from URLs or raw HTML using CSS selectors, XPath, and Regex.</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left Column: Configuration */}
        <div className="glass-card-static" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Source</h2>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setSourceType('url')}
              className={`btn ${sourceType === 'url' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '8px 12px' }}
            >
              URL
            </button>
            <button
              onClick={() => setSourceType('html')}
              className={`btn ${sourceType === 'html' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '8px 12px' }}
            >
              Raw HTML
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            {sourceType === 'url' ? (
              <input
                type="text"
                className="input"
                placeholder="https://news.ycombinator.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            ) : (
              <textarea
                className="input"
                placeholder="Paste raw HTML here..."
                rows={4}
                style={{ resize: 'vertical' }}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
              />
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--sf-border)', margin: '20px 0' }} />

          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Extraction Rules (JSON)</h2>
          
          <div className="form-group">
            <label className="form-label">
              CSS Selectors
            </label>
            <textarea
              className="input"
              rows={4}
              style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
              value={cssExtractor}
              onChange={(e) => setCssExtractor(e.target.value)}
              placeholder={'{\n  "title": "h1"\n}'}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              XPath Rules
            </label>
            <textarea
              className="input"
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
              value={xpathRules}
              onChange={(e) => setXpathRules(e.target.value)}
              placeholder={'{\n  "main_heading": "//h1/text()"\n}'}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="form-label">
              Regex Rules
            </label>
            <textarea
              className="input"
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
              value={regexRules}
              onChange={(e) => setRegexRules(e.target.value)}
              placeholder={'{\n  "emails": "[a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+"\n}'}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleExtract}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {loading ? 'Extracting Data...' : 'Extract Data'}
          </button>
        </div>

        {/* Right Column: Output */}
        <div className="glass-card-static" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Code size={18} color="var(--sf-primary-light)" />
              Extraction Result
            </h3>
            {creditsUsed > 0 && (
              <span className="badge badge-purple" style={{ fontSize: 12 }}>
                {creditsUsed} credits used
              </span>
            )}
          </div>
          
          <div style={{ flex: 1, padding: 0, overflow: 'auto', backgroundColor: 'transparent' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--sf-text-muted)' }}>
                <Loader2 size={32} className="animate-spin" style={{ marginBottom: 16, color: 'var(--sf-primary)' }} />
                <p>Applying extraction rules...</p>
              </div>
            ) : result ? (
              <pre className="code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="empty-state" style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Info size={48} className="empty-state-icon" style={{ opacity: 0.2, marginBottom: 16 }} />
                <p>Output will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
