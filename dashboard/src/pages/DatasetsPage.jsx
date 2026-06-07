import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Database, Download, Trash2, CheckSquare, Square, X, Loader2, FileJson, FileText, FileSpreadsheet, Eye } from 'lucide-react';

const API_BASE = `${window.location.origin}/api/v1`;

export default function DatasetsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('json');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null); // 'selected' | 'all' | null
  const [viewData, setViewData] = useState(null);
  const [modalViewMode, setModalViewMode] = useState('code');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => api.get('/datasets'),
    refetchInterval: 15000,
  });
  const datasets = data?.data || [];

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === datasets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(datasets.map(d => d.datasetId)));
    }
  };

  const handleDownload = async (datasetId, format) => {
    try {
      const token = localStorage.getItem('sf_token');
      const url = `${API_BASE}/datasets/${datasetId}?format=${format}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Download failed');

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `dataset_${datasetId}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) filename = match[1];
      }

      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err.message || 'Download failed');
    }
  };

  const handleViewData = async (datasetId) => {
    setLoadingData(true);
    setViewData({ id: datasetId, loading: true, data: null });
    try {
      const token = localStorage.getItem('sf_token');
      const url = `${API_BASE}/datasets/${datasetId}?format=json`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load dataset data');
      const json = await response.json();
      
      let createdPdfUrl = null;
      if (Array.isArray(json) && json.length > 0) {
        const first = json[0];
        const pdfBase64 = first.pdfBase64 || first.data?.pdfBase64;
        if (pdfBase64) {
          try {
            const byteCharacters = atob(pdfBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            createdPdfUrl = URL.createObjectURL(blob);
            setPdfBlobUrl(createdPdfUrl);
          } catch(e) {}
        }
      }

      setViewData({ id: datasetId, loading: false, data: json });
    } catch (err) {
      toast.error(err.message || 'Failed to load dataset');
      setViewData(null);
    } finally {
      setLoadingData(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await api.delete('/datasets', { datasetIds: Array.from(selected) });
      toast.success(`Deleted ${selected.size} dataset(s)`);
      setSelected(new Set());
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await api.delete('/datasets', { deleteAll: true });
      toast.success('All datasets deleted');
      setSelected(new Set());
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOne = async (datasetId) => {
    try {
      await api.delete(`/datasets/${datasetId}`);
      toast.success('Dataset deleted');
      setSelected(prev => { const n = new Set(prev); n.delete(datasetId); return n; });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Datasets</h1>
          <p className="page-subtitle">Browse and download scraped data collections</p>
        </div>
        {datasets.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selected.size > 0 && (
              <button className="btn btn-danger" onClick={() => setShowDeleteConfirm('selected')}>
                <Trash2 size={14} /> Delete Selected ({selected.size})
              </button>
            )}
            <button className="btn btn-danger btn-secondary" onClick={() => setShowDeleteConfirm('all')}
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: 'var(--sf-danger)' }}>
              <Trash2 size={14} /> Delete All
            </button>
          </div>
        )}
      </div>

      {datasets.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: 60 }}>
          <Database size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--sf-secondary)' }} />
          <p style={{ color: 'var(--sf-text-muted)' }}>No datasets yet. They are created automatically from scrape and crawl jobs.</p>
        </div>
      ) : (
        <div className="glass-card">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <span style={{ cursor: 'pointer' }} onClick={toggleAll}>
                    {selected.size === datasets.length && datasets.length > 0
                      ? <CheckSquare size={16} color="var(--sf-primary)" />
                      : <Square size={16} style={{ opacity: 0.4 }} />
                    }
                  </span>
                </th>
                <th>Name</th><th>Items</th><th>Size</th><th>Source</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map(d => (
                <tr key={d.datasetId} style={{ background: selected.has(d.datasetId) ? 'rgba(99,102,241,0.06)' : undefined }}>
                  <td>
                    <span style={{ cursor: 'pointer' }} onClick={() => toggleSelect(d.datasetId)}>
                      {selected.has(d.datasetId)
                        ? <CheckSquare size={16} color="var(--sf-primary)" />
                        : <Square size={16} style={{ opacity: 0.3 }} />
                      }
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td>{d.itemCount}</td>
                  <td>{(d.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td><span className="badge badge-info">{d.sourceType}</span></td>
                  <td style={{ color: 'var(--sf-text-muted)' }}>{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" title="View Data"
                        onClick={() => { handleViewData(d.datasetId); setModalViewMode('code'); setPdfBlobUrl(null); }}
                        style={{ padding: '4px 8px', color: 'var(--sf-primary)' }}>
                        <Eye size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Download JSON"
                        onClick={() => handleDownload(d.datasetId, 'json')}
                        style={{ padding: '4px 8px' }}>
                        <FileJson size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Download CSV"
                        onClick={() => handleDownload(d.datasetId, 'csv')}
                        style={{ padding: '4px 8px' }}>
                        <FileSpreadsheet size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Download NDJSON"
                        onClick={() => handleDownload(d.datasetId, 'ndjson')}
                        style={{ padding: '4px 8px' }}>
                        <FileText size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Delete"
                        onClick={() => handleDeleteOne(d.datasetId)}
                        style={{ padding: '4px 8px', color: 'var(--sf-danger)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showDeleteConfirm === 'all' ? 'Delete All Datasets' : 'Delete Selected Datasets'}</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="confirm-icon" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                <Trash2 size={28} color="var(--sf-danger)" />
              </div>
              <p>
                {showDeleteConfirm === 'all'
                  ? `Are you sure you want to delete all ${datasets.length} datasets? This action cannot be undone.`
                  : `Are you sure you want to delete ${selected.size} selected dataset(s)? This action cannot be undone.`
                }
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={deleting}
                onClick={showDeleteConfirm === 'all' ? handleDeleteAll : handleDeleteSelected}>
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {showDeleteConfirm === 'all' ? ' Delete All' : ' Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Data Modal */}
      {viewData && (
        <div className="modal-backdrop" onClick={() => setViewData(null)}>
          <div className="modal" style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <h3 style={{ margin: 0 }}>Dataset Content - {viewData.id}</h3>
                <div className="tabs" style={{ background: 'var(--sf-bg)', border: '1px solid var(--sf-border)', padding: 2, borderRadius: 6, marginRight: 16 }}>
                  <button className={`tab ${modalViewMode === 'code' ? 'active' : ''}`} style={{ padding: '2px 12px', fontSize: 11 }} onClick={() => setModalViewMode('code')}>Code</button>
                  <button className={`tab ${modalViewMode === 'preview' ? 'active' : ''}`} style={{ padding: '2px 12px', fontSize: 11 }} onClick={() => setModalViewMode('preview')}>Visual Preview</button>
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewData(null)}><X size={16} /></button>
            </div>
            
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', background: modalViewMode === 'code' ? 'var(--sf-code-bg, var(--sf-bg-primary))' : 'var(--sf-bg-elevated)', borderRadius: 8, padding: 16, margin: '0 24px' }}>
              {viewData.loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--sf-text-muted)' }}>
                  <Loader2 className="animate-spin" size={24} style={{ marginRight: 10 }} /> Loading data...
                </div>
              ) : modalViewMode === 'code' ? (
                <pre style={{ margin: 0, color: 'var(--sf-primary-light)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {JSON.stringify(viewData.data, null, 2)}
                </pre>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {(() => {
                    const first = Array.isArray(viewData.data) ? viewData.data[0] : viewData.data;
                    if (!first) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--sf-text-muted)' }}>Empty dataset.</div>;
                    
                    const screenshot = first.screenshotBase64 || first.data?.screenshotBase64;
                    const html = first.html || first.data?.html || first.rawHtml || first.data?.rawHtml;
                    const hasPdf = first.pdfBase64 || first.data?.pdfBase64;

                    if (screenshot) {
                      return <div style={{ display: 'flex', justifyContent: 'center' }}><img src={`data:image/png;base64,${screenshot}`} style={{ maxWidth: '100%', borderRadius: 4 }} alt="Screenshot" /></div>;
                    } else if (hasPdf && pdfBlobUrl) {
                      return <iframe src={pdfBlobUrl} style={{ width: '100%', height: 500, border: 'none', borderRadius: 8 }} title="PDF" />;
                    } else if (html) {
                      return <iframe srcDoc={html} style={{ width: '100%', height: 500, border: 'none', borderRadius: 8, background: '#fff' }} title="HTML Preview" />;
                    } else {
                      return <div style={{ padding: 40, textAlign: 'center', color: 'var(--sf-text-muted)' }}>No visual data (HTML, PDF, or Screenshot) found in the first item.</div>;
                    }
                  })()}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setViewData(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
