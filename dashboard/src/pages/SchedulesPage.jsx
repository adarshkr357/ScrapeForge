import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Clock, Plus, Trash2, X, Loader2, Pause, Play } from 'lucide-react';

const SCHEDULE_TYPES = ['scrape', 'crawl', 'actor', 'search'];
const CRON_PRESETS = [
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Every 15 min', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1' },
  { label: 'Monthly (1st)', value: '0 0 1 * *' },
];

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', type: 'scrape', cron: '0 * * * *', timezone: 'UTC',
    config: '{\n  "url": "https://example.com",\n  "output_format": "json"\n}',
  });

  const { data } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.get('/schedule'),
  });
  const schedules = data?.data || [];

  const createSchedule = async () => {
    if (!form.name || !form.cron) return toast.error('Name and cron expression are required');
    setLoading(true);
    try {
      let config;
      try { config = JSON.parse(form.config); } catch { return toast.error('Invalid JSON config'); }

      await api.post('/schedule', {
        name: form.name,
        description: form.description,
        type: form.type,
        cron: form.cron,
        timezone: form.timezone,
        config,
      });
      toast.success('Schedule created!');
      setShowCreate(false);
      setForm({
        name: '', description: '', type: 'scrape', cron: '0 * * * *', timezone: 'UTC',
        config: '{\n  "url": "https://example.com",\n  "output_format": "json"\n}',
      });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSchedule = async (schedule) => {
    try {
      await api.put(`/schedule/${schedule.scheduleId}`, { isActive: !schedule.isActive });
      toast.success(schedule.isActive ? 'Schedule paused' : 'Schedule activated');
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteSchedule = async (scheduleId) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await api.delete(`/schedule/${scheduleId}`);
      toast.success('Schedule deleted');
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Schedules</h1>
          <p className="page-subtitle">Automated recurring scrape jobs</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="glass-card empty-state">
          <Clock size={48} className="empty-state-icon" style={{ color: 'var(--sf-warning)' }} />
          <p>No schedules configured. Create one to automate your scraping.</p>
        </div>
      ) : (
        <div className="glass-card-static">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th><th>Cron</th><th>Type</th><th>Status</th>
                  <th>Last Run</th><th>Runs</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.scheduleId}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><code style={{ fontSize: 12, color: 'var(--sf-primary-light)' }}>{s.cron}</code></td>
                    <td><span className="badge badge-purple">{s.type}</span></td>
                    <td>
                      {s.isActive
                        ? <span className="badge badge-success">Active</span>
                        : <span className="badge badge-danger">Paused</span>}
                    </td>
                    <td style={{ color: 'var(--sf-text-muted)', fontSize: 13 }}>
                      {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : 'Never'}
                    </td>
                    <td>{s.totalRuns || 0}</td>
                    <td>
                      <div className="actions-cell">
                        <button className="btn btn-ghost btn-icon" title={s.isActive ? 'Pause' : 'Activate'}
                          onClick={() => toggleSchedule(s)}>
                          {s.isActive ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Delete" onClick={() => deleteSchedule(s.scheduleId)}>
                          <Trash2 size={14} color="var(--sf-danger)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Schedule Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Schedule</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Schedule Name *</label>
                <input className="input" placeholder="Daily product scrape" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="input" placeholder="Optional description" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Timezone</label>
                  <input className="input" value={form.timezone}
                    onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="UTC" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Cron Expression *</label>
                <input className="input" value={form.cron}
                  onChange={e => setForm({ ...form, cron: e.target.value })} placeholder="0 * * * *"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {CRON_PRESETS.map(p => (
                    <button key={p.value} className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '4px 8px', border: form.cron === p.value ? '1px solid var(--sf-primary)' : '1px solid var(--sf-border)' }}
                      onClick={() => setForm({ ...form, cron: p.value })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Config (JSON)</label>
                <textarea className="input" value={form.config}
                  onChange={e => setForm({ ...form, config: e.target.value })} rows={5}
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createSchedule} disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />} Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
