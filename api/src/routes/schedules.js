// ================================================================
// Route: Schedules
// ================================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const Schedule = require('../models/Schedule');

// ── GET /schedule — List schedules ──
router.get('/', async (req, res) => {
  try {
    const schedules = await Schedule.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ScheduleListError', message: err.message });
  }
});

// ── POST /schedule — Create a schedule ──
router.post('/', async (req, res) => {
  try {
    const {
      name, description, type, config, cron, timezone,
      notify_on, notify_channels, notify_webhook_url, notify_email,
      max_retries_per_run, change_detection,
    } = req.body;

    if (!name || !type || !config || !cron) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'name, type, config, and cron are required',
      });
    }

    const schedule = await Schedule.create({
      scheduleId: `sched_${uuid()}`,
      userId: req.user._id,
      name,
      description,
      type,
      config,
      cron,
      timezone: timezone || 'UTC',
      notifyOn: notify_on || ['failure'],
      notifyChannels: notify_channels || ['webhook'],
      notifyWebhookUrl: notify_webhook_url,
      notifyEmail: notify_email,
      maxRetriesPerRun: max_retries_per_run || 3,
      changeDetection: change_detection || { enabled: false },
    });

    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ScheduleCreateError', message: err.message });
  }
});

// ── PUT /schedule/:id — Update schedule ──
router.put('/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ scheduleId: req.params.id, userId: req.user._id });
    if (!schedule) return res.status(404).json({ success: false, error: 'NotFound' });

    const fields = ['name', 'description', 'config', 'cron', 'timezone', 'isActive',
      'notifyOn', 'notifyChannels', 'changeDetection'];
    for (const f of fields) {
      if (req.body[f] !== undefined) schedule[f] = req.body[f];
    }
    await schedule.save();

    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ScheduleUpdateError', message: err.message });
  }
});

// ── DELETE /schedule/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await Schedule.deleteOne({ scheduleId: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'ScheduleDeleteError', message: err.message });
  }
});

module.exports = router;
