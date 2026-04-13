// ================================================================
// Route: Auth (Register, Login, API Keys)
// ================================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');
const { validate } = require('../middleware/validator');
const { authMiddleware } = require('../middleware/auth');

// ── POST /auth/register ──
router.post('/register', validate('POST /auth/register'), async (req, res) => {
  try {
    const { email, password, name } = req.validatedBody;

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'UserExists',
        message: 'A user with this email already exists',
      });
    }

    // Create user
    const user = await User.create({
      email,
      passwordHash: password,  // Will be hashed by pre-save hook
      name,
      role: 'user',
      plan: 'free',
      credits: parseInt(process.env.DEFAULT_CREDITS || '1000', 10),
    });

    // Generate default API key
    const { key, keyPrefix, keyHash } = ApiKey.generateKey();
    await ApiKey.create({
      key, keyPrefix, keyHash,
      userId: user._id,
      name: 'Default API Key',
      credits: user.credits,
      rateLimit: parseInt(process.env.DEFAULT_RATE_LIMIT || '60', 10),
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'change-me',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        user: user.toSafeJSON(),
        token,
        api_key: key,
        message: 'Store your API key securely — it will not be shown again.',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'RegistrationFailed', message: err.message });
  }
});

// ── POST /auth/login ──
router.post('/login', validate('POST /auth/login'), async (req, res) => {
  try {
    const { email, password } = req.validatedBody;

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Invalid email or password',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'InvalidCredentials',
        message: 'Invalid email or password',
      });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'change-me',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id, type: 'refresh' },
      process.env.JWT_SECRET || 'change-me',
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    res.json({
      success: true,
      data: {
        user: user.toSafeJSON(),
        token,
        refreshToken,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'LoginFailed', message: err.message });
  }
});

// ── POST /auth/refresh ──
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'MissingToken', message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'change-me');
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, error: 'InvalidToken', message: 'Not a refresh token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'InvalidToken', message: 'User not found' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'change-me',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ success: true, data: { token } });
  } catch (err) {
    res.status(401).json({ success: false, error: 'InvalidToken', message: 'Token expired or invalid' });
  }
});

// ── POST /auth/api-keys (create new API key) ──
router.post('/api-keys', authMiddleware, async (req, res) => {
  try {
    const { name = 'New API Key', permissions, rateLimit } = req.body;

    const { key, keyPrefix, keyHash } = ApiKey.generateKey();
    const apiKey = await ApiKey.create({
      key, keyPrefix, keyHash,
      userId: req.user._id,
      name,
      permissions: permissions || ['scrape', 'crawl', 'search', 'extract', 'datasets'],
      rateLimit: rateLimit || parseInt(process.env.DEFAULT_RATE_LIMIT || '60', 10),
      credits: 1000,
    });

    res.status(201).json({
      success: true,
      data: {
        api_key: key,
        keyPrefix,
        name: apiKey.name,
        permissions: apiKey.permissions,
        message: 'Store your API key securely — it will not be shown again.',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ApiKeyCreationFailed', message: err.message });
  }
});

// ── GET /auth/api-keys (list API keys) ──
router.get('/api-keys', authMiddleware, async (req, res) => {
  try {
    const apiKeys = await ApiKey.find({ userId: req.user._id }).select('-keyHash -key').lean();
    res.json({
      success: true,
      data: apiKeys.map(k => ({
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
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ApiKeyListError', message: err.message });
  }
});

// ── DELETE /auth/api-keys/:id (revoke API key) ──
router.delete('/api-keys/:id', authMiddleware, async (req, res) => {
  try {
    const result = await ApiKey.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'NotFound', message: 'API key not found' });
    }
    res.json({ success: true, message: 'API key revoked and deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ApiKeyDeleteError', message: err.message });
  }
});

module.exports = router;
