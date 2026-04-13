// ================================================================
// Service: Smart Router (ML-Powered Request Routing)
// ================================================================
const Domain = require('../models/Domain');
const { getRedisConnection } = require('../queue/connection');

/**
 * Smart Router — The brain of the scraping engine.
 * Automatically decides: worker type, proxy config, stealth level,
 * fingerprint, and retry strategy based on domain intelligence.
 */
class SmartRouter {
  /**
   * Route a scrape request to the optimal worker configuration.
   * @param {Object} params - Request parameters
   * @returns {Object} Routing decision
   */
  async route(params) {
    const url = new URL(params.url);
    const domain = url.hostname;

    // 1. Domain Intelligence Lookup
    const domainInfo = await this.getDomainIntelligence(domain);

    // 2. Anti-Bot Classification
    const protection = this.classifyProtection(domainInfo);

    // 3. Rendering Decision
    const workerType = this.decideWorkerType(params, domainInfo);

    // 4. Stealth Level Selection
    const stealthLevel = this.decideStealthLevel(params, domainInfo, protection);

    // 5. Proxy Selection
    const proxyConfig = this.decideProxyConfig(params, domainInfo, stealthLevel);

    // 6. Retry Strategy
    const retryStrategy = this.decideRetryStrategy(domainInfo, protection);

    return {
      workerType,
      proxyConfig,
      stealthLevel,
      protection,
      retryStrategy,
      domainInfo: {
        domain,
        difficultyScore: domainInfo.difficultyScore,
        antiBot: domainInfo.antiBot,
        successRate: domainInfo.successRate,
      },
    };
  }

  /**
   * Get domain intelligence.
   */
  async getDomainIntelligence(domain) {
    // Lookup in MongoDB
    let domainInfo = await Domain.findOne({ domain }).lean();

    if (!domainInfo) {
      // Unknown domain — create default entry
      domainInfo = {
        domain,
        difficultyScore: 1,
        antiBot: 'unknown',
        requiresJS: false,
        avgLatencyMs: 0,
        successRate: 1,
        bestStealthLevel: 0,
        bestProxyType: 'datacenter',
      };
    }

    return domainInfo;
  }

  /**
   * Classify anti-bot protection type and difficulty.
   */
  classifyProtection(domainInfo) {
    const protectionMap = {
      'cloudflare':               { type: 'cloudflare', difficulty: 5 },
      'cloudflare_turnstile':     { type: 'cloudflare_turnstile', difficulty: 7 },
      'cloudflare_under_attack':  { type: 'cloudflare_under_attack', difficulty: 8 },
      'datadome':                 { type: 'datadome', difficulty: 7 },
      'perimeterx':               { type: 'perimeterx', difficulty: 8 },
      'akamai':                   { type: 'akamai', difficulty: 8 },
      'imperva':                  { type: 'imperva', difficulty: 6 },
      'kasada':                   { type: 'kasada', difficulty: 9 },
      'shape_security':           { type: 'shape_security', difficulty: 9 },
      'aws_waf':                  { type: 'aws_waf', difficulty: 4 },
      'none':                     { type: 'none', difficulty: 1 },
      'unknown':                  { type: 'unknown', difficulty: 3 },
    };

    return protectionMap[domainInfo.antiBot] || protectionMap.unknown;
  }

  /**
   * Decide which worker type to use.
   */
  decideWorkerType(params, domainInfo) {
    // User explicitly selected a scraper engine
    if (params.scraper_type && params.scraper_type !== 'auto') {
      const scraperMap = {
        'http': 'python-http',
        'browser': 'python-browser',
        'node-browser': 'node-browser',
      };
      return scraperMap[params.scraper_type] || 'python-http';
    }

    // User explicitly requested no JS
    if (params.render_js === false) return 'python-http';

    // JS scenario always needs a browser
    if (params.js_scenario?.length > 0) {
      return 'node-browser';
    }

    // Explicit JS rendering
    if (params.render_js === true) {
      return 'node-browser';
    }

    // Domain known to require JS
    if (domainInfo.requiresJS) {
      return 'node-browser';
    }

    // High difficulty + unknown → try browser
    if (domainInfo.difficultyScore >= 6 && domainInfo.antiBot !== 'none') {
      return 'python-browser';
    }

    // Default: fastest option
    return 'python-http';
  }

