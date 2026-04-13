// ================================================================
// Proxy Provider: Mock Provider (Development / No-API-Key Mode)
// ================================================================
// Generates realistic fake proxies with simulated latency and
// geo-distribution. Used when no paid proxy API keys are configured.

const BaseProvider = require('./BaseProvider');

const COUNTRIES = [
  { code: 'US', weight: 30 }, { code: 'GB', weight: 10 }, { code: 'DE', weight: 10 },
  { code: 'FR', weight: 5 },  { code: 'JP', weight: 5 },  { code: 'CA', weight: 5 },
  { code: 'AU', weight: 5 },  { code: 'BR', weight: 5 },  { code: 'IN', weight: 5 },
  { code: 'SG', weight: 3 },  { code: 'KR', weight: 3 },  { code: 'NL', weight: 3 },
  { code: 'IT', weight: 3 },  { code: 'ES', weight: 3 },  { code: 'SE', weight: 2 },
  { code: 'CH', weight: 1 },  { code: 'PL', weight: 1 },  { code: 'MX', weight: 1 },
];

const PROXY_TYPES = {
  datacenter:  { latencyRange: [50, 300],    successRate: 0.92 },
  residential: { latencyRange: [200, 1500],  successRate: 0.96 },
  mobile:      { latencyRange: [300, 2000],  successRate: 0.98 },
  isp:         { latencyRange: [80, 500],    successRate: 0.94 },
};

const ISPS = [
  'Amazon Web Services', 'DigitalOcean', 'OVH SAS', 'Hetzner Online',
  'Google Cloud', 'Microsoft Azure', 'Linode', 'Vultr',
  'Comcast Cable', 'AT&T U-verse', 'Verizon Fios', 'BT Group',
  'Deutsche Telekom', 'Vodafone', 'T-Mobile', 'Sprint',
];

class MockProvider extends BaseProvider {
  constructor(config = {}) {
    super('MockProvider', config);
    this.isAvailable = true;
    this.proxyPool = [];
    this.stickySessionMap = new Map();  // domain → proxy
    this._generatePool(config.poolSize || 500);
  }

  async getProxy(options = {}) {
    const {
      country = null,
      type = 'datacenter',
      protocol = 'http',
      sticky = false,
      targetDomain = '',
    } = options;

    // Sticky session: return same proxy for same domain
    if (sticky && targetDomain && this.stickySessionMap.has(targetDomain)) {
      return this.stickySessionMap.get(targetDomain);
    }

    // Filter pool
    let candidates = this.proxyPool.filter(p => p.status === 'healthy');

    if (country) {
      const geoFiltered = candidates.filter(p => p.country === country);
      if (geoFiltered.length > 0) candidates = geoFiltered;
    }

    if (type) {
      const typeFiltered = candidates.filter(p => p.type === type);
      if (typeFiltered.length > 0) candidates = typeFiltered;
    }

    if (candidates.length === 0) {
      candidates = this.proxyPool.filter(p => p.status === 'healthy');
    }

    // Weighted random selection (prefer higher success rates)
    const proxy = this._weightedRandom(candidates);

    if (sticky && targetDomain) {
      this.stickySessionMap.set(targetDomain, proxy);
    }

    this.stats.totalRequests++;
    return {
      host: proxy.ip,
      port: proxy.port,
      protocol,
      provider: 'mock',
      country: proxy.country,
      type: proxy.type,
      isp: proxy.isp,
      _mockId: proxy.id,
    };
  }

  async reportResult(proxy, success, latencyMs = 0, statusCode = 200, error = '') {
    await super.reportResult(proxy, success, latencyMs, statusCode, error);

    // Update mock proxy stats
    const mockProxy = this.proxyPool.find(p => p.id === proxy._mockId);
    if (mockProxy) {
      mockProxy.totalRequests++;
      if (success) {
        mockProxy.totalSuccesses++;
      } else {
        mockProxy.consecutiveFailures++;
        if (mockProxy.consecutiveFailures >= 3) {
          mockProxy.status = 'dead';
        }
      }
      mockProxy.successRate = mockProxy.totalSuccesses / mockProxy.totalRequests;
      mockProxy.latencyMs = latencyMs;
    }
  }

  async healthCheck() {
    this.lastHealthCheck = new Date();
    const healthy = this.proxyPool.filter(p => p.status === 'healthy').length;

    return {
      available: true,
      message: `MockProvider: ${healthy}/${this.proxyPool.length} proxies healthy`,
      balance: Infinity,
      healthy,
      total: this.proxyPool.length,
    };
  }

  /**
   * Generate a pool of realistic mock proxies.
   */
  _generatePool(size) {
    for (let i = 0; i < size; i++) {
      const country = this._randomCountry();
      const typeKey = this._randomType();
      const typeConfig = PROXY_TYPES[typeKey];

      this.proxyPool.push({
        id: `mock_${i}`,
        ip: this._randomIP(),
        port: this._randomPort(),
        type: typeKey,
        country: country.code,
        isp: ISPS[Math.floor(Math.random() * ISPS.length)],
        status: 'healthy',
        latencyMs: this._randomInRange(typeConfig.latencyRange),
        successRate: typeConfig.successRate + (Math.random() * 0.05 - 0.025),
        totalRequests: 0,
        totalSuccesses: 0,
        consecutiveFailures: 0,
      });
    }

    console.log(`[MockProvider] Generated ${size} mock proxies across ${new Set(this.proxyPool.map(p => p.country)).size} countries`);
  }

  _randomIP() {
    // Generate realistic non-private IPs
    const ranges = [
      () => `${this._rand(1, 126)}.${this._rand(0, 255)}.${this._rand(0, 255)}.${this._rand(1, 254)}`,
      () => `${this._rand(128, 191)}.${this._rand(0, 255)}.${this._rand(0, 255)}.${this._rand(1, 254)}`,
      () => `${this._rand(192, 223)}.${this._rand(0, 255)}.${this._rand(0, 255)}.${this._rand(1, 254)}`,
    ];
    return ranges[Math.floor(Math.random() * ranges.length)]();
  }

  _randomPort() {
    const ports = [3128, 8080, 8888, 8443, 1080, 9050, 9150, 3129, 80, 443];
    return ports[Math.floor(Math.random() * ports.length)];
  }

  _randomCountry() {
    const totalWeight = COUNTRIES.reduce((sum, c) => sum + c.weight, 0);
    let r = Math.random() * totalWeight;
    for (const country of COUNTRIES) {
      r -= country.weight;
      if (r <= 0) return country;
    }
    return COUNTRIES[0];
  }

  _randomType() {
    const types = Object.keys(PROXY_TYPES);
    const weights = [50, 30, 10, 10];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) return types[i];
    }
    return 'datacenter';
  }

  _randomInRange([min, max]) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _weightedRandom(candidates) {
    if (candidates.length === 0) return this.proxyPool[0];

    const totalWeight = candidates.reduce((sum, p) => sum + (p.successRate || 0.5), 0);
    let r = Math.random() * totalWeight;

    for (const proxy of candidates) {
      r -= (proxy.successRate || 0.5);
      if (r <= 0) return proxy;
    }

    return candidates[candidates.length - 1];
  }
}

module.exports = MockProvider;
