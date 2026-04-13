import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Webhook, Plus, Trash2, X, Loader2, Copy, AlertTriangle } from 'lucide-react';

const AVAILABLE_EVENTS = [
  'scrape.completed', 'scrape.failed',
  'crawl.completed', 'crawl.failed', 'crawl.progress',
  'schedule.triggered', 'schedule.failed',
];

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showSecret, setShowSecret] = useState(null); // { webhookId, secret, url }
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    url: '',
    events: ['scrape.completed'],
  });

  const { data } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks'),
  });
  const webhooks = data?.data || [];

  const toggleEvent = (event) => {
    setForm(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  };

  const createWebhook = async () => {
    if (!form.url) return toast.error('Enter a webhook URL');
    if (form.events.length === 0) return toast.error('Select at least one event');
    setLoading(true);
    try {
      const res = await api.post('/webhooks', {
        url: form.url,
        events: form.events,
      });
      setShowCreate(false);
      setShowSecret({
        secret: res.data?.secret,
        url: form.url,
      });
      setForm({ url: '', events: ['scrape.completed'] });
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteWebhook = async (webhookId) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await api.delete(`/webhooks/${webhookId}`);
      toast.success('Webhook deleted');
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Webhooks</h1>
          <p className="page-subtitle">Configure result delivery endpoints</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Add Webhook
        </button>
      </div>

      {webhooks.length === 0 ? (
        <div className="glass-card empty-state">
          <Webhook size={48} className="empty-state-icon" style={{ color: 'var(--sf-info)' }} />
          <p>No webhooks configured. Add one to receive real-time notifications for scraping events.</p>
        </div>
      ) : (
        <div className="glass-card-static">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>URL</th><th>Events</th><th>Status</th>
                  <th>Deliveries</th><th>Failures</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(w => (
                  <tr key={w.webhookId}>
                    <td style={{ fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.url}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {w.events?.map(e => (
                          <span key={e} className="badge badge-info" style={{ fontSize: 10 }}>{e}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {w.isActive !== false
                        ? <span className="badge badge-success">Active</span>
                        : <span className="badge badge-danger">Inactive</span>}
                    </td>
                    <td>{w.totalDeliveries || 0}</td>
                    <td>{w.totalFailures || 0}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon" title="Delete" onClick={() => deleteWebhook(w.webhookId)}>
                        <Trash2 size={14} color="var(--sf-danger)" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Webhook Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Webhook</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Endpoint URL *</label>
                <input className="input" placeholder="https://your-server.com/webhook" value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })} />
                <div className="form-hint">We'll send POST requests to this URL</div>
              </div>
              <div className="form-group">
                <label className="form-label">Events *</label>
                <div className="checkbox-group">
                  {AVAILABLE_EVENTS.map(event => (
                    <label key={event} className="checkbox-label">
                      <input type="checkbox" checked={form.events.includes(event)}
                        onChange={() => toggleEvent(event)} />
                      <span>{event}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createWebhook} disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Webhook size={16} />} Create Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secret Display Modal */}
      {showSecret && (
        <div className="modal-backdrop" onClick={() => setShowSecret(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Webhook Created!</h3>
              <button className="modal-close" onClick={() => setShowSecret(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Webhook size={28} color="var(--sf-success)" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Signing Secret</label>
                <div className="api-key-display">
                  {showSecret.secret}
                  <button className="copy-btn" onClick={() => {
                    navigator.clipboard.writeText(showSecret.secret);
                    toast.success('Secret copied!');
                  }}>
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>

              <div className="callout-warning">
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>Store this secret securely — it will not be shown again. Use it to verify webhook signatures.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowSecret(null)} style={{ width: '100%', justifyContent: 'center' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
