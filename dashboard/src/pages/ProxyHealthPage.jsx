import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Shield, Activity, Server, Clock, AlertTriangle, Loader2, Trash2, CheckCircle, XCircle, CheckSquare, Square, X, Globe } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

const TARGET_PRESETS = [
  { label: 'HTTPBin (Default)', value: 'https://httpbin.org/ip' },
  { label: 'Google', value: 'https://www.google.com' },
  { label: 'Amazon', value: 'https://www.amazon.com' },
  { label: 'Netflix', value: 'https://www.netflix.com' },
  { label: 'Cloudflare', value: 'https://www.cloudflare.com' },
  { label: 'GitHub', value: 'https://github.com' },
  { label: 'Custom', value: 'custom' },
];

const PROXY_TYPES = [
  { label: 'HTTP', value: 'http' },
  { label: 'HTTPS', value: 'https' },
  { label: 'SOCKS4', value: 'socks4' },
  { label: 'SOCKS5', value: 'socks5' },
];

export default function ProxyHealthPage() {
  const queryClient = useQueryClient();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [proxyType, setProxyType] = useState('http');
  const [targetPreset, setTargetPreset] = useState('https://httpbin.org/ip');
  const [customTarget, setCustomTarget] = useState('');
  const [timeout, setTimeout_] = useState(10);
  const [selected, setSelected] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch stored results
  const { data: resultsData } = useQuery({
    queryKey: ['proxy-check-results'],
    queryFn: () => api.get('/proxy/check-results'),
    refetchInterval: 10000,
  });
  const storedResults = resultsData?.data || [];

  const checkMutation = useMutation({
    mutationFn: (payload) => api.post('/proxy/check', payload),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Proxy working! Latency: ${data.data?.latencyMs}ms`);
      } else {
        toast.error(`Proxy failed: ${data.error || data.message}`);
      }
      queryClient.invalidateQueries({ queryKey: ['proxy-check-results'] });
    },
    onError: (err) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ['proxy-check-results'] });
    }
  });

  const handleCheck = () => {
    if (!host) return toast.error('Enter proxy host');
    const targetUrl = targetPreset === 'custom' ? customTarget : targetPreset;
    if (targetPreset === 'custom' && !customTarget) return toast.error('Enter custom target URL');
    
    checkMutation.mutate({
      host,
      port: parseInt(port) || undefined,
      username: username || undefined,
      password: password || undefined,
      type: proxyType,
      targetUrl,
      timeout: timeout * 1000,
    });
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === storedResults.length) setSelected(new Set());
    else setSelected(new Set(storedResults.map(r => r._id)));
  };

  const handleDeleteSelected = async () => {
    setDeleting(true);
    try {
      await api.delete('/proxy/check-results', { resultIds: Array.from(selected) });
      toast.success(`Deleted ${selected.size} result(s)`);
      setSelected(new Set());
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['proxy-check-results'] });
    } catch (err) { toast.error(err.message); }
    finally { setDeleting(false); }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await api.delete('/proxy/check-results', { deleteAll: true });
      toast.success('All results deleted');
      setSelected(new Set());
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['proxy-check-results'] });
    } catch (err) { toast.error(err.message); }
    finally { setDeleting(false); }
  };

  const lastResult = checkMutation.data;
  const isSuccess = checkMutation.isSuccess && lastResult?.success === true;
  const isFailed = checkMutation.isSuccess && lastResult?.success === false;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Proxy Checker</h1>
        <p className="page-subtitle">Test, verify, and benchmark any proxy against global targets</p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        
        {/* Live Result (Moved Above Form) */}
        {checkMutation.isError && (
          <div className="glass-card" style={{ borderColor: 'var(--sf-danger)', borderWidth: 1, borderStyle: 'solid', animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--sf-danger)' }}>
              <AlertTriangle size={24} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Connection Failed</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{checkMutation.error.message}</div>
              </div>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="glass-card" style={{ borderColor: 'var(--sf-danger)', borderWidth: 1, borderStyle: 'solid', animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--sf-danger)' }}>
              <XCircle size={24} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Proxy Dead or Unreachable</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{lastResult.message || lastResult.error}</div>
                {lastResult.latencyMs && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Timed out after {lastResult.latencyMs}ms</div>}
              </div>
            </div>
          </div>
        )}

        {isSuccess && (
          <div className="glass-card" style={{ borderColor: 'var(--sf-success)', borderWidth: 1, borderStyle: 'solid', animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.12)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle size={24} color="var(--sf-success)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--sf-success)' }}>Proxy is Active</div>
                <div style={{ fontSize: 13, color: 'var(--sf-text-muted)' }}>Successfully connected and verified</div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
              <div className="stat-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Server size={16} color="var(--sf-primary)" />
                  <span className="stat-label" style={{ margin: 0 }}>Exit IP</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>{lastResult.data?.testedIp || 'N/A'}</div>
              </div>
              <div className="stat-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Clock size={16} color="var(--sf-warning)" />
                  <span className="stat-label" style={{ margin: 0 }}>Latency</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: lastResult.data?.latencyMs > 2000 ? 'var(--sf-danger)' : lastResult.data?.latencyMs > 800 ? 'var(--sf-warning)' : 'var(--sf-success)' }}>
                  {lastResult.data?.latencyMs}ms
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main checker Form */}
        <div className="glass-card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Test a Proxy</h3>
          
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div style={{ flex: 2 }}>
              <label className="form-label">Proxy Host *</label>
              <input className="input" placeholder="198.51.100.1 or proxy.example.com" value={host}
                onChange={e => setHost(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Port *</label>
              <input className="input" type="number" placeholder="8080" value={port}
                onChange={e => setPort(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Type *</label>
              <select className="input" value={proxyType} onChange={e => setProxyType(e.target.value)}>
                {PROXY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 12 }}>
            <div>
              <label className="form-label">Username (optional)</label>
              <input className="input" placeholder="proxy_user" value={username}
                onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Password (optional)</label>
              <input className="input" type="password" placeholder="proxy_pass" value={password}
                onChange={e => setPassword(e.target.value)} />
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 16 }}>
            <div style={{ flex: 2 }}>
              <label className="form-label">Target Website</label>
              <select className="input" value={targetPreset} onChange={e => setTargetPreset(e.target.value)}>
                {TARGET_PRESETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {targetPreset === 'custom' && (
              <div style={{ flex: 2 }}>
                <label className="form-label">Custom URL *</label>
                <input className="input" placeholder="https://example.com" value={customTarget}
                  onChange={e => setCustomTarget(e.target.value)} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <label className="form-label">Timeout (sec)</label>
              <input className="input" type="number" min={3} max={30} value={timeout}
                onChange={e => setTimeout_(parseInt(e.target.value) || 10)} />
            </div>
          </div>

          <button className="btn btn-primary" disabled={!host || !port || checkMutation.isPending}
            onClick={handleCheck} style={{ minWidth: 160 }}>
            {checkMutation.isPending
              ? <><Loader2 size={16} className="animate-spin" /> Testing...</>
              : <><Shield size={16} /> Check Proxy</>
            }
          </button>
        </div>
        {/* Stored Results Table */}
        {storedResults.length > 0 && (
          <div className="glass-card-static">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Check History ({storedResults.length})</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.size > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm('selected')}>
                    <Trash2 size={12} /> Delete ({selected.size})
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm('all')}
                  style={{ color: 'var(--sf-danger)' }}>
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <span style={{ cursor: 'pointer' }} onClick={toggleAll}>
                        {selected.size === storedResults.length && storedResults.length > 0
                          ? <CheckSquare size={14} color="var(--sf-primary)" />
                          : <Square size={14} style={{ opacity: 0.4 }} />
                        }
                      </span>
                    </th>
                    <th>Proxy</th><th>Type</th><th>Target</th><th>Status</th>
                    <th>IP</th><th>Latency</th><th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {storedResults.map(r => (
                    <tr key={r._id} style={{ background: selected.has(r._id) ? 'rgba(99,102,241,0.06)' : undefined }}>
                      <td>
                        <span style={{ cursor: 'pointer' }} onClick={() => toggleSelect(r._id)}>
                          {selected.has(r._id) ? <CheckSquare size={14} color="var(--sf-primary)" /> : <Square size={14} style={{ opacity: 0.3 }} />}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: 12 }}>{r.proxyHost}{r.proxyPort ? `:${r.proxyPort}` : ''}</code>
                      </td>
                      <td><span className="badge badge-secondary" style={{ fontSize: 10 }}>{r.proxyType?.toUpperCase()}</span></td>
                      <td style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.targetUrl?.replace('https://', '').replace('http://', '')}
                      </td>
                      <td>
                        {r.success
                          ? <CheckCircle size={14} color="var(--sf-success)" />
                          : <XCircle size={14} color="var(--sf-danger)" />
                        }
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.testedIp || '-'}</td>
                      <td style={{ 
                        fontFamily: 'monospace', fontSize: 12,
                        color: r.latencyMs > 2000 ? 'var(--sf-danger)' : r.latencyMs > 800 ? 'var(--sf-warning)' : 'var(--sf-success)'
                      }}>
                        {r.latencyMs ? `${r.latencyMs}ms` : '-'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--sf-text-muted)' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showDeleteConfirm === 'all' ? 'Clear All Results' : 'Delete Selected'}</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p>{showDeleteConfirm === 'all' ? 'Delete all proxy check results?' : `Delete ${selected.size} selected result(s)?`}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={deleting}
                onClick={showDeleteConfirm === 'all' ? handleDeleteAll : handleDeleteSelected}>
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
