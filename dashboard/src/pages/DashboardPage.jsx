import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { formatDateTime } from '../utils/dateUtils';
import { Zap, Globe, CheckCircle, XCircle, TrendingUp, Clock } from 'lucide-react';

export default function DashboardPage() {
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/account/dashboard-stats'),
    refetchInterval: 10000,
  });

  const { data: usage } = useQuery({
    queryKey: ['usage-15'],
    queryFn: () => api.get('/account/usage-billing?days=15'),
    refetchInterval: 15000,
  });

  const stats = statsData?.data || {};
  const topDomains = stats.topDomains || [];
  const recentRequests = (stats.recentRequests || []).slice(0, 10);

  // Build 15-day chart data — always generate 15 days to guarantee the chart renders
  const rawDaily = usage?.data?.dailyUsage || [];
  const buildChartData = () => {
    // Create a map from existing data
    const dataMap = {};
    rawDaily.forEach(d => {
      if (d.date) dataMap[d.date] = d;
    });

    // Generate last 15 days
    const days = [];
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const existing = dataMap[dateStr];
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      days.push({
        date: `${dd}-${mm}`,
        requests: existing?.requestCount || 0,
        success: existing?.successCount || 0,
        failed: existing?.failCount || 0,
      });
    }
    return days;
  };

  const chartData = buildChartData();

  // Detect theme for Recharts (SVG can't use CSS vars)
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const chartColors = {
    grid: isDark ? '#2a2a3a' : '#e5e7eb',
    text: isDark ? '#64748b' : '#9ca3af',
    primary: '#6366f1',
    success: '#10b981',
    tooltipBg: isDark ? '#16161f' : '#ffffff',
    tooltipBorder: isDark ? '#2a2a3a' : '#e5e7eb',
    tooltipText: isDark ? '#f1f5f9' : '#1e293b',
    tooltipLabel: isDark ? '#94a3b8' : '#475569',
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Real-time platform overview and analytics</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <StatCard icon={Zap} label="Total Scrapes" value={stats.totalRequests || 0} color="var(--sf-primary)" />
        <StatCard icon={CheckCircle} label="Successful" value={stats.successCount || 0} color="var(--sf-success)" />
        <StatCard icon={XCircle} label="Failed" value={stats.failCount || 0} color="var(--sf-danger)" />
        <StatCard icon={TrendingUp} label="Credits Used" value={stats.totalUsedCredits || 0} color="var(--sf-warning)" />
        <StatCard icon={Globe} label="Success Rate" value={`${stats.successRate != null ? stats.successRate : 100}%`} color="var(--sf-secondary)" />
      </div>

      {/* Charts Row */}
      <div className="grid-2" style={{ marginBottom: 28 }}>
        <div className="glass-card-static">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Scrapes (15 days)</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="requestGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.success} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={chartColors.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="date" stroke={chartColors.text} fontSize={11} tick={{ fill: chartColors.text }} />
                <YAxis stroke={chartColors.text} fontSize={11} allowDecimals={false} tick={{ fill: chartColors.text }} />
                <Tooltip
                  contentStyle={{
                    background: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 10,
                    fontFamily: 'Inter',
                    color: chartColors.tooltipText,
                  }}
                  labelStyle={{ color: chartColors.tooltipLabel }}
                />
                <Area type="monotone" dataKey="requests" stroke={chartColors.primary} fill="url(#requestGrad)" strokeWidth={2} name="Total" />
                <Area type="monotone" dataKey="success" stroke={chartColors.success} fill="url(#successGrad)" strokeWidth={1.5} name="Success" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card-static">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Top Scraped Domains</h3>
          <div style={{ height: 260, overflowY: 'auto' }}>
            {topDomains.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topDomains.map((d, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', background: 'var(--sf-bg-elevated)', borderRadius: 10,
                    border: '1px solid var(--sf-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `hsl(${i * 72}, 60%, 50%, 0.15)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: `hsl(${i * 72}, 60%, 60%)`,
                      }}>{i + 1}</div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{d.domain || d._id}</span>
                    </div>
                    <span className="badge badge-secondary">{d.count} req</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--sf-text-muted)', paddingTop: 80 }}>
                No domain data yet. Start scraping to see analytics.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Scrapes */}
      <div className="glass-card-static">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Recent Scrapes</h3>
        {recentRequests.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>URL</th><th>Status</th><th>Worker</th><th>Latency</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((r, i) => (
                  <tr key={r.requestId || i}>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.url}
                    </td>
                    <td>
                      <span className={`badge badge-${r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td><span className="badge badge-secondary">{r.workerType}</span></td>
                    <td style={{ fontFamily: 'monospace' }}>{r.latencyMs ? `${r.latencyMs}ms` : '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--sf-text-muted)' }}>
                      {r.createdAt ? formatDateTime(r.createdAt) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--sf-text-muted)', padding: 40 }}>
            <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
            <p>No scrapes yet. Head to the Playground to make your first scrape!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${color}18`, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={color} />
        </div>
      </div>
      <div className="stat-value" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
