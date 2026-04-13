// ================================================================
// API Client — Centralized HTTP client for the dashboard
// ================================================================

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080/api/v1`;

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('sf_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('sf_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('sf_token');
    localStorage.removeItem('sf_refresh_token');
  }

  async request(method, path, body = null, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...options.headers,
    };

    const config = {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const response = await fetch(`${API_BASE}${path}`, config);

    // Handle token expiry
    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.token}`;
        const retryResponse = await fetch(`${API_BASE}${path}`, { ...config, headers });
        return retryResponse.json();
      }
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Session expired');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }

    return data;
  }

  async tryRefreshToken() {
    const refreshToken = localStorage.getItem('sf_refresh_token');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.setToken(data.data.token);
        return true;
      }
    } catch {}

    return false;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path, body) { return this.request('DELETE', path, body); }
}

export const api = new ApiClient();
export default api;