  /**
   * Decide stealth level (0-4).
   * Level 0: none — raw request
   * Level 1: basic — header rotation (UA, Accept-Language, sec-ch-ua)
   * Level 2: standard — + TLS fingerprint mimicry (JA3/JA4)
   * Level 3: advanced — + residential proxy + behavioral simulation
   * Level 4: maximum — + premium proxy + CAPTCHA solving + full browser fingerprint
   */
  decideStealthLevel(params, domainInfo, protection) {
    // User requested specific stealth
    const stealthMap = {
      'none': 0,
      'basic': 1,
      'standard': 2,
      'advanced': 3,
      'maximum': 4,
      'adaptive': null,  // auto-decide
    };

    if (params.stealth_mode && stealthMap[params.stealth_mode] !== null && stealthMap[params.stealth_mode] !== undefined) {
      return stealthMap[params.stealth_mode];
    }

    // Adaptive: use domain intelligence
    if (domainInfo.bestStealthLevel > 0) {
      return domainInfo.bestStealthLevel;
    }

    // Map difficulty to stealth level
    if (protection.difficulty >= 8) return 4;  // Maximum
    if (protection.difficulty >= 6) return 3;  // Full stealth
    if (protection.difficulty >= 4) return 2;  // Fingerprint rotation
    if (protection.difficulty >= 2) return 1;  // Header rotation
    return 0;  // No stealth
  }

  /**
   * Decide proxy configuration.
   */
  decideProxyConfig(params, domainInfo, stealthLevel) {
    const config = {
      type: params.proxy_type || this.autoSelectProxyType(stealthLevel, domainInfo),
      country: params.country_code || null,
      state: params.state || null,
      city: params.city || null,
      sticky: params.sticky_session || false,
      sessionId: params.session_id || null,
      sessionTtl: params.session_ttl || 300,
      premium: params.premium_proxy || stealthLevel >= 3,
    };

    return config;
  }

  autoSelectProxyType(stealthLevel, domainInfo) {
    if (domainInfo.bestProxyType && domainInfo.successRate < 0.9) {
      return domainInfo.bestProxyType;
    }

    if (stealthLevel >= 4) return 'premium';
    if (stealthLevel >= 3) return 'residential';
    if (stealthLevel >= 2) return 'residential';
    if (stealthLevel >= 1) return 'datacenter';
    return 'datacenter';
  }

  /**
   * Decide retry strategy.
   */
  decideRetryStrategy(domainInfo, protection) {
    const maxRetries = protection.difficulty >= 7 ? 5 : 3;
    return {
      maxRetries,
      backoff: 'exponential_jitter',
      escalateOnFailure: true,  // Auto-increment stealth level on retry
      retryOn: [403, 429, 503, 'captcha', 'empty_response', 'anti_bot'],
    };
  }

  /**
   * Record the outcome of a request for learning.
   */
  async recordOutcome(domain, success, latencyMs, stealthLevel, proxyType, challengeType = null) {
    try {
      let domainDoc = await Domain.findOne({ domain });

      if (!domainDoc) {
        domainDoc = new Domain({
          domain,
          difficultyScore: 1,
          antiBot: challengeType || 'unknown',
        });
      }

      domainDoc.recordOutcome(success, latencyMs, stealthLevel, proxyType);

      if (challengeType && challengeType !== 'none') {
        domainDoc.antiBot = challengeType;
        if (!domainDoc.commonChallenges.includes(challengeType)) {
          domainDoc.commonChallenges.push(challengeType);
        }
      }

      // Update difficulty score based on success rate
      if (domainDoc.totalRequests >= 5) {
        domainDoc.difficultyScore = Math.max(1, Math.min(10,
          Math.round((1 - domainDoc.successRate) * 10)
        ));
      }

      await domainDoc.save();

      // Dependencies on cache have been removed

    } catch (err) {
      console.error(`[SmartRouter] Failed to record outcome for ${domain}:`, err.message);
    }
  }
}

// Singleton
const smartRouter = new SmartRouter();

module.exports = { smartRouter, SmartRouter };
