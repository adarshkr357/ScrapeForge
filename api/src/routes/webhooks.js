// ================================================================
// Route: Webhooks
// ================================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const Webhook = require('../models/Webhook');

// ── GET /webhooks ──
router.get('/', async (req, res) => {
  try {
    const webhooks = await Webhook.find({ userId: req.user._id }).lean();
    res.json({ success: true, data: webhooks });
  } catch (err) {
    res.status(500).json({ success: false, error: 'WebhookListError', message: err.message });
  }
});

// ── POST /webhooks ──
router.post('/', async (req, res) => {
  try {
    const { url, events, headers } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    const secret = crypto.randomBytes(32).toString('hex');
    const webhook = await Webhook.create({
      webhookId: `wh_${uuid()}`,
      userId: req.user._id,
      url,
      events: events || ['scrape.completed'],
      secret,
      headers: headers || {},
    });

    res.status(201).json({
      success: true,
      data: { ...webhook.toObject(), secret },
      message: 'Store the secret securely for signature verification',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'WebhookCreateError', message: err.message });
  }
});

// ── DELETE /webhooks/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await Webhook.deleteOne({ webhookId: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'WebhookDeleteError', message: err.message });
  }
});

module.exports = router;
