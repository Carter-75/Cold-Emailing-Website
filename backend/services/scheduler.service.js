const User = require('../models/User');
const CronState = require('../models/CronState');
const DiscoveryWorker = require('./discovery.service');
const SequenceService = require('./sequence.service');
const IMAPService = require('./imap.service');
const OptimizerService = require('./optimizer.service');
const OutreachEngine = require('./engine.service');

class SchedulerService {
  async acquireLease(key, ttlMinutes) {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    try {
      const result = await CronState.updateOne(
        {
          key,
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: null },
            { lockedUntil: { $lte: now } }
          ]
        },
        {
          $set: {
            lockedUntil,
            lastStartedAt: now
          },
          $setOnInsert: { key }
        },
        { upsert: true }
      );

      return result.upsertedCount > 0 || result.modifiedCount > 0;
    } catch (err) {
      if (err?.code === 11000) {
        return false;
      }
      throw err;
    }
  }

  async releaseLease(key) {
    await CronState.updateOne(
      { key },
      {
        $set: {
          lockedUntil: new Date(0),
          lastFinishedAt: new Date()
        }
      }
    );
  }

  async claimWindow(key, windowKey) {
    try {
      const result = await CronState.updateOne(
        { key, lastWindowKey: { $ne: windowKey } },
        {
          $set: {
            lastWindowKey: windowKey,
            lastRunAt: new Date()
          },
          $setOnInsert: { key }
        },
        { upsert: true }
      );

      return result.upsertedCount > 0 || result.modifiedCount > 0;
    } catch (err) {
      if (err?.code === 11000) {
        return false;
      }
      throw err;
    }
  }

  async runMaintenance() {
    const leaseKey = 'cron:maintenance';
    const acquired = await this.acquireLease(leaseKey, 14);

    if (!acquired) {
      return {
        ok: true,
        skipped: true,
        reason: 'maintenance-already-running'
      };
    }

    try {
      console.log('[Cron] Starting maintenance sweep');
      const sequenceSummary = await SequenceService.processAllSequences();
      const inboxSummary = await IMAPService.checkAllInboxes();
      console.log('[Cron] Maintenance sweep complete', { sequenceSummary, inboxSummary });

      return {
        ok: true,
        skipped: false,
        tasks: ['process-sequences', 'monitor-replies'],
        sequenceSummary,
        inboxSummary
      };
    } finally {
      await this.releaseLease(leaseKey);
    }
  }

  async runDiscoverySweep() {
    const windowKey = new Date().toISOString().slice(0, 10);
    const claimed = await this.claimWindow('cron:discovery', windowKey);

    if (!claimed) {
      return {
        ok: true,
        skipped: true,
        reason: 'discovery-already-ran-today',
        windowKey
      };
    }

    const users = await User.find({
      'config.outreachEnabled': true,
      'config.serpapiKey': { $exists: true, $ne: '' }
    }).select('_id email');

    let processedUsers = 0;
    let leadsQueued = 0;

    for (const user of users) {
      const result = await DiscoveryWorker.runDiscovery(user._id);
      processedUsers += 1;
      leadsQueued += result?.leadsFound ?? 0;
    }

    return {
      ok: true,
      skipped: false,
      windowKey,
      processedUsers,
      leadsQueued
    };
  }

  async runOptimizationSweep() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const week = this.getIsoWeek(now);
    const windowKey = `${year}-W${String(week).padStart(2, '0')}`;
    const claimed = await this.claimWindow('cron:optimize', windowKey);

    if (!claimed) {
      return {
        ok: true,
        skipped: true,
        reason: 'optimization-already-ran-this-week',
        windowKey
      };
    }

    const optimizationSummary = await OptimizerService.runOptimization();

    return {
      ok: true,
      skipped: false,
      windowKey,
      optimizationSummary
    };
  }

  getIsoWeek(date) {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    return Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Specifically triggers the atomic OutreachEngine for a single user (or all if omitted)
   * This is the "Serverless Friendly" alternative to the old long-lived loop.
   */
  async runOutreachChunk(userId) {
    if (userId) {
      return await OutreachEngine.processChunk(userId);
    }

    // If no userId provided, process one chunk for each active user to progress sequences
    const users = await User.find({ 'config.outreachEnabled': true }).select('_id email');
    const results = [];
    for (const user of users) {
      results.push({
        email: user.email,
        result: await OutreachEngine.processChunk(user._id)
      });
    }
    return results;
  }
}

module.exports = new SchedulerService();
