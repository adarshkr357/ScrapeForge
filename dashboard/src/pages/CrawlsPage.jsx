import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Globe, Plus, Loader2, X, StopCircle, RefreshCw, Trash2, CheckSquare, Square, Database, Eye, ExternalLink, Download, RotateCcw, Copy, Map, Settings2 } from 'lucide-react';

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080/api/v1`;

export default function CrawlsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [viewCrawl, setViewCrawl] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    url: '', max_pages: 100, max_depth: 3,
    include_patterns: '', exclude_patterns: '',
    respect_robots_txt: true, follow_sitemaps: true,
    scraper_type: 'auto',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crawls'],
    queryFn: async () => {
      const res = await api.get('/crawl');
      return res;
    },
    refetchInterval: 10000,
  });

  const crawls = data?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (payload) => api.request('DELETE', '/crawl', payload),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deletedCount || 0} crawls`);
      setSelected(new Set());
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['crawls'] });
    },
    onError: (err) => toast.error(err.message)
  });

  const startCrawl = async () => {
    if (!form.url) return toast.error('Enter a URL');
    setLoading(true);
    try {
      const body = {
        url: form.url,
        max_pages: parseInt(form.max_pages) || 100,
        max_depth: parseInt(form.max_depth) || 3,
        respect_robots_txt: form.respect_robots_txt,
        follow_sitemaps: form.follow_sitemaps,
        scraper_type: form.scraper_type || 'auto',
      };
      if (form.include_patterns.trim()) {
        body.include_patterns = form.include_patterns.split(',').map(p => p.trim()).filter(Boolean);
      }
      if (form.exclude_patterns.trim()) {
        body.exclude_patterns = form.exclude_patterns.split(',').map(p => p.trim()).filter(Boolean);
      }

      const res = await api.post('/crawl', body);
      toast.success(`Crawl started! ID: ${res.crawlId}`);
      setShowModal(false);
      setForm({ url: '', max_pages: 100, max_depth: 3, include_patterns: '', exclude_patterns: '', respect_robots_txt: true, follow_sitemaps: true, scraper_type: 'auto' });
      queryClient.invalidateQueries({ queryKey: ['crawls'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReCrawl = (crawl) => {
    setForm({
      url: crawl.baseUrl || '',
      max_pages: crawl.maxPages || 100,
      max_depth: crawl.maxDepth || 3,
      include_patterns: '',
      exclude_patterns: '',
      respect_robots_txt: true,
      follow_sitemaps: true,
      scraper_type: crawl.config?.scraperType || 'auto',
    });
    setShowModal(true);
  };

  const handleDownloadResults = async (crawlId) => {
    try {
      const token = localStorage.getItem('sf_token');
      const response = await fetch(`${API_BASE}/datasets?crawlId=${crawlId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('No dataset found for this crawl');
      const data = await response.json();
      const datasets = data.data || [];
      if (datasets.length === 0) {
        toast.error('No dataset available for this crawl yet');
        return;
      }
      // Download the first matching dataset
      const dsId = datasets[0].datasetId;
      const dlResponse = await fetch(`${API_BASE}/datasets/${dsId}?format=json`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const blob = await dlResponse.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `crawl_${crawlId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success('Download started');
    } catch (err) {
      toast.error(err.message || 'Download failed');
    }
  };

  const toggleSelectAll = () => {
    if (selected.size === crawls.length && crawls.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(crawls.map(c => c.crawlId || c._id)));
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleDeleteSelected = () => {
    deleteMutation.mutate({ crawlIds: Array.from(selected) });
  };

  const handleDeleteAll = () => {
    deleteMutation.mutate({ crawlIds: [] });
  };

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Crawls</h1>
          <p className="page-subtitle">Site-wide crawl jobs and progress tracking</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selected.size > 0 && (
            <button className="btn btn-danger" onClick={() => setShowDeleteConfirm('selected')}>
              <Trash2 size={14} /> Delete ({selected.size})
            </button>
          )}
          {crawls.length > 0 && (
            <button className="btn btn-danger btn-secondary" onClick={() => setShowDeleteConfirm('all')}
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: 'var(--sf-danger)' }}>
              <Trash2 size={14} /> Delete All
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => refetch()}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Start Crawl
          </button>
          <button className="btn btn-secondary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            <Map size={14} /> Map API <span className="badge badge-info" style={{ marginLeft: 4, fontSize: 10 }}>Soon</span>
          </button>
        </div>
      </div>

      {crawls.length === 0 ? (
        <div className="glass-card empty-state">
          <Globe size={48} className="empty-state-icon" style={{ color: 'var(--sf-primary)' }} />
          <p>No active crawls. Click "Start Crawl" to begin crawling a website.</p>
        </div>
      ) : (
        <div className="glass-card-static">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <span style={{ cursor: 'pointer' }} onClick={toggleSelectAll}>
                      {selected.size === crawls.length && crawls.length > 0
                        ? <CheckSquare size={16} color="var(--sf-primary)" />
                        : <Square size={16} style={{ opacity: 0.4 }} />
                      }
                    </span>
                  </th>
                  <th>Crawl ID</th><th>URL</th><th>Status</th><th>Progress</th>
                  <th>Pages</th><th>Credits</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {crawls.map(c => {
                  const id = c.crawlId || c._id;
                  return (
                    <tr key={id} style={{ background: selected.has(id) ? 'rgba(99,102,241,0.06)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ cursor: 'pointer' }} onClick={() => toggleSelect(id)}>
                          {selected.has(id)
                            ? <CheckSquare size={16} color="var(--sf-primary)" />
                            : <Square size={16} style={{ opacity: 0.3 }} />
                          }
                        </span>
                      </td>
                      <td><code style={{ fontSize: 12, color: 'var(--sf-primary-light)' }}>{c.crawlId}</code></td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.baseUrl}</td>
                      <td>
                        <span className={`badge ${c.status === 'completed' ? 'badge-success' : c.status === 'failed' ? 'badge-danger' : c.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div className="progress-bar-fill" style={{ width: `${c.pagesFound > 0 ? Math.round((c.pagesScraped / c.pagesFound) * 100) : 0}%` }} />
                        </div>
                      </td>
                      <td>{c.pagesScraped || 0}/{c.pagesFound || 0}</td>
                      <td>{c.creditsUsed || 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* View Summary */}
                          <button className="btn btn-ghost btn-icon" title="View Crawl Summary"
                            onClick={() => setViewCrawl(c)}
                            style={{ padding: '4px 8px' }}>
                            <Eye size={14} color="var(--sf-primary)" />
                          </button>
                          {/* Open base URL */}
                          <a href={c.baseUrl} target="_blank" rel="noreferrer"
                            className="btn btn-ghost btn-icon" title="Open URL"
                            style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                            <ExternalLink size={14} color="var(--sf-text-muted)" />
                          </a>
                          {/* Copy Crawl ID */}
                          <button className="btn btn-ghost btn-icon" title="Copy Crawl ID"
                            onClick={() => { navigator.clipboard.writeText(c.crawlId); toast.success('Crawl ID copied'); }}
                            style={{ padding: '4px 8px' }}>
                            <Copy size={14} color="var(--sf-text-muted)" />
                          </button>
                          {/* Download Results */}
                          {c.status === 'completed' && (
                            <button className="btn btn-ghost btn-icon" title="Download Results"
                              onClick={() => handleDownloadResults(c.crawlId)}
                              style={{ padding: '4px 8px' }}>
                              <Download size={14} color="var(--sf-success)" />
                            </button>
                          )}
                          {/* View Dataset */}
                          {(c.status === 'completed' || c.status === 'running') && (
                            <Link to={`/datasets?crawlId=${c.crawlId}`} className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '4px 10px' }}>
                              <Database size={12} /> Dataset
                            </Link>
                          )}
                          {/* Re-crawl */}
                          {c.status === 'completed' && (
                            <button className="btn btn-ghost btn-icon" title="Re-crawl"
                              onClick={() => handleReCrawl(c)}
                              style={{ padding: '4px 8px' }}>
                              <RotateCcw size={14} color="var(--sf-warning)" />
                            </button>
                          )}
                          {/* Cancel */}
                          {(c.status === 'running' || c.status === 'queued') && (
                            <button className="btn btn-danger btn-sm" style={{ fontSize: 11, padding: '4px 10px' }}
                              onClick={async () => {
                                try {
                                  await api.post(`/crawl/${c.crawlId}/cancel`);
                                  toast.success('Crawl cancelled');
                                  refetch();
                                } catch (err) { toast.error(err.message); }
                              }}>
                              <StopCircle size={12} /> Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showDeleteConfirm === 'all' ? 'Delete All Crawls' : 'Delete Selected'}</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="confirm-icon" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                <Trash2 size={28} color="var(--sf-danger)" />
              </div>
              <p>
                {showDeleteConfirm === 'all'
                  ? `Are you sure you want to delete all ${crawls.length} crawls? This action cannot be undone.`
                  : `Are you sure you want to delete ${selected.size} selected crawl(s)? This action cannot be undone.`
                }
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={deleteMutation.isPending}
                onClick={showDeleteConfirm === 'all' ? handleDeleteAll : handleDeleteSelected}>
                {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {showDeleteConfirm === 'all' ? ' Delete All' : ' Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Crawl Summary Modal */}
      {viewCrawl && (
        <div className="modal-backdrop" onClick={() => setViewCrawl(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 680, width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3>Crawl Summary</h3>
                <div style={{ fontSize: 11, color: 'var(--sf-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{viewCrawl.crawlId}</div>
              </div>
              <button className="modal-close" onClick={() => setViewCrawl(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  ['Base URL', viewCrawl.baseUrl],
                  ['Scraper Engine', viewCrawl.config?.scraperType || 'auto'],
                  ['Status', viewCrawl.status],
                  ['Pages Scraped', viewCrawl.pagesScraped],
                  ['Pages Found', viewCrawl.pagesFound],
                  ['Max Pages', viewCrawl.maxPages],
                  ['Max Depth', viewCrawl.maxDepth],
                  ['Credits Used', viewCrawl.creditsUsed],
                  ['Started', viewCrawl.createdAt ? new Date(viewCrawl.createdAt).toLocaleString() : '-'],
                  ['Completed', viewCrawl.completedAt ? new Date(viewCrawl.completedAt).toLocaleString() : '-'],
                  ...(viewCrawl.errorMessage ? [['Error', viewCrawl.errorMessage]] : []),
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '10px 14px', background: 'var(--sf-bg-elevated)', borderRadius: 8, border: '1px solid var(--sf-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--sf-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                    <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{String(v ?? '-')}</div>
                  </div>
                ))}
              </div>
              {viewCrawl.startUrls?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Seed URLs</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {viewCrawl.startUrls.slice(0, 5).map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13, color: 'var(--sf-primary)', wordBreak: 'break-all' }}>{u}</a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {(viewCrawl.status === 'completed' || viewCrawl.status === 'running') && (
                <Link to={`/datasets?crawlId=${viewCrawl.crawlId}`} className="btn btn-primary" onClick={() => setViewCrawl(null)}>
                  <Database size={14} /> View Dataset
                </Link>
              )}
              <button className="btn btn-secondary" onClick={() => setViewCrawl(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Start Crawl Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Start New Crawl</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Website URL *</label>
                <input className="input" placeholder="https://example.com" value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Max Pages</label>
                  <input className="input" type="number" value={form.max_pages}
                    onChange={e => setForm({ ...form, max_pages: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Depth</label>
                  <input className="input" type="number" value={form.max_depth}
                    onChange={e => setForm({ ...form, max_depth: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Include Patterns (comma separated)</label>
                <input className="input" placeholder="/blog/*, /docs/*" value={form.include_patterns}
                  onChange={e => setForm({ ...form, include_patterns: e.target.value })} />
                <div className="form-hint">Only crawl URLs matching these patterns</div>
              </div>
              <div className="form-group">
                <label className="form-label">Exclude Patterns (comma separated)</label>
                <input className="input" placeholder="/admin/*, /api/*" value={form.exclude_patterns}
                  onChange={e => setForm({ ...form, exclude_patterns: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Settings2 size={14} /> Scraper Engine
                </label>
                <select className="input" value={form.scraper_type}
                  onChange={e => setForm({ ...form, scraper_type: e.target.value })}>
                  <option value="auto">Auto (Recommended)</option>
                  <option value="http">HTTP — Fast, static pages</option>
                  <option value="browser">Browser — Selenium stealth</option>
                  <option value="node-browser">Node Browser — Playwright JS rendering</option>
                </select>
                <div className="form-hint">Select the scraping engine used for each page in the crawl</div>
              </div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.respect_robots_txt}
                    onChange={e => setForm({ ...form, respect_robots_txt: e.target.checked })} />
                  <span>Respect robots.txt</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.follow_sitemaps}
                    onChange={e => setForm({ ...form, follow_sitemaps: e.target.checked })} />
                  <span>Follow sitemaps</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={startCrawl} disabled={loading}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Starting...</> : <><Globe size={16} /> Start Crawl</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
