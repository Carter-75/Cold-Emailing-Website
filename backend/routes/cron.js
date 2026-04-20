const express = require('express');
const router = express.Router();
const SchedulerService = require('../services/scheduler.service');

const isAuthorizedCron = (req) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return process.env.PRODUCTION !== 'true';
  }

  return req.get('authorization') === `Bearer ${cronSecret}`;
};

const withCronAuth = (handler) => async (req, res) => {
  if (!isAuthorizedCron(req)) {
    console.warn(`[Cron] Unauthorized invocation blocked for ${req.path}`);
    return res.status(401).json({ message: 'Unauthorized cron invocation' });
  }

  try {
    const result = await handler(req);
    res.json({
      ok: true,
      job: req.path,
      timestamp: new Date().toISOString(),
      result
    });
  } catch (err) {
    console.error(`[Cron] ${req.path} failed:`, err);
    res.status(500).json({
      ok: false,
      job: req.path,
      message: err.message
    });
  }
};

router.get('/maintenance', withCronAuth(async () => {
  return SchedulerService.runMaintenance();
}));

router.get('/discovery', withCronAuth(async () => {
  return SchedulerService.runDiscoverySweep();
}));

router.get('/optimize', withCronAuth(async () => {
  return SchedulerService.runOptimizationSweep();
}));

router.get('/outreach', withCronAuth(async (req) => {
  const userId = req.query.userId;
  return SchedulerService.runOutreachChunk(userId);
}));

module.exports = router;
