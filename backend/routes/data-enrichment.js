/**
 * Data Enrichment API Routes
 * 
 * Provides CRUD and control endpoints for the data enrichment pipeline.
 * All routes are authenticated via JWT (verifyToken middleware).
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { catchAsync } = require('../middleware/error');
const DataRecord = require('../models/DataRecord');
const DataPipelineService = require('../services/data-pipeline.service');
const DataSources = require('../services/data-sources');
const User = require('../models/User');

/**
 * GET /api/data-enrichment/sources
 * List all available data sources with metadata
 */
router.get('/sources', verifyToken, catchAsync(async (req, res) => {
  const sources = DataSources.listSources();
  res.json(sources);
}));

/**
 * GET /api/data-enrichment/stats
 * Pipeline analytics for the authenticated user
 */
router.get('/stats', verifyToken, catchAsync(async (req, res) => {
  const stats = await DataPipelineService.getStats(req.user._id);
  res.json(stats);
}));

/**
 * GET /api/data-enrichment/records
 * List processed data records with search, filter, and pagination
 * 
 * Query params:
 * - page (default 1)
 * - limit (default 25, max 100)
 * - status (filter by status)
 * - source (filter by sourceType)
 * - search (text search on company name, project type, summary)
 * - city (filter by city)
 * - minBudget / maxBudget (budget range filter)
 * - sort (field to sort by, default '-createdAt')
 */
router.get('/records', verifyToken, catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  const skip = (page - 1) * limit;

  const query = { userId: req.user._id };

  // Status filter
  if (req.query.status) {
    query.status = req.query.status;
  } else {
    // By default, exclude 'raw' and 'processing' — show only finished states
    query.status = { $in: ['processed', 'published', 'sent-to-outreach', 'failed'] };
  }

  // Source type filter
  if (req.query.source) {
    query.sourceType = req.query.source;
  }

  // Text search
  if (req.query.search) {
    query.$text = { $search: req.query.search };
  }

  // City filter
  if (req.query.city) {
    query['structured.location.city'] = new RegExp(req.query.city, 'i');
  }

  // Budget range
  if (req.query.minBudget) {
    query['structured.estimatedBudget'] = { ...query['structured.estimatedBudget'], $gte: parseFloat(req.query.minBudget) };
  }
  if (req.query.maxBudget) {
    query['structured.estimatedBudget'] = { ...query['structured.estimatedBudget'], $lte: parseFloat(req.query.maxBudget) };
  }

  // Sort
  const sortField = req.query.sort || '-createdAt';

  const [records, total] = await Promise.all([
    DataRecord.find(query)
      .select('-raw') // Don't send raw payload to frontend (save bandwidth)
      .sort(sortField)
      .skip(skip)
      .limit(limit)
      .lean(),
    DataRecord.countDocuments(query)
  ]);

  res.json({
    records,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

/**
 * GET /api/data-enrichment/records/:id
 * Get a single record with full details (including raw payload)
 */
router.get('/records/:id', verifyToken, catchAsync(async (req, res) => {
  const record = await DataRecord.findOne({ _id: req.params.id, userId: req.user._id });
  if (!record) return res.status(404).json({ message: 'Record not found' });
  res.json(record);
}));

/**
 * POST /api/data-enrichment/trigger
 * Manually trigger the pipeline for the authenticated user
 */
router.post('/trigger', verifyToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (!user.config?.dataEnrichment?.enabled) {
    return res.status(400).json({ message: 'Data enrichment is not enabled. Enable it in Settings first.' });
  }

  const result = await DataPipelineService.runForUser(user);
  res.json({ message: 'Pipeline executed successfully', result });
}));

/**
 * POST /api/data-enrichment/records/:id/send-to-outreach
 * Push a single processed record into the outreach pipeline
 */
router.post('/records/:id/send-to-outreach', verifyToken, catchAsync(async (req, res) => {
  const record = await DataRecord.findOne({ _id: req.params.id, userId: req.user._id });
  if (!record) return res.status(404).json({ message: 'Record not found' });

  if (record.status !== 'processed') {
    return res.status(400).json({ message: `Record is "${record.status}" — only processed records can be sent to outreach.` });
  }

  if (!record.structured?.contactInfo?.email) {
    return res.status(400).json({ message: 'Record has no contact email. Cannot create outreach lead.' });
  }

  const user = await User.findById(req.user._id);
  const pushed = await DataPipelineService._pushToOutreach(user, record, record.structured);

  if (pushed) {
    res.json({ message: `${record.structured.companyName} pushed to outreach pipeline.` });
  } else {
    res.json({ message: 'Lead already exists in outreach pipeline.' });
  }
}));

/**
 * PATCH /api/data-enrichment/config
 * Update data enrichment configuration
 */
router.patch('/config', verifyToken, catchAsync(async (req, res) => {
  const { enabled, activeSources, aiInstructions, targetRegions, autoOutreach, publishSEO, dailyProcessLimit } = req.body;

  const update = {};

  if (typeof enabled === 'boolean') update['config.dataEnrichment.enabled'] = enabled;
  if (Array.isArray(activeSources)) update['config.dataEnrichment.activeSources'] = activeSources;
  if (typeof aiInstructions === 'string') update['config.dataEnrichment.aiInstructions'] = aiInstructions;
  if (Array.isArray(targetRegions)) update['config.dataEnrichment.targetRegions'] = targetRegions;
  if (typeof autoOutreach === 'boolean') update['config.dataEnrichment.autoOutreach'] = autoOutreach;
  if (typeof publishSEO === 'boolean') update['config.dataEnrichment.publishSEO'] = publishSEO;
  if (typeof dailyProcessLimit === 'number') update['config.dataEnrichment.dailyProcessLimit'] = Math.min(200, Math.max(1, dailyProcessLimit));

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update.' });
  }

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
  
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ 
    message: 'Data enrichment configuration updated.', 
    config: user.config.dataEnrichment 
  });
}));

