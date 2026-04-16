import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import {
  LayoutDashboard, Zap, Globe, ListOrdered, Search,
  Database, Clock, Shield, Activity, Webhook,
  BarChart3, Settings, LogOut, Menu, X, BookOpen, Sun, Moon,
  FileText, Camera, FileDown
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/playground', icon: Zap, label: 'Playground' },
  { to: '/scrape-history', icon: ListOrdered, label: 'Scrape History' },
  { to: '/crawls', icon: Globe, label: 'Crawls' },
  { to: '/serp-search', icon: Search, label: 'SERP Search' },
  { to: '/datasets', icon: Database, label: 'Datasets' },
  { to: '/schedules', icon: Clock, label: 'Schedules' },
  { divider: true, label: 'Tools' },
  { to: '/extract', icon: FileText, label: 'Extract' },
  { to: '/proxy-checker', icon: Shield, label: 'Proxy Checker' },
  { divider: true, label: 'Infrastructure' },
  { to: '/workers', icon: Activity, label: 'Workers' },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
  { divider: true, label: 'Account' },
  { to: '/usage-billing', icon: BarChart3, label: 'Usage & Billing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/api-docs', icon: BookOpen, label: 'API Docs' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('sf_theme') || 'dark');

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('sf_theme', newTheme);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      {/* Mobile hamburger button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar overlay for mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--sf-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--sf-gradient-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 16, color: 'white',
              }}>SF</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>ScrapeForge</div>
                <div style={{ fontSize: 11, color: 'var(--sf-text-muted)' }}>Data Intelligence</div>
              </div>
            </div>
            <button className="btn-ghost" onClick={toggleTheme} style={{ padding: 6, borderRadius: 8, cursor: 'pointer', border: 'none', background: 'none' }}>
              {theme === 'dark' ? <Sun size={18} color="var(--sf-text-muted)" /> : <Moon size={18} color="var(--sf-text-muted)" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0', overflow: 'auto' }}>
          {navItems.map((item, i) => {
            if (item.divider) {
              return (
                <div key={i} style={{
                  padding: '16px 20px 6px',
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--sf-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>{item.label}</div>
              );
            }
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={closeSidebar}>
                <item.icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User + Status */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--sf-border)',
        }}>
          {/* Connection status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12, fontSize: 12, color: 'var(--sf-text-muted)',
          }}>
            <div className="pulse-dot" style={{
              background: connected ? 'var(--sf-success)' : 'var(--sf-danger)',
              boxShadow: connected ? '0 0 6px var(--sf-success)' : '0 0 6px var(--sf-danger)',
            }} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>

          {/* User info */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name || 'User'}</div>
              <div style={{ fontSize: 11, color: 'var(--sf-text-muted)' }}>{user?.plan || 'free'} plan</div>
            </div>
            <button className="btn-ghost" onClick={logout}
              style={{ padding: 6, borderRadius: 8, cursor: 'pointer', border: 'none', background: 'none' }}>
              <LogOut size={16} color="var(--sf-text-muted)" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
