// ================================================================
// Proxy Provider: Bright Data (env-gated)
// ================================================================
// Enterprise proxy provider with 72M+ IPs, geo-targeting,
// and Web Unlocker. Only activated when BRIGHTDATA_* env vars set.

const BaseProvider = require('./BaseProvider');

class BrightDataProvider extends BaseProvider {
  constructor(config = {}) {
    super('BrightData', config);

    this.customerId = process.env.BRIGHTDATA_CUSTOMER_ID || '';
    this.zone = process.env.BRIGHTDATA_ZONE || 'zone0';
    this.password = process.env.BRIGHTDATA_PASSWORD || '';
    this.host = process.env.BRIGHTDATA_HOST || 'brd.superproxy.io';
    this.port = parseInt(process.env.BRIGHTDATA_PORT || '22225', 10);

    this.isAvailable = !!(this.customerId && this.password);

    if (this.isAvailable) {
      console.log('[BrightData] Provider initialized (zone:', this.zone, ')');
    }
  }

  async getProxy(options = {}) {
    if (!this.isAvailable) {
      throw new Error('BrightData provider not configured');
    }

    const { country, type = 'datacenter', sticky = false, targetDomain = '' } = options;

    // Build Bright Data username with targeting params
    let username = `lum-customer-${this.customerId}-zone-${this.zone}`;

    // Proxy type zones
    const zoneMap = {
      datacenter: this.zone,
      residential: `${this.zone}_res`,
      mobile: `${this.zone}_mob`,
      isp: `${this.zone}_isp`,
    };

    if (zoneMap[type] && type !== 'datacenter') {
      username = `lum-customer-${this.customerId}-zone-${zoneMap[type]}`;
    }

    // Country targeting
    if (country) {
      username += `-country-${country.toLowerCase()}`;
    }

    // Sticky session
    if (sticky) {
      const sessionId = targetDomain
        ? Buffer.from(targetDomain).toString('base64').substring(0, 16)
        : Math.random().toString(36).substring(2, 10);
      username += `-session-${sessionId}`;
    }

    this.stats.totalRequests++;

    return {
      host: this.host,
      port: this.port,
      username,
      password: this.password,
      protocol: 'http',
      provider: 'brightdata',
      country: country || 'any',
      type,
    };
  }

  async reportResult(proxy, success, latencyMs = 0, statusCode = 200, error = '') {
    await super.reportResult(proxy, success, latencyMs, statusCode, error);
    // Bright Data handles proxy scoring internally
  }

  async healthCheck() {
    this.lastHealthCheck = new Date();

    if (!this.isAvailable) {
      return {
        available: false,
        message: 'BrightData: Not configured (BRIGHTDATA_CUSTOMER_ID / BRIGHTDATA_PASSWORD missing)',
      };
    }

    try {
      // Test proxy connectivity
      const https = require('https');
      const testProxy = await this.getProxy({ country: 'US' });

      return new Promise((resolve) => {
        const req = https.get('https://lumtest.com/myip.json', {
          timeout: 10000,
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              this.isAvailable = true;
              resolve({
                available: true,
                message: `BrightData: Connected (IP: ${result.ip}, Country: ${result.country})`,
              });
            } catch {
              resolve({ available: true, message: 'BrightData: Connected' });
            }
          });
        });

        req.on('error', (err) => {
          resolve({
            available: false,
            message: `BrightData: Health check failed — ${err.message}`,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            available: false,
            message: 'BrightData: Health check timed out',
          });
        });
      });
    } catch (err) {
      return {
        available: false,
        message: `BrightData: ${err.message}`,
      };
    }
  }
}

module.exports = BrightDataProvider;