/**
 * DELETE /api/data-enrichment/records
 * Bulk delete records (failed, or all by status)
 */
router.delete('/records', verifyToken, catchAsync(async (req, res) => {
  const { status } = req.query;
  
  const query = { userId: req.user._id };
  if (status) query.status = status;
  else query.status = 'failed'; // Default: only delete failed

  const result = await DataRecord.deleteMany(query);
  res.json({ message: `Deleted ${result.deletedCount} records.` });
}));

/**
 * GET /api/data-enrichment/records/export
 * Export records as CSV
 */
router.get('/records/export', verifyToken, catchAsync(async (req, res) => {
  const records = await DataRecord.find({ 
    userId: req.user._id, 
    status: { $in: ['processed', 'published', 'sent-to-outreach'] } 
  }).select('structured sourceType createdAt').lean();

  const csvHeader = 'Company,Project Type,Budget,City,State,Address,Contact Name,Contact Email,Contact Phone,Summary,Source,Date\n';
  const csvRows = records.map(r => {
    const s = r.structured || {};
    const loc = s.location || {};
    const contact = s.contactInfo || {};
    return [
      `"${(s.companyName || '').replace(/"/g, '""')}"`,
      `"${(s.projectType || '').replace(/"/g, '""')}"`,
      s.estimatedBudget || 0,
      `"${loc.city || ''}"`,
      `"${loc.state || ''}"`,
      `"${(loc.fullAddress || '').replace(/"/g, '""')}"`,
      `"${(contact.name || '').replace(/"/g, '""')}"`,
      `"${contact.email || ''}"`,
      `"${contact.phone || ''}"`,
      `"${(s.executiveSummary || '').replace(/"/g, '""')}"`,
      r.sourceType,
      r.createdAt?.toISOString() || ''
    ].join(',');
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=data-enrichment-export.csv');
  res.send(csvHeader + csvRows);
}));

module.exports = router;
