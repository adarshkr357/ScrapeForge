import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/client';
import { TrendingUp, Zap, CheckCircle, XCircle, CreditCard } from 'lucide-react';

export default function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['usage15'],
    queryFn: () => api.get('/account/usage?days=15'),
    refetchInterval: 15000,
  });

  const usage = data?.data || {};
  const totals = usage.totals || {};
  const apiKey = usage.currentApiKey || {};
  const rawDaily = usage.dailyUsage || [];

  // Always generate 15 days of data so charts always render
  const buildChartData = () => {
    const dataMap = {};
    rawDaily.forEach(d => {
      if (d.date) dataMap[d.date] = d;
    });

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
        credits: existing?.creditsUsed || 0,
        requests: existing?.requestCount || 0,
        success: existing?.successCount || 0,
        failed: existing?.failCount || 0,
      });
    }
    return days;
  };

  const chartData = buildChartData();

  // Table uses descending order (newest first)
  const tableData = [...chartData].reverse();

  const usedPct = apiKey.credits > 0
    ? Math.round((apiKey.creditsUsed / apiKey.credits) * 100)
    : 0;

  // Hardcoded colors for Recharts SVG compatibility
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const colors = {
    grid: isDark ? '#2a2a3a' : '#e5e7eb',
    text: isDark ? '#64748b' : '#9ca3af',
    tooltipBg: isDark ? '#16161f' : '#ffffff',
    tooltipBorder: isDark ? '#2a2a3a' : '#e5e7eb',
    tooltipText: isDark ? '#f1f5f9' : '#1e293b',
    tooltipLabel: isDark ? '#94a3b8' : '#475569',
    warning: '#f59e0b',
    success: '#10b981',
    danger: '#ef4444',
    primary: '#6366f1',
    accent: '#8b5cf6',
    legendColor: isDark ? '#94a3b8' : '#475569',
  };

  const tooltipStyle = {
    contentStyle: {
      background: colors.tooltipBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: 10,
      color: colors.tooltipText,
    },
    labelStyle: { color: colors.tooltipLabel },
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Usage & Billing</h1>
          <p className="page-subtitle">Credit consumption and request analytics — auto-refreshes every 15 seconds</p>
        </div>
      </div>

      {/* Credit progress bar */}
      <div className="glass-card-static" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={16} color="var(--sf-primary)" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>API Credit Limit</span>
          </div>
          <span style={{ fontSize: 14, color: 'var(--sf-text-secondary)' }}>
            {(apiKey.creditsUsed || 0).toLocaleString()} / {(apiKey.credits || 10000).toLocaleString()} credits used
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--sf-bg-elevated)', borderRadius: 9999, overflow: 'hidden', border: '1px solid var(--sf-border)' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(usedPct, 100)}%`,
            borderRadius: 9999,
            background: usedPct > 80 ? 'var(--sf-danger)' : usedPct > 50 ? 'var(--sf-warning)' : 'var(--sf-success)',
            transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--sf-text-muted)', marginTop: 6 }}>
          {(apiKey.remaining || (apiKey.credits || 10000) - (apiKey.creditsUsed || 0)).toLocaleString()} credits remaining ({usedPct || 0}% used)
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <TrendingUp size={18} color="var(--sf-success)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sf-success)' }}>
            {(apiKey.remaining ?? ((apiKey.credits || 10000) - (apiKey.creditsUsed || 0))).toLocaleString()}
          </div>
          <div className="stat-label">Credits Remaining</div>
        </div>
        <div className="stat-card">
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Zap size={18} color="var(--sf-warning)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sf-warning)' }}>{(totals.creditsUsed || 0).toLocaleString()}</div>
          <div className="stat-label">Credits Used (15d)</div>
        </div>
        <div className="stat-card">
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <CheckCircle size={18} color="var(--sf-primary)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sf-primary)' }}>{(totals.requestCount || 0).toLocaleString()}</div>
          <div className="stat-label">Requests (15d)</div>
        </div>
        <div className="stat-card">
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <XCircle size={18} color="var(--sf-accent)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--sf-accent)' }}>
            {totals.requestCount > 0
              ? `${Math.round((totals.successCount / totals.requestCount) * 100)}%`
              : '100%'
            }
          </div>
          <div className="stat-label">Success Rate</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: 28 }}>
        <div className="glass-card-static">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Credit Usage (15 days)</h3>
          <div style={{ height: 280 }}>
            {isLoading ? (
              <div className="skeleton" style={{ height: '100%', borderRadius: 12 }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.warning} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={colors.warning} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                  <XAxis dataKey="date" stroke={colors.text} fontSize={11} tick={{ fill: colors.text }} />
                  <YAxis stroke={colors.text} fontSize={11} allowDecimals={false} tick={{ fill: colors.text }} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="credits" stroke={colors.warning} fill="url(#usageGrad)" strokeWidth={2} name="Credits" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass-card-static">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Success vs Failed (15d)</h3>
          <div style={{ height: 280 }}>
            {isLoading ? (
              <div className="skeleton" style={{ height: '100%', borderRadius: 12 }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                  <XAxis dataKey="date" stroke={colors.text} fontSize={11} tick={{ fill: colors.text }} />
                  <YAxis stroke={colors.text} fontSize={11} allowDecimals={false} tick={{ fill: colors.text }} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: colors.legendColor, fontSize: 12 }} />
                  <Bar dataKey="success" fill={colors.success} name="Success" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" fill={colors.danger} name="Failed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Daily breakdown table */}
      {tableData.length > 0 && (
        <div className="glass-card-static">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Daily Breakdown</h3>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Requests</th><th>Success</th><th>Failed</th><th>Credits</th><th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, 15).map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{d.date}</td>
                    <td>{d.requests}</td>
                    <td style={{ color: 'var(--sf-success)' }}>{d.success}</td>
                    <td style={{ color: d.failed > 0 ? 'var(--sf-danger)' : 'var(--sf-text-muted)' }}>{d.failed}</td>
                    <td>{d.credits}</td>
                    <td>
                      <span className={`badge badge-${d.requests > 0 && d.success / d.requests >= 0.8 ? 'success' : d.requests > 0 ? 'warning' : 'secondary'}`}>
                        {d.requests > 0 ? `${Math.round(d.success / d.requests * 100)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
