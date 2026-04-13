import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import toast from 'react-hot-toast';
import { formatDateTime } from '../utils/dateUtils';
import { Settings, Key, Copy, Plus, Trash2, X, Loader2, AlertTriangle, Shield, CheckCircle, Lock, User, Globe, Monitor, Download, Clock } from 'lucide-react';

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080/api/v1`;

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Kolkata', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland',
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('profile');

  const [showCreateKey, setShowCreateKey] = useState(false);
  const [showNewKey, setShowNewKey] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Profile state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Regional preferences
  const [timezone, setTimezone] = useState('UTC');
  const [language, setLanguage] = useState('en');

  // Theme
  const [theme, setTheme] = useState(localStorage.getItem('sf_theme') || 'dark');

  const { data } = useQuery({
    queryKey: ['account'],
    queryFn: () => api.get('/account'),
  });
  const account = data?.data || {};

  // Populate profile fields from account data
  useEffect(() => {
    if (account.user) {
      setEditName(account.user.name || '');
      setEditEmail(account.user.email || '');
      if (account.user.metadata?.timezone) setTimezone(account.user.metadata.timezone);
      if (account.user.metadata?.language) setLanguage(account.user.metadata.language);
    }
  }, [account.user]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.put('/account/profile', { name: editName, email: editEmail });
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (err) { toast.error(err.message); }
    finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return toast.error('Fill in all password fields');
    if (newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    setChangingPassword(true);
    try {
      await api.post('/account/change-password', { currentPassword, newPassword });
      toast.success('Password changed successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) { toast.error(err.message); }
    finally { setChangingPassword(false); }
  };

  const handleSaveRegional = async () => {
    try {
      await api.put('/account/preferences', { timezone, language, theme });
      toast.success('Preferences saved');
    } catch (err) { toast.error(err.message); }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('sf_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    toast.success(`Theme set to ${newTheme}`);
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('sf_token');
      const response = await fetch(`${API_BASE}/account/export`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scrapeforge_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success('Data exported');
    } catch (err) { toast.error(err.message); }
  };

  const createApiKey = async () => {
    if (!keyName.trim()) return toast.error('Enter a key name');
    setCreating(true);
    try {
      const res = await api.post('/auth/api-keys', { name: keyName.trim() });
      setShowCreateKey(false); setKeyName('');
      setShowNewKey(res.data?.api_key);
      queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const deleteApiKey = async (keyId) => {
    setDeleting(true);
    try {
      await api.delete(`/auth/api-keys/${keyId}`);
      toast.success('API key revoked');
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (err) { toast.error(err.message); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Account Settings</h1>
        <p className="page-subtitle">Account, security, preferences, and API key management</p>
      </div>

      {/* Horizontal Tab Bar — ScrapingBee style */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '2px solid var(--sf-border)',
        marginBottom: 28,
        overflowX: 'auto',
        flexWrap: 'nowrap',
      }}>
        {[
          { key: 'profile', label: 'Account information' },
          { key: 'api-keys', label: 'API key' },
          { key: 'password', label: 'Change password' },
          { key: 'general', label: 'Preferences' },
          { key: 'delete', label: 'Delete account' },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 22px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--sf-text-primary)' : 'var(--sf-text-muted)',
              borderBottom: activeTab === tab.key ? '2px solid var(--sf-primary)' : '2px solid transparent',
              marginBottom: -2,
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Settings Content Area */}
      <div style={{ maxWidth: 900 }}>

        {activeTab === 'profile' && (
          <>
            {/* Profile */}
      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={18} /> Profile Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, maxWidth: 800 }}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="your@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Plan</label>
            <div style={{ marginTop: 6 }}>
              <span className="badge badge-purple" style={{ fontSize: 13 }}>{(account.user?.plan || 'free').toUpperCase()}</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Credits</label>
            <div style={{ fontWeight: 700, marginTop: 6, fontSize: 18, color: 'var(--sf-success)' }}>
              {(account.user?.credits || 1000).toLocaleString()}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Member Since</label>
            <div style={{ marginTop: 6, color: 'var(--sf-text-secondary)', fontSize: 13 }}>
              {account.user?.createdAt ? new Date(account.user.createdAt).toLocaleDateString() : 'N/A'}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Last Login</label>
            <div style={{ marginTop: 6, color: 'var(--sf-text-secondary)', fontSize: 13 }}>
              {account.user?.lastLoginAt ? new Date(account.user.lastLoginAt).toLocaleString() : 'N/A'}
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSaveProfile} disabled={savingProfile} style={{ marginTop: 12 }}>
          {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <User size={16} />} Save Profile
        </button>
      </div>
      </>
      )}

      {activeTab === 'password' && (
        <>
      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={18} /> Change Password
        </h3>
        <p style={{ fontSize: 13, color: 'var(--sf-text-muted)', marginBottom: 16 }}>
          Update your account password. You will need to enter your current password for verification.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, maxWidth: 800 }}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input className="input" type="password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="input" type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input className="input" type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password"
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleChangePassword} disabled={changingPassword} style={{ marginTop: 12 }}>
          {changingPassword ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} Update Password
        </button>
      </div>
      </>
      )}

      {activeTab === 'general' && (
        <>
      {/* Appearance */}
      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Monitor size={18} /> Appearance
        </h3>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {['dark', 'light'].map(t => (
            <button key={t} className={`btn ${theme === t ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleThemeChange(t)} style={{ minWidth: 100 }}>
              {t === 'dark' ? '🌙' : '☀️'} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Timezone & Language */}
      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} /> Regional Settings
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, maxWidth: 600 }}>
          <div className="form-group">
            <label className="form-label">Timezone</label>
            <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Language</label>
            <select className="input" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="ja">日本語</option>
              <option value="zh">中文</option>
              <option value="hi">हिंदी</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleSaveRegional}>
          <Globe size={16} /> Save Preferences
        </button>
      </div>

      {/* Data Export */}
      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={18} /> Data Export
        </h3>
        <p style={{ color: 'var(--sf-text-muted)', marginBottom: 16, fontSize: 14 }}>
          Download all your ScrapeForge data including profile, API keys, request history, and usage logs.
        </p>
        <button className="btn btn-secondary" onClick={handleExport}>
          <Download size={16} /> Export All Data (JSON)
        </button>
      </div>
      </>
      )}

      {activeTab === 'api-keys' && (
        <>
      {/* API Keys */}
      <div className="glass-card-static" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={18} /> API Keys
          </h3>
          <button className="btn btn-primary" onClick={() => setShowCreateKey(true)}>
            <Plus size={16} /> Create Key
          </button>
        </div>

        {account.apiKeys?.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Prefix</th><th>Name</th><th>Credits</th><th>Used</th>
                  <th>Rate Limit</th><th>Status</th><th>Last Used</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {account.apiKeys.map((k, i) => (
                  <tr key={k._id || i}>
                    <td><code style={{ color: 'var(--sf-primary-light)', fontSize: 13 }}>{k.keyPrefix}...</code></td>
                    <td style={{ fontWeight: 500 }}>{k.name}</td>
                    <td>{(k.credits || 0).toLocaleString()}</td>
                    <td>{(k.creditsUsed || 0).toLocaleString()}</td>
                    <td>{k.rateLimit}/min</td>
                    <td>
                      {k.isActive !== false
                        ? <span className="badge badge-success">Active</span>
                        : <span className="badge badge-danger">Revoked</span>}
                    </td>
                    <td style={{ color: 'var(--sf-text-muted)', fontSize: 13 }}>
                      {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : 'Never'}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-icon" title="Delete API Key"
                        onClick={() => setShowDeleteConfirm(k)}>
                        <Trash2 size={14} color="var(--sf-danger)" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 40 }}>
            <Key size={36} className="empty-state-icon" style={{ color: 'var(--sf-primary)' }} />
            <p>No API keys found. Create one to start using the API.</p>
          </div>
        )}
      </div>
      </>
      )}



      {activeTab === 'delete' && (
        <>
      <div className="glass-card-static" style={{ border: '1px solid rgba(239, 68, 68, 0.25)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sf-danger)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} /> Delete Account
        </h3>
        <p style={{ color: 'var(--sf-text-secondary)', marginBottom: 16, fontSize: 14, lineHeight: 1.6 }}>
          Once you delete your account, all of your data will be permanently removed. This includes your API keys,
          scrape history, datasets, and all analytics data. This action is irreversible.
        </p>
        <div className="callout-danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><strong>Warning:</strong> All active API keys will be immediately revoked and any integrations using them will stop working.</div>
        </div>
        <button className="btn btn-danger" onClick={() => {
          toast.error('Account deletion requested. Please contact support@scrapeforge.io to complete the process.');
        }}>
          <Trash2 size={16} /> Permanently Delete Account
        </button>
      </div>
      </>
      )}

        </div>

      {/* Create API Key Modal */}
      {showCreateKey && (
        <div className="modal-backdrop" onClick={() => setShowCreateKey(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Create API Key</h3>
              <button className="modal-close" onClick={() => setShowCreateKey(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Key Name *</label>
                <input className="input" placeholder="e.g. Production, Development, Testing..." value={keyName}
                  onChange={e => setKeyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createApiKey()} />
                <div className="form-hint" style={{ marginTop: 4 }}>A descriptive name to identify this API key</div>
              </div>
              <div className="form-group">
                <label className="form-label">Permissions (Coming Soon)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, opacity: 0.6 }}>
                  <label className="checkbox-label" style={{ margin: 0 }}><input type="checkbox" defaultChecked disabled /><span>Scrape API</span></label>
                  <label className="checkbox-label" style={{ margin: 0 }}><input type="checkbox" defaultChecked disabled /><span>Crawl API</span></label>
                  <label className="checkbox-label" style={{ margin: 0 }}><input type="checkbox" defaultChecked disabled /><span>Batch API</span></label>
                  <label className="checkbox-label" style={{ margin: 0 }}><input type="checkbox" defaultChecked disabled /><span>Datasets API</span></label>
                </div>
              </div>
              <div className="callout-warning" style={{ marginTop: 16 }}>
                <Shield size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>The API key will only be shown once after creation. Make sure to copy and store it securely.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateKey(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createApiKey} disabled={creating}>
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />} Generate Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New API Key Display Modal */}
      {showNewKey && (
        <div className="modal-backdrop" onClick={() => setShowNewKey(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>API Key Created!</h3>
              <button className="modal-close" onClick={() => setShowNewKey(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckCircle size={28} color="var(--sf-success)" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Your API Key</label>
                <div className="api-key-display">
                  {showNewKey}
                  <button className="copy-btn" onClick={() => {
                    navigator.clipboard.writeText(showNewKey);
                    toast.success('API key copied!');
                  }}>
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>
              <div className="callout-danger">
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <div><strong>Store this key securely!</strong> It will not be displayed again.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowNewKey(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Revoke API Key</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="confirm-icon" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                <Trash2 size={28} color="var(--sf-danger)" />
              </div>
              <p>
                Are you sure you want to revoke <strong>"{showDeleteConfirm.name}"</strong>
                {' '}(<code style={{ color: 'var(--sf-primary-light)' }}>{showDeleteConfirm.keyPrefix}...</code>)?
              </p>
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--sf-text-muted)' }}>
                This action cannot be undone. Any applications using this key will lose access immediately.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteApiKey(showDeleteConfirm._id)} disabled={deleting}>
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Revoke Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
