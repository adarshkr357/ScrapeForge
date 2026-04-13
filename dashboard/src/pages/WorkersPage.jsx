import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { Activity, Wifi, WifiOff } from 'lucide-react';

export default function WorkersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['workers-stats'],
    queryFn: () => api.get('/account/workers-stats'),
    refetchInterval: 10000,
  });

  const workerStats = data?.data || [];

  const workerMeta = {
    'python-http': { label: 'Python HTTP', color: '#10b981', concurrency: 200 },
    'python-browser': { label: 'Python Browser', color: '#8b5cf6', concurrency: 50 },
    'node-browser': { label: 'Node Browser', color: '#6366f1', concurrency: 50 },
    'crawl': { label: 'Crawl Worker', color: '#06b6d4', concurrency: 100 },
    'serp': { label: 'SERP Worker', color: '#f59e0b', concurrency: 200 },
  };

  // Merge real stats with metadata
  const allWorkers = Object.entries(workerMeta).map(([type, meta]) => {
    const stats = workerStats.find(w => w.workerType === type) || {};
    return { type, ...meta, ...stats };
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Workers</h1>
        <p className="page-subtitle">Monitor worker fleet health and throughput</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {allWorkers.map(w => (
          <div className="glass-card" key={w.type}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: w.color, boxShadow: `0 0 8px ${w.color}` }} />
                <span style={{ fontWeight: 700 }}>{w.label}</span>
              </div>
              <span className={`badge ${w.total > 0 ? 'badge-success' : 'badge-secondary'}`}>
                {w.total > 0 ? 'Active' : 'Idle'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div className="stat-label">Concurrency</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: w.color }}>{w.concurrency}</div>
              </div>
              <div>
                <div className="stat-label">Total Jobs</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{(w.total || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="stat-label">Completed</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--sf-success)' }}>{(w.completed || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="stat-label">Error Rate</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: (w.errorRate || 0) > 20 ? 'var(--sf-danger)' : 'var(--sf-success)' }}>
                  {w.errorRate || 0}%
                </div>
              </div>
            </div>
            {w.avgLatency > 0 && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 13, color: 'var(--sf-text-muted)' }}>
                Avg latency: <strong style={{ color: 'var(--sf-text)' }}>{w.avgLatency}ms</strong>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
