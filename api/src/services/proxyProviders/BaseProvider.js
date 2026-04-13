// ================================================================
// Proxy Provider: Base Interface
// ================================================================
// All proxy providers must extend this class and implement:
//   getProxy(options)  — Return a proxy for a request
//   reportResult()     — Feedback loop for proxy scoring
//   healthCheck()      — Verify provider connectivity

class BaseProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.isAvailable = false;
    this.lastHealthCheck = null;
    this.stats = {
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      avgLatencyMs: 0,
    };
  }

  /**
   * Get a proxy for the given request options.
   * @param {object} options
   * @param {string} options.country — Target geo (ISO 3166-1 alpha-2)
   * @param {string} options.type — Proxy type: datacenter, residential, mobile, isp
   * @param {string} options.protocol — http, https, socks5
   * @param {boolean} options.sticky — Maintain same IP across requests
   * @param {string} options.targetDomain — Domain being scraped (for session routing)
   * @returns {Promise<{host: string, port: number, username?: string, password?: string, protocol: string, provider: string, country?: string, type?: string}>}
   */
  async getProxy(options = {}) {
    throw new Error(`${this.name}: getProxy() not implemented`);
  }

  /**
   * Report the result of using a proxy (for scoring feedback).
   * @param {object} proxy — The proxy object that was used
   * @param {boolean} success — Whether the request succeeded
   * @param {number} latencyMs — Response latency
   * @param {number} statusCode — HTTP response code
   * @param {string} error — Error message if failed
   */
  async reportResult(proxy, success, latencyMs = 0, statusCode = 200, error = '') {
    this.stats.totalRequests++;
    if (success) {
      this.stats.totalSuccesses++;
    } else {
      this.stats.totalFailures++;
    }

    // Running average
    this.stats.avgLatencyMs = (
      (this.stats.avgLatencyMs * (this.stats.totalRequests - 1) + latencyMs)
      / this.stats.totalRequests
    );
  }

  /**
   * Verify provider connectivity and account status.
   * @returns {Promise<{available: boolean, message: string, balance?: number}>}
   */
  async healthCheck() {
    this.lastHealthCheck = new Date();
    return { available: false, message: `${this.name}: healthCheck() not implemented` };
  }

  /**
   * Get provider statistics.
   */
  getStats() {
    return {
      name: this.name,
      isAvailable: this.isAvailable,
      lastHealthCheck: this.lastHealthCheck,
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? this.stats.totalSuccesses / this.stats.totalRequests
        : 1,
    };
  }
}

module.exports = BaseProvider;
