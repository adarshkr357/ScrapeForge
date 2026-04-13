// ================================================================
// Route: Proxy Health + Checker
// ================================================================
const express = require('express');
const router = express.Router();
const Proxy = require('../models/Proxy');
const ProxyCheckResult = require('../models/ProxyCheckResult');

// ── GET /proxy/health ──
router.get('/health', async (req, res) => {
  try {
    const [
      totalProxies,
      healthyCount,
      byType,
      byCountry,
      avgSuccessRate,
    ] = await Promise.all([
      Proxy.countDocuments(),
      Proxy.countDocuments({ status: 'healthy' }),
      Proxy.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 }, healthy: { $sum: { $cond: [{ $eq: ['$status', 'healthy'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      Proxy.aggregate([
        { $match: { status: 'healthy' } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      Proxy.aggregate([
        { $match: { status: 'healthy' } },
        { $group: { _id: null, avg: { $avg: '$successRate' }, avgLatency: { $avg: '$latencyMs' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        total: totalProxies,
        healthy: healthyCount,
        unhealthy: totalProxies - healthyCount,
        byType: byType.reduce((acc, t) => { acc[t._id] = { total: t.count, healthy: t.healthy }; return acc; }, {}),
        topCountries: byCountry.map(c => ({ country: c._id, count: c.count })),
        averageSuccessRate: avgSuccessRate[0]?.avg || 0,
        averageLatencyMs: Math.round(avgSuccessRate[0]?.avgLatency || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ProxyHealthError', message: err.message });
  }
});

// ── POST /proxy/check — Enhanced proxy checker ──
router.post('/check', async (req, res) => {
  try {
    const { proxyUrl, host, port, username, password, type, targetUrl, timeout } = req.body;

    // Build proxy URL from structured fields or use proxyUrl directly
    let finalProxyUrl;
    if (host) {
      const proto = type || 'http';
      const auth = username ? `${username}:${password || ''}@` : '';
      const proxyPort = port || (proto === 'https' ? 443 : 8080);
      finalProxyUrl = `${proto}://${auth}${host}:${proxyPort}`;
    } else if (proxyUrl) {
      finalProxyUrl = proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`;
    } else {
      return res.status(400).json({ success: false, message: 'Proxy host or proxyUrl is required' });
    }

    const checkTimeout = Math.min(Math.max(parseInt(timeout) || 10000, 3000), 30000);
    const target = targetUrl || 'https://httpbin.org/ip';

    // Determine proxy type for agent selection
    const proxyUrlObj = new URL(finalProxyUrl);
    const isSocks = proxyUrlObj.protocol.startsWith('socks');

    let agent;
    try {
      if (isSocks) {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        agent = new SocksProxyAgent(finalProxyUrl);
      } else {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        agent = new HttpsProxyAgent(finalProxyUrl);
      }
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid proxy format: ' + e.message });
    }

    const axios = require('axios');
    const start = Date.now();

    try {
      const response = await axios.get(target, {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: checkTimeout,
        maxRedirects: 3,
        validateStatus: () => true,
      });
      const latencyMs = Date.now() - start;
      const testedIp = response.data?.origin || response.data?.ip || null;

      // Store result
      await ProxyCheckResult.create({
        userId: req.user._id,
        proxyHost: host || proxyUrlObj.hostname,
        proxyPort: parseInt(port) || parseInt(proxyUrlObj.port) || null,
        proxyType: (type || proxyUrlObj.protocol.replace(':', '')).replace('//', ''),
        proxyUser: username || proxyUrlObj.username || null,
        targetUrl: target,
        success: true,
        testedIp,
        latencyMs,
        statusCode: response.status,
      });

      res.json({
        success: true,
        data: {
          testedIp,
          latencyMs,
          statusCode: response.status,
          status: response.status < 400 ? 'working' : 'degraded',
          targetUrl: target,
        }
      });
    } catch (proxyErr) {
      const latencyMs = Date.now() - start;

      // Store failed result
      await ProxyCheckResult.create({
        userId: req.user._id,
        proxyHost: host || proxyUrlObj.hostname,
        proxyPort: parseInt(port) || parseInt(proxyUrlObj.port) || null,
        proxyType: (type || proxyUrlObj.protocol.replace(':', '')).replace('//', ''),
        proxyUser: username || proxyUrlObj.username || null,
        targetUrl: target,
        success: false,
        latencyMs,
        error: proxyErr.code || proxyErr.message,
      });

      res.json({ success: false, message: 'Connection failed', error: proxyErr.code || proxyErr.message, latencyMs });
    }
  } catch (err) {
    res.json({ success: false, message: 'Proxy check error', error: err.message });
  }
});

// ── GET /proxy/check-results — List stored check results ──
router.get('/check-results', async (req, res) => {
  try {
    const results = await ProxyCheckResult.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: 'CheckResultsError', message: err.message });
  }
});

// ── DELETE /proxy/check-results — Bulk delete results ──
router.delete('/check-results', async (req, res) => {
  try {
    const { resultIds, deleteAll } = req.body || {};

    if (deleteAll) {
      const result = await ProxyCheckResult.deleteMany({ userId: req.user._id });
      return res.json({ success: true, deletedCount: result.deletedCount });
    }

    if (resultIds && Array.isArray(resultIds) && resultIds.length > 0) {
      const result = await ProxyCheckResult.deleteMany({ userId: req.user._id, _id: { $in: resultIds } });
      return res.json({ success: true, deletedCount: result.deletedCount });
    }

    res.status(400).json({ success: false, error: 'Provide resultIds array or set deleteAll: true' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'DeleteCheckResultsError', message: err.message });
  }
});

module.exports = router;
