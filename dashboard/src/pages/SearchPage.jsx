import { useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Search, Loader2, ExternalLink, Copy, Globe, TrendingUp, Newspaper, Image, ShoppingCart, Play, AlertTriangle } from 'lucide-react';

const ENGINES = [
  { id: 'duckduckgo', label: 'DuckDuckGo', emoji: '🦆' },
  { id: 'google', label: 'Google', emoji: '🔍' },
  { id: 'bing', label: 'Bing', emoji: '🅱️' },
  { id: 'yahoo', label: 'Yahoo', emoji: '🟣' },
  { id: 'yandex', label: 'Yandex', emoji: '🟡' },
  { id: 'baidu', label: 'Baidu', emoji: '🐼' },
  { id: 'naver', label: 'Naver', emoji: '🟩' },
];

const RESULT_TYPES = [
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'videos', label: 'Videos', icon: Play },
  { id: 'shopping', label: 'Shopping', icon: ShoppingCart },
];

const COUNTRIES = [
  { code: '', label: 'Any Country' },
  { code: 'us', label: '🇺🇸 United States' },
  { code: 'gb', label: '🇬🇧 United Kingdom' },
  { code: 'ca', label: '🇨🇦 Canada' },
  { code: 'au', label: '🇦🇺 Australia' },
  { code: 'de', label: '🇩🇪 Germany' },
  { code: 'fr', label: '🇫🇷 France' },
  { code: 'in', label: '🇮🇳 India' },
  { code: 'jp', label: '🇯🇵 Japan' },
  { code: 'br', label: '🇧🇷 Brazil' },
  { code: 'mx', label: '🇲🇽 Mexico' },
  { code: 'es', label: '🇪🇸 Spain' },
  { code: 'it', label: '🇮🇹 Italy' },
  { code: 'cn', label: '🇨🇳 China' },
  { code: 'kr', label: '🇰🇷 South Korea' },
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [engine, setEngine] = useState('duckduckgo');
  const [resultType, setResultType] = useState('web');
  const [numResults, setNumResults] = useState(10);
  const [country, setCountry] = useState('us');
  const [language, setLanguage] = useState('en');
  const [page, setPage] = useState(1);
  const [parseResults, setParseResults] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [rawResponse, setRawResponse] = useState(null);
  const [activeTab, setActiveTab] = useState('results');
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return toast.error('Enter a search query');
    setLoading(true);
    setResults(null);
    setRawResponse(null);
    setMeta(null);
    setError(null);
    setActiveTab('results');

    try {
      const body = {
        engine,
        query: query.trim(),
        num_results: numResults,
        type: resultType,
        page,
        parse: parseResults,
      };
      if (country) body.country = country;
      if (language) body.language = language;

      const res = await api.post('/search', body);

      // Handle different response shapes from the API
      let finalRes = res;

      // If async / processing, poll for result
      if (res.status === 'processing' || res.status === 'queued') {
        const pollPath = res.poll_url || `/scrape/${res.requestId}`;
        // Normalize the poll path - strip /api/v1 prefix if present
        const cleanPath = pollPath.replace(/^\/api\/v1/, '');

        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1500));
          try {
            const pollRes = await api.get(cleanPath);
            if (pollRes.data && pollRes.status !== 'processing' && pollRes.status !== 'queued') {
              finalRes = pollRes;
              break;
            }
            if (pollRes.status === 'completed') {
              finalRes = pollRes;
              break;
            }
          } catch (pollErr) {
            console.warn('Poll error:', pollErr);
            // Continue polling
          }
        }
      }

      setRawResponse(finalRes);

      // Extract organic results from various response shapes
      let organicResults = [];
      const data = finalRes.data || finalRes;

      if (data.organic_results && Array.isArray(data.organic_results)) {
        organicResults = data.organic_results;
      } else if (data.data?.organic_results && Array.isArray(data.data.organic_results)) {
        organicResults = data.data.organic_results;
      } else if (Array.isArray(data.data)) {
        organicResults = data.data;
      } else if (Array.isArray(data)) {
        organicResults = data;
      }

      setResults(organicResults);

      // Extract meta info
      const metaSource = data.data || data;
      setMeta({
        creditsUsed: finalRes.credits_used || data.credits_used,
        totalResults: metaSource.total_results,
        searchTime: metaSource.search_time,
        engine: metaSource.engine || engine,
        note: metaSource.note,
        featuredSnippet: metaSource.featured_snippet,
        peopleAlsoAsk: metaSource.people_also_ask || [],
        relatedSearches: metaSource.related_searches || [],
      });

      if (organicResults.length > 0) {
        toast.success(`Found ${organicResults.length} results`);
      } else {
        toast('No results found. Try a different query or engine.', { icon: '⚠️' });
      }
    } catch (err) {
      const errMsg = err.message || 'Search failed';
      setError(errMsg);
      toast.error(errMsg);
      setRawResponse({ success: false, error: errMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">SERP Search</h1>
        <p className="page-subtitle">Scrape search engine results from 7 major search engines</p>
      </div>

      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        {/* Engine Selector */}
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Search Engine</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ENGINES.map(e => (
              <button key={e.id}
                className={`btn ${engine === e.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 13, padding: '8px 14px' }}
                onClick={() => setEngine(e.id)}>
                {e.emoji} {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Result Type */}
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Result Type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RESULT_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id}
                  className={`btn ${resultType === t.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 13, padding: '8px 14px' }}
                  onClick={() => setResultType(t.id)}>
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Query Row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input className="input" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Enter your search query..."
            onKeyDown={e => e.key === 'Enter' && !loading && handleSearch()}
            style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={handleSearch}
            disabled={loading} style={{ minWidth: 130, flexShrink: 0 }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Options Row */}
        <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="form-group">
            <label className="form-label">Results Count</label>
            <select className="input" value={numResults} onChange={e => setNumResults(parseInt(e.target.value))}>
              {[5, 10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n} results</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Country</label>
            <select className="input" value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Language</label>
            <select className="input" value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Page</label>
            <select className="input" value={page} onChange={e => setPage(parseInt(e.target.value))}>
              {[1,2,3,4,5].map(p => <option key={p} value={p}>Page {p}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={parseResults} onChange={e => setParseResults(e.target.checked)} />
              <span>Parse Results</span>
            </label>
          </div>
        </div>

        {/* Tip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--sf-text-muted)' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--sf-warning)' }} />
          <span><strong>Tip:</strong> DuckDuckGo is the most reliable engine. Google may be blocked by anti-bot measures. All engines fall back to DuckDuckGo if they fail.</span>
        </div>
      </div>

      {/* Error state */}
      {error && !results && (
        <div className="glass-card-static" style={{ textAlign: 'center', padding: 40, borderColor: 'rgba(239,68,68,0.2)' }}>
          <AlertTriangle size={40} style={{ color: 'var(--sf-danger)', margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
          <p style={{ color: 'var(--sf-danger)', fontWeight: 600, marginBottom: 8 }}>Search Failed</p>
          <p style={{ color: 'var(--sf-text-muted)', fontSize: 13 }}>{error}</p>
          <p style={{ color: 'var(--sf-text-muted)', fontSize: 12, marginTop: 8 }}>Try switching to DuckDuckGo or adjusting your query.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="glass-card-static">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="skeleton" style={{ height: 14, width: `${60 + i * 5}%` }} />
                <div className="skeleton" style={{ height: 20, width: `${80 - i * 3}%` }} />
                <div className="skeleton" style={{ height: 12, width: '100%' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta bar */}
      {meta && !loading && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {meta.creditsUsed !== undefined && (
            <span className="badge badge-purple">{meta.creditsUsed} credits used</span>
          )}
          {meta.searchTime && (
            <span className="badge badge-info">{(typeof meta.searchTime === 'number' ? meta.searchTime.toFixed(2) : meta.searchTime)}s</span>
          )}
          {meta.totalResults !== undefined && (
            <span className="badge badge-secondary">{meta.totalResults} total</span>
          )}
          {meta.engine && (
            <span className="badge badge-info">Engine: {meta.engine}</span>
          )}
          {meta.note && (
            <span className="badge badge-warning">⚠ {meta.note}</span>
          )}
        </div>
      )}

      {!loading && (results || rawResponse) && (
        <div>
          <div className="tabs" style={{ maxWidth: 500, marginBottom: 20 }}>
            <button className={`tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
              Results {results && `(${results.length})`}
            </button>
            {meta?.featuredSnippet && (
              <button className={`tab ${activeTab === 'snippet' ? 'active' : ''}`} onClick={() => setActiveTab('snippet')}>
                Featured
              </button>
            )}
            {meta?.relatedSearches?.length > 0 && (
              <button className={`tab ${activeTab === 'related' ? 'active' : ''}`} onClick={() => setActiveTab('related')}>
                Related
              </button>
            )}
            <button className={`tab ${activeTab === 'raw' ? 'active' : ''}`} onClick={() => setActiveTab('raw')}>
              Raw JSON
            </button>
          </div>

          {activeTab === 'results' && Array.isArray(results) && (
            <div className="glass-card-static">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                  {results.length} Results{meta?.engine ? ` from ${meta.engine}` : ''}
                </h3>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(results, null, 2)); toast.success('Copied'); }}>
                  <Copy size={12} /> Copy All
                </button>
              </div>
              {results.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--sf-text-muted)' }}>
                  <Globe size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                  <p>No results found. Try a different query, engine, or result type.</p>
                </div>
              ) : (
                results.map((r, i) => (
                  <div key={i} style={{
                    padding: '16px 0',
                    borderBottom: i < results.length - 1 ? '1px solid var(--sf-border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--sf-text-muted)', fontWeight: 600, minWidth: 24 }}>#{r.position || i + 1}</span>
                      <div style={{ fontSize: 12, color: 'var(--sf-success)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.url}
                      </div>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--sf-text-muted)', flexShrink: 0 }}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--sf-primary-light)', marginLeft: 32 }}>
                      {r.title}
                    </div>
                    {r.snippet && (
                      <div style={{ fontSize: 13, color: 'var(--sf-text-secondary)', lineHeight: 1.5, marginLeft: 32 }}>
                        {r.snippet}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'snippet' && meta?.featuredSnippet && (
            <div className="glass-card-static" style={{ borderColor: 'rgba(99,102,241,0.4)', borderWidth: 1, borderStyle: 'solid' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--sf-primary-light)' }}>⭐ Featured Snippet</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--sf-text-secondary)' }}>{meta.featuredSnippet}</p>
              {meta.peopleAlsoAsk?.length > 0 && (
                <>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--sf-text-muted)' }}>People Also Ask</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {meta.peopleAlsoAsk.map((q, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: 'var(--sf-bg-elevated)', borderRadius: 8, fontSize: 13 }}>{q}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'related' && meta?.relatedSearches?.length > 0 && (
            <div className="glass-card-static">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Related Searches</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {meta.relatedSearches.map((rs, i) => (
                  <button key={i} className="btn btn-secondary" style={{ fontSize: 12 }}
                    onClick={() => { setQuery(rs); }}>
                    <TrendingUp size={12} /> {rs}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'raw' && rawResponse && (
            <div className="glass-card-static">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Raw Response</h3>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(rawResponse, null, 2)); toast.success('Copied'); }}>
                  <Copy size={12} /> Copy
                </button>
              </div>
              <pre className="code-block" style={{ maxHeight: 500, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
