import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import { formatDateTime } from '../utils/dateUtils';
import { Globe, Loader2, CheckCircle, XCircle, Trash2, CheckSquare, Square, X, Eye } from 'lucide-react';

export default function ScrapeHistoryPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [viewModal, setViewModal] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['requests'],
    queryFn: async () => {
      const res = await api.get('/account/scrape-history?limit=200');
      return res.data?.requests || [];
    },
    refetchInterval: (query) => {
      const currentData = query.state?.data;
      const hasPending = currentData?.some(r => r.status === 'queued' || r.status === 'processing');
      return hasPending ? 3000 : false;
    }
  });

  const { data: viewResult, isLoading: viewLoading } = useQuery({
    queryKey: ['result', viewModal?.requestId],
    queryFn: async () => {
      if (!viewModal?.requestId) return null;
      try {
        const res = await api.get(`/scrape/${viewModal.requestId}`);
        return res.data;
      } catch (err) {
        return { error: err.message };
      }
    },
    enabled: !!viewModal?.requestId,
  });

  const requests = data || [];

  // ── Server-side soft delete (sets userHidden=true in DB) ──
  const deleteMutation = useMutation({
    mutationFn: (requestIds) => api.delete('/account/scrape-history', { requestIds }),
    onSuccess: (res, requestIds) => {
      const count = requestIds?.length || requests.length;
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success(`Deleted ${count} request${count !== 1 ? 's' : ''}`);
      setSelected(new Set());
      setShowDeleteConfirm(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDeleteSelected = () => {
    const ids = Array.from(selected);
    deleteMutation.mutate(ids);
  };

  const handleDeleteAll = () => {
    deleteMutation.mutate([]);
  };

  const toggleSelectAll = () => {
    if (selected.size === requests.length && requests.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(requests.map(r => r.requestId)));
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle size={14} style={{ color: 'var(--sf-success)' }} />;
      case 'failed': return <XCircle size={14} style={{ color: 'var(--sf-danger)' }} />;
      default: return <Loader2 size={14} className="animate-spin" style={{ color: 'var(--sf-warning)' }} />;
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Scrape History</h1>
          <p className="page-subtitle">View and monitor all scrape and crawl requests</p>
        </div>
        {requests.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selected.size > 0 && (
              <button className="btn btn-danger" onClick={() => setShowDeleteConfirm('selected')}>
                <Trash2 size={14} /> Delete Selected ({selected.size})
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm('all')}
              style={{ borderColor: 'rgba(239,68,68,0.4)', color: 'var(--sf-danger)' }}>
              <Trash2 size={14} /> Delete All
            </button>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>
                <span style={{ cursor: 'pointer' }} onClick={toggleSelectAll}>
                  {selected.size === requests.length && requests.length > 0
                    ? <CheckSquare size={16} color="var(--sf-primary)" />
                    : <Square size={16} style={{ opacity: 0.4 }} />
                  }
                </span>
              </th>
              <th>Request ID</th>
              <th>URL</th>
              <th>Status</th>
              <th>Worker</th>
              <th>Stealth</th>
              <th>Credits</th>
              <th>Latency</th>
              <th>Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10}><div className="skeleton" style={{ height: 40 }} /></td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--sf-text-muted)', padding: 40 }}>
                <Globe size={32} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
                <p>No scrapes yet. Try the Playground to make your first request!</p>
              </td></tr>
            ) : (
              requests.map(r => (
                <tr key={r.requestId} style={{ background: selected.has(r.requestId) ? 'rgba(99,102,241,0.06)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ cursor: 'pointer' }} onClick={() => toggleSelect(r.requestId)}>
                      {selected.has(r.requestId)
                        ? <CheckSquare size={16} color="var(--sf-primary)" />
                        : <Square size={16} style={{ opacity: 0.3 }} />
                      }
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--sf-text-muted)' }}>
                    {r.requestId?.substring(0, 20)}…
                  </td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{r.url}</a>
                  </td>
                  <td>
                    <div className={`badge badge-${r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {getStatusIcon(r.status)}
                      <span style={{ textTransform: 'capitalize' }}>{r.status}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-secondary">{r.workerType}</span></td>
                  <td style={{ textAlign: 'center', fontSize: 13 }}>{r.stealthLevel || '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.creditsUsed ?? '-'}</td>
                  <td style={{ color: r.latencyMs > 5000 ? 'var(--sf-warning)' : 'inherit' }}>
                    {r.latencyMs ? `${r.latencyMs}ms` : '-'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--sf-text-muted)' }}>
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-icon" title="View Response"
                      onClick={() => setViewModal(r)}
                      style={{ padding: '4px 8px' }}>
                      <Eye size={14} color="var(--sf-primary)" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* View Response Modal */}
      {viewModal && (
        <div className="modal-backdrop" onClick={() => setViewModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 720, width: '92%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3>Request Details</h3>
                <div style={{ fontSize: 12, color: 'var(--sf-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                  {viewModal.requestId}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  ['URL', viewModal.url],
                  ['Status', viewModal.status],
                  ['Worker', viewModal.workerType],
                  ['Stealth', viewModal.stealthLevel],
                  ['Credits', viewModal.creditsUsed],
                  ['Latency', viewModal.latencyMs ? `${viewModal.latencyMs}ms` : '-'],
                  ['Created', formatDateTime(viewModal.createdAt)],
                  ...(viewModal.errorMessage ? [['Error', viewModal.errorMessage]] : []),
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '10px 14px', background: 'var(--sf-bg-elevated)', borderRadius: 8, border: '1px solid var(--sf-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--sf-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                    <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{String(v ?? '-')}</div>
                  </div>
                ))}
              </div>

              {/* Output / Response Details */}
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--sf-text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>Output / Response</h4>
                {viewLoading ? (
                  <div className="skeleton" style={{ height: 120, borderRadius: 8 }}></div>
                ) : (
                  <pre className="code-block" style={{ fontSize: 12, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {JSON.stringify(viewResult || (viewModal.errorMessage ? { error: viewModal.errorMessage } : { message: 'No output recorded' }), null, 2)}
                  </pre>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showDeleteConfirm === 'all' ? 'Delete All Scrapes' : 'Delete Selected'}</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="confirm-icon" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                <Trash2 size={28} color="var(--sf-danger)" />
              </div>
              <p style={{ marginBottom: 8 }}>
                {showDeleteConfirm === 'all'
                  ? `This will hide all ${requests.length} scrapes from your history.`
                  : `This will hide ${selected.size} selected scrape(s) from your history.`
                }
              </p>
              <p style={{ fontSize: 13, color: 'var(--sf-text-muted)' }}>
                Records are hidden from your view only — dashboard stats remain accurate.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger"
                onClick={showDeleteConfirm === 'all' ? handleDeleteAll : handleDeleteSelected}>
                <Trash2 size={16} />
                {showDeleteConfirm === 'all' ? ' Hide All' : ' Hide Selected'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
