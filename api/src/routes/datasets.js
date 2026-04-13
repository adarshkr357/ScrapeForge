// ================================================================
// Route: Datasets
// ================================================================
const express = require('express');
const router = express.Router();
const Dataset = require('../models/Dataset');
const DatasetItem = require('../models/DatasetItem');
const { Parser: CsvParser } = require('json2csv');

// ── GET /datasets — List datasets ──
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const datasets = await Dataset.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Dataset.countDocuments({ userId: req.user._id });
    res.json({ success: true, data: datasets, total });
  } catch (err) {
    res.status(500).json({ success: false, error: 'DatasetListError', message: err.message });
  }
});

// ── GET /datasets/:id — Download dataset ──
router.get('/:id', async (req, res) => {
  try {
    const dataset = await Dataset.findOne({ datasetId: req.params.id, userId: req.user._id });
    if (!dataset) return res.status(404).json({ success: false, error: 'NotFound' });

    const format = req.query.format || 'json';
    const items = await DatasetItem.find({ datasetId: req.params.id })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const data = items.map(i => i.data);

    switch (format) {
      case 'csv': {
        try {
          const parser = new CsvParser();
          const csv = parser.parse(data);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${dataset.name}.csv"`);
          return res.send(csv);
        } catch {
          return res.json({ success: true, data });
        }
      }
      case 'ndjson': {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Content-Disposition', `attachment; filename="${dataset.name}.ndjson"`);
        return res.send(data.map(d => JSON.stringify(d)).join('\n'));
      }
      default: {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${dataset.name}.json"`);
        return res.send(JSON.stringify(data, null, 2));
      }
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'DatasetGetError', message: err.message });
  }
});

// ── DELETE /datasets — Bulk delete ──
router.delete('/', async (req, res) => {
  try {
    const { datasetIds, deleteAll } = req.body || {};

    if (deleteAll) {
      // Delete ALL datasets for this user
      const datasets = await Dataset.find({ userId: req.user._id }).lean();
      const ids = datasets.map(d => d.datasetId);
      await DatasetItem.deleteMany({ datasetId: { $in: ids } });
      const result = await Dataset.deleteMany({ userId: req.user._id });
      return res.json({ success: true, deletedCount: result.deletedCount });
    }

    if (datasetIds && Array.isArray(datasetIds) && datasetIds.length > 0) {
      await DatasetItem.deleteMany({ datasetId: { $in: datasetIds } });
      const result = await Dataset.deleteMany({ userId: req.user._id, datasetId: { $in: datasetIds } });
      return res.json({ success: true, deletedCount: result.deletedCount });
    }

    res.status(400).json({ success: false, error: 'Provide datasetIds array or set deleteAll: true' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'BulkDeleteError', message: err.message });
  }
});

// ── DELETE /datasets/:id ──
router.delete('/:id', async (req, res) => {
  try {
    await DatasetItem.deleteMany({ datasetId: req.params.id });
    await Dataset.deleteOne({ datasetId: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Dataset deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'DatasetDeleteError', message: err.message });
  }
});

module.exports = router;
