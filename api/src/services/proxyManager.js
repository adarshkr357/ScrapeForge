// ================================================================
// Proxy Manager — Provider Orchestrator
// ================================================================
// Selects the best proxy provider based on env configuration.
// Falls back to MockProvider when no paid providers are configured.
// Exposes a unified interface for the Smart Router.

const MockProvider = require('./proxyProviders/MockProvider');
const BrightDataProvider = require('./proxyProviders/BrightDataProvider');
const OxylabsProvider = require('./proxyProviders/OxylabsProvider');

class ProxyManager {
  constructor() {
    this.providers = {};

    // Initialize available providers (env-gated)
    this._initProviders();

    // Provider priority for automatic selection
    this.priority = ['brightdata', 'oxylabs', 'mock'];
  }

  _initProviders() {
    // Always register mock
    this.providers.mock = new MockProvider({ poolSize: 500 });
    console.log('[ProxyManager] MockProvider registered (always available)');

    // Bright Data (if configured)
    const bd = new BrightDataProvider();
    if (bd.isAvailable) {
      this.providers.brightdata = bd;
      console.log('[ProxyManager] BrightData registered ✓');
    }

    // Oxylabs (if configured)
    const ox = new OxylabsProvider();
    if (ox.isAvailable) {
      this.providers.oxylabs = ox;
      console.log('[ProxyManager] Oxylabs registered ✓');
    }

    const available = Object.keys(this.providers).filter(k => this.providers[k].isAvailable);
    console.log(`[ProxyManager] Active providers: [${available.join(', ')}]`);
  }

  /**
   * Get a proxy using the best available provider.
   * @param {object} options
   * @param {string} options.provider — Force a specific provider (optional)
   * @param {string} options.country — Target geo
   * @param {string} options.type — datacenter, residential, mobile, isp
   * @param {boolean} options.sticky — Maintain session
   * @param {string} options.targetDomain — Domain for session routing
   */
  async getProxy(options = {}) {
    const { provider: preferredProvider, ...proxyOptions } = options;

    // If a specific provider is requested
    if (preferredProvider && this.providers[preferredProvider]?.isAvailable) {
      return this.providers[preferredProvider].getProxy(proxyOptions);
    }

    // Auto-select best provider based on proxy type
    if (proxyOptions.type === 'residential' || proxyOptions.type === 'mobile') {
      // Real residential/mobile proxies need paid providers
      for (const name of ['brightdata', 'oxylabs']) {
        if (this.providers[name]?.isAvailable) {
          return this.providers[name].getProxy(proxyOptions);
        }
      }
    }

    // Fallback chain: paid providers first, then mock
    for (const name of this.priority) {
      if (this.providers[name]?.isAvailable) {
        return this.providers[name].getProxy(proxyOptions);
      }
    }

    // Ultimate fallback
    return this.providers.mock.getProxy(proxyOptions);
  }

  /**
   * Report the result of using a proxy.
   */
  async reportResult(proxy, success, latencyMs = 0, statusCode = 200, error = '') {
    const providerName = proxy?.provider || 'mock';
    const provider = this.providers[providerName];

    if (provider) {
      await provider.reportResult(proxy, success, latencyMs, statusCode, error);
    }
  }

  /**
   * Run health checks on all providers.
   */
  async healthCheckAll() {
    const results = {};

    for (const [name, provider] of Object.entries(this.providers)) {
      results[name] = await provider.healthCheck();
    }

    return results;
  }

  /**
   * Get statistics from all providers.
   */
  getAllStats() {
    const stats = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      stats[name] = provider.getStats();
    }
    return stats;
  }

  /**
   * List available providers.
   */
  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([, p]) => p.isAvailable)
      .map(([name, p]) => ({ name, ...p.getStats() }));
  }
}

// Singleton
const proxyManager = new ProxyManager();
module.exports = proxyManager;
