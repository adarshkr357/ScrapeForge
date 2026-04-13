// ================================================================
// Proxy Provider: Oxylabs (env-gated)
// ================================================================
// Premium proxy provider with Web Unblocker, residential, and
// datacenter pools. Only activated when OXYLABS_* env vars are set.

const BaseProvider = require('./BaseProvider');

class OxylabsProvider extends BaseProvider {
  constructor(config = {}) {
    super('Oxylabs', config);

    this.username = process.env.OXYLABS_USERNAME || '';
    this.password = process.env.OXYLABS_PASSWORD || '';

    this.isAvailable = !!(this.username && this.password);

    // Oxylabs endpoints
    this.endpoints = {
      datacenter: { host: 'dc.oxylabs.io', port: 8001 },
      residential: { host: 'pr.oxylabs.io', port: 7777 },
      mobile: { host: 'mr.oxylabs.io', port: 30000 },
      isp: { host: 'isp.oxylabs.io', port: 8001 },
      unblocker: { host: 'unblock.oxylabs.io', port: 60000 },
    };

    if (this.isAvailable) {
      console.log('[Oxylabs] Provider initialized');
    }
  }

  async getProxy(options = {}) {
    if (!this.isAvailable) {
      throw new Error('Oxylabs provider not configured');
    }

    const { country, type = 'datacenter', sticky = false, targetDomain = '' } = options;

    const endpoint = this.endpoints[type] || this.endpoints.datacenter;

    // Build username with targeting
    let username = this.username;

    // Country targeting
    if (country) {
      username = `customer-${this.username}-cc-${country.toLowerCase()}`;
    }

    // Session for sticky IPs
    if (sticky) {
      const sessionId = targetDomain
        ? Buffer.from(targetDomain).toString('base64').substring(0, 12)
        : Math.random().toString(36).substring(2, 10);
      username += `-sessid-${sessionId}`;
    }

    this.stats.totalRequests++;

    return {
      host: endpoint.host,
      port: endpoint.port,
      username,
      password: this.password,
      protocol: 'http',
      provider: 'oxylabs',
      country: country || 'any',
      type,
    };
  }

  async reportResult(proxy, success, latencyMs = 0, statusCode = 200, error = '') {
    await super.reportResult(proxy, success, latencyMs, statusCode, error);
  }

  async healthCheck() {
    this.lastHealthCheck = new Date();

    if (!this.isAvailable) {
      return {
        available: false,
        message: 'Oxylabs: Not configured (OXYLABS_USERNAME / OXYLABS_PASSWORD missing)',
      };
    }

    try {
      const http = require('http');

      return new Promise((resolve) => {
        const options = {
          host: this.endpoints.datacenter.host,
          port: this.endpoints.datacenter.port,
          path: 'https://ip.oxylabs.io/',
          headers: {
            'Proxy-Authorization': 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64'),
            Host: 'ip.oxylabs.io',
          },
          timeout: 10000,
        };

        const req = http.get(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            this.isAvailable = true;
            resolve({
              available: true,
              message: `Oxylabs: Connected (IP: ${data.trim()})`,
            });
          });
        });

        req.on('error', (err) => {
          resolve({
            available: false,
            message: `Oxylabs: Health check failed — ${err.message}`,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ available: false, message: 'Oxylabs: Timeout' });
        });
      });
    } catch (err) {
      return { available: false, message: `Oxylabs: ${err.message}` };
    }
  }
}

module.exports = OxylabsProvider;
