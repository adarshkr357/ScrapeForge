// ================================================================
// Route: Account + Usage + Dashboard Stats
// ================================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');
const Request = require('../models/Request');
const { getRedisConnection } = require('../queue/connection');

// ── GET /account ──
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, error: 'NotFound' });

    const apiKeys = await ApiKey.find({ userId: req.user._id }).select('-keyHash -key').lean();

    const { passwordHash, ...safeUser } = user;

    res.json({
      success: true,
      data: {
        user: safeUser,
        apiKeys: apiKeys.map(k => ({
          _id: k._id,
          keyPrefix: k.keyPrefix,
          name: k.name,
          permissions: k.permissions,
          rateLimit: k.rateLimit,
          credits: k.credits,
          creditsUsed: k.creditsUsed,
          isActive: k.isActive,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'AccountError', message: err.message });
  }
});

// ── POST /account/change-password ──
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: 'NotFound' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    user.passwordHash = newPassword; // pre-save hook will hash it
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'PasswordChangeError', message: err.message });
  }
});

// ── GET /usage ──
router.get('/usage', async (req, res) => {
  try {
    const { days = 15 } = req.query;
    const numDays = Math.min(parseInt(days) || 15, 90);
    
    const since = new Date();
    since.setDate(since.getDate() - numDays);

    // Single source of truth: Request collection only
    const reqAgg = await Request.aggregate([
      { $match: { userId: req.user._id, createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        requestCount: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        creditsUsed: { $sum: { $ifNull: ['$creditsUsed', 0] } },
      } }
    ]);

    // Build a map of all dates (zeros for days with no data)
    const dailyMap = {};
    for (let i = 0; i < numDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap[dateStr] = {
        date: dateStr,
        creditsUsed: 0,
        requestCount: 0,
        successCount: 0,
        failCount: 0
      };
    }

    // Merge real Request data into daily map
    reqAgg.forEach(day => {
      if (dailyMap[day._id]) {
        dailyMap[day._id].requestCount = day.requestCount;
        dailyMap[day._id].successCount = day.successCount;
        dailyMap[day._id].failCount = day.failCount;
        dailyMap[day._id].creditsUsed = day.creditsUsed;
      }
    });

    const dailyUsage = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // Aggregate totals from the daily map
    const totals = dailyUsage.reduce((acc, u) => {
      acc.creditsUsed += u.creditsUsed;
      acc.requestCount += u.requestCount;
      acc.successCount += u.successCount;
      acc.failCount += u.failCount;
      return acc;
    }, { creditsUsed: 0, requestCount: 0, successCount: 0, failCount: 0 });

    // User.credits = authoritative credit balance
    const user = await User.findById(req.user._id).select('credits').lean();
    const userCredits = user?.credits || 0;

    res.json({
      success: true,
      data: {
        period: `${numDays} days`,
        totals,
        successRate: totals.requestCount > 0
          ? Math.round((totals.successCount / totals.requestCount) * 100) / 100
          : 1,
        dailyUsage,
        currentApiKey: {
          credits: userCredits,
          creditsUsed: totals.creditsUsed,
          remaining: Math.max(0, userCredits - totals.creditsUsed),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'UsageError', message: err.message });
  }
});

// ── GET /requests ──
router.get('/requests', async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const filter = { userId: req.user._id, userHidden: { $ne: true } };
    const requests = await Request.find(filter)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const total = await Request.countDocuments(filter);

    res.json({
      success: true,
      data: {
        total,
        requests: requests.map(r => ({
          requestId: r.requestId,
          url: r.url,
          status: r.status,
          method: r.method,
          workerType: r.workerType,
          stealthLevel: r.stealthLevel,
          creditsUsed: r.creditsUsed,
          latencyMs: r.latencyMs,
          errorMessage: r.errorMessage,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'RequestsError', message: err.message });
  }
});

// ── DELETE /requests ──
router.delete('/requests', async (req, res) => {
  try {
    const { requestIds } = req.body;
    let result;
    
    // Soft delete by setting userHidden flag
    if (requestIds && Array.isArray(requestIds) && requestIds.length > 0) {
      result = await Request.updateMany(
        { userId: req.user._id, requestId: { $in: requestIds } },
        { $set: { userHidden: true } }
      );
    } else {
      result = await Request.updateMany(
        { userId: req.user._id },
        { $set: { userHidden: true } }
      );
    }

    res.json({ success: true, deletedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: 'DeleteError', message: err.message });
  }
});

// ── GET /dashboard-stats ──
router.get('/dashboard-stats', async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `dashboard-stats:${userId}`;

    // Check Redis cache (10-second TTL)
    try {
      const redis = getRedisConnection();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (_) { /* Redis unavailable, compute fresh */ }

    // Single source of truth: Request collection only (no UsageLog fallback)
    const [reqStats] = await Request.aggregate([
      { $match: { userId } },
      { $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        totalCreditsUsed: { $sum: { $ifNull: ['$creditsUsed', 0] } },
      }}
    ]);

    const totalRequests = reqStats?.totalRequests || 0;
    const successCount = reqStats?.successCount || 0;
    const failCount = reqStats?.failCount || 0;
    const totalCreditsUsed = reqStats?.totalCreditsUsed || 0;

    // Recent requests (exclude hidden)
    const recentRequests = await Request.find({ userId, userHidden: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Top domains
    const topDomains = await Request.aggregate([
      { $match: { userId } },
      { $addFields: {
          domain: { $arrayElemAt: [{ $split: [{ $arrayElemAt: [{ $split: ['$url', '://'] }, 1] }, '/'] }, 0] }
        }
      },
      { $group: { _id: '$domain', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // User.credits = authoritative balance
    const user = await User.findById(userId).select('credits').lean();
    const creditsRemaining = user?.credits || 0;

    const response = {
      success: true,
      data: {
        totalRequests,
        successCount,
        failCount,
        successRate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 100,
        totalCredits: creditsRemaining + totalCreditsUsed,
        totalUsedCredits: totalCreditsUsed,
        creditsRemaining: Math.max(0, creditsRemaining - totalCreditsUsed),
        recentRequests: recentRequests.map(r => ({
          requestId: r.requestId,
          url: r.url,
          status: r.status,
          workerType: r.workerType,
          latencyMs: r.latencyMs,
          createdAt: r.createdAt,
        })),
        topDomains: topDomains.map(d => ({ domain: d._id, count: d.count })),
      }
    };

    // Cache for 10 seconds
    try {
      const redis = getRedisConnection();
      await redis.set(cacheKey, JSON.stringify(response), 'EX', 10);
    } catch (_) { /* Redis unavailable, skip cache */ }

    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: 'StatsError', message: err.message });
  }
});

// ── GET /workers-stats ──
router.get('/workers-stats', async (req, res) => {
  try {
    const workerStats = await Request.aggregate([
      { $match: { userId: req.user._id } },
      { $group: {
          _id: '$workerType',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          avgLatency: { $avg: '$latencyMs' },
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({
      success: true,
      data: workerStats.map(w => ({
        workerType: w._id,
        total: w.total,
        completed: w.completed,
        failed: w.failed,
        errorRate: w.total > 0 ? Math.round((w.failed / w.total) * 100) : 0,
        avgLatency: Math.round(w.avgLatency || 0),
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'WorkerStatsError', message: err.message });
  }
});

// ── PUT /account/profile — Update name/email ──
router.put('/profile', async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (email && email.trim()) {
      // Check if email is already taken
      const existing = await User.findOne({ email: email.trim().toLowerCase(), _id: { $ne: req.user._id } });
      if (existing) return res.status(409).json({ success: false, error: 'Email already in use' });
      updates.email = email.trim().toLowerCase();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    await User.findByIdAndUpdate(req.user._id, { $set: updates });
    res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ProfileUpdateError', message: err.message });
  }
});

// ── PUT /account/preferences — Save appearance & regional preferences ──
router.put('/preferences', async (req, res) => {
  try {
    const { timezone, language, theme } = req.body;
    const metadata = {};
    if (timezone) metadata['metadata.timezone'] = timezone;
    if (language) metadata['metadata.language'] = language;
    if (theme) metadata['metadata.theme'] = theme;

    await User.findByIdAndUpdate(req.user._id, { $set: metadata });
    res.json({ success: true, message: 'Preferences saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'PreferencesError', message: err.message });
  }
});

// ── GET /account/export — Export all user data ──
router.get('/export', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    const { passwordHash, ...safeUser } = user;
    const apiKeys = await ApiKey.find({ userId: req.user._id }).select('-keyHash -key').lean();
    const requests = await Request.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(1000).lean();
    const usageLogs = await UsageLog.find({ userId: req.user._id }).sort({ date: -1 }).lean();

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: safeUser,
      apiKeys,
      requests: requests.map(r => ({
        requestId: r.requestId, url: r.url, status: r.status, workerType: r.workerType,
        creditsUsed: r.creditsUsed, latencyMs: r.latencyMs, createdAt: r.createdAt,
      })),
      usageLogs,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="scrapeforge_export_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ success: false, error: 'ExportError', message: err.message });
  }
});

module.exports = router;
