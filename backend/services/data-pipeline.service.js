/**
 * Data Pipeline Service — The Orchestrator
 * 
 * Mirrors engine.service.js in architecture but for data enrichment.
 * Pipeline: Scrape → Dedupe → AI Process → Validate → Store → (Optional) Outreach
 * 
 * Runs on a cron schedule (every 12 hours) or can be triggered manually.
 */

const DataRecord = require('../models/DataRecord');
const User = require('../models/User');
const Lead = require('../models/Lead');
const DataSources = require('./data-sources');
const DataAnalyst = require('./data-analyst.service');
const EmailService = require('./email.service');

class DataPipelineService {
  /**
   * Run the full pipeline for all users with data enrichment enabled
   * Called by the cron route
   */
  async runPipeline() {
    console.log('[DataPipeline] Starting pipeline run...');
    
    const users = await User.find({ 'config.dataEnrichment.enabled': true });
    
    if (users.length === 0) {
      console.log('[DataPipeline] No users with data enrichment enabled.');
      return { status: 'no_users', usersProcessed: 0 };
    }

    const results = [];
    
    for (const user of users) {
      try {
        const result = await this.runForUser(user);
        results.push({ userId: user._id, email: user.email, ...result });
      } catch (err) {
        console.error(`[DataPipeline] Failed for user ${user.email}:`, err.message);
        results.push({ userId: user._id, email: user.email, error: err.message });
      }
    }

    console.log(`[DataPipeline] Pipeline complete. Processed ${results.length} users.`);
    return { status: 'complete', usersProcessed: results.length, results };
  }

  /**
   * Run the pipeline for a specific user
   * @param {object} user - User document with config.dataEnrichment
   */
  async runForUser(user) {
    const enrichConfig = user.config?.dataEnrichment;
    if (!enrichConfig?.enabled) {
      return { status: 'disabled' };
    }

    const activeSources = enrichConfig.activeSources || [];
    if (activeSources.length === 0) {
      return { status: 'no_sources' };
    }

    const dailyLimit = enrichConfig.dailyProcessLimit || 50;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const processedToday = await DataRecord.countDocuments({
      userId: user._id,
      processedAt: { $gte: startOfToday }
    });

    if (processedToday >= dailyLimit) {
      console.log(`[DataPipeline] Daily limit reached for ${user.email} (${processedToday}/${dailyLimit}).`);
      return { status: 'daily_limit_reached', processedToday };
    }

    let totalIngested = 0;
    let totalProcessed = 0;
    let totalFailed = 0;
    let sentToOutreach = 0;

    // --- Phase 1: Ingest from all active sources ---
    for (const sourceName of activeSources) {
      try {
        const entries = await DataSources.fetchFromSource(sourceName, {
          regions: enrichConfig.targetRegions || [],
          limit: Math.min(25, dailyLimit - processedToday)
        });

        for (const entry of entries) {
          // Deduplicate
          const exists = await DataRecord.findOne({
            userId: user._id,
            sourceType: sourceName,
            sourceId: entry.sourceId
          });

          if (!exists) {
            await DataRecord.create({
              userId: user._id,
              sourceType: sourceName,
              sourceId: entry.sourceId,
              sourceUrl: entry.sourceUrl,
              raw: entry.raw,
              status: 'raw'
            });
            totalIngested++;
          }
        }
      } catch (err) {
        console.error(`[DataPipeline] Ingestion error for source ${sourceName}:`, err.message);
      }
    }

    // --- Phase 2: AI Processing ---
    const remaining = dailyLimit - processedToday;
    const rawRecords = await DataRecord.find({
      userId: user._id,
      status: 'raw'
    }).sort({ createdAt: 1 }).limit(Math.min(remaining, 20)); // Process max 20 per tick to avoid Vercel timeout

    const startTime = Date.now();

    for (const record of rawRecords) {
      // Safety: don't exceed 25 seconds (Vercel timeout protection)
      if (Date.now() - startTime > 25000) {
        console.log('[DataPipeline] Approaching timeout. Stopping processing.');
        break;
      }

      try {
        record.status = 'processing';
        await record.save();

        const structured = await DataAnalyst.processEntry(
          record.raw,
          record.sourceType,
          user.config
        );

        const isValid = DataAnalyst.verifyStructuredData(structured);

        if (isValid) {
          record.structured = structured;
          record.status = 'processed';
          record.processedAt = new Date();
          await record.save();
          totalProcessed++;

          // --- Phase 3 (Optional): Auto-Outreach ---
          if (enrichConfig.autoOutreach && structured.contactInfo?.email) {
            try {
              const pushed = await this._pushToOutreach(user, record, structured);
              if (pushed) sentToOutreach++;
            } catch (outreachErr) {
              console.warn(`[DataPipeline] Auto-outreach failed for ${structured.companyName}:`, outreachErr.message);
            }
          }
        } else {
          record.status = 'failed';
          record.failureReason = 'QA validation failed — insufficient data extracted';
          await record.save();
          totalFailed++;
        }
      } catch (err) {
        record.status = 'failed';
        record.failureReason = err.message;
        await record.save();
        totalFailed++;
        console.error(`[DataPipeline] Processing error for record ${record._id}:`, err.message);
      }
    }

    // Update last run timestamp
    await User.updateOne(
      { _id: user._id },
      { 'config.dataEnrichment.lastRunAt': new Date() }
    );

    const summary = {
      status: 'complete',
      ingested: totalIngested,
      processed: totalProcessed,
      failed: totalFailed,
      sentToOutreach,
      processedToday: processedToday + totalProcessed
    };

    console.log(`[DataPipeline] User ${user.email} summary:`, summary);
    return summary;
  }

  /**
   * Push a processed data record into the outreach pipeline as a lead
   * This bridges the data enrichment service with the existing cold email engine
   */
  async _pushToOutreach(user, record, structured) {
    if (!structured.contactInfo?.email || !structured.contactInfo.email.includes('@')) {
      return false;
    }

    // Check if lead already exists
    const existingLead = await Lead.findOne({
      userId: user._id,
      recipientEmail: structured.contactInfo.email
    });

    if (existingLead) {
      return false;
    }

    // Create a new lead from the data record
    const lead = await Lead.create({
      userId: user._id,
      businessName: structured.companyName || 'Data Intelligence Lead',
      recipientEmail: structured.contactInfo.email,
      city: structured.location?.city || '',
      category: structured.projectType || record.sourceType,
      website: null,
      status: 'discovery', // Enter the normal engine pipeline
      source: 'data-enrichment',
      sourceEmail: user.config?.senderEmail || ''
    });

    // Link the data record to the lead
    record.status = 'sent-to-outreach';
    record.linkedLeadId = lead._id;
    await record.save();

    console.log(`[DataPipeline] Pushed ${structured.companyName} to outreach pipeline.`);
    return true;
  }

  /**
   * Get pipeline statistics for a user
   */
  async getStats(userId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [
      totalRecords,
      processedToday,
      processedThisWeek,
      rawPending,
      failedRecords,
      sentToOutreach,
      bySource
    ] = await Promise.all([
      DataRecord.countDocuments({ userId }),
      DataRecord.countDocuments({ userId, processedAt: { $gte: startOfToday } }),
      DataRecord.countDocuments({ userId, processedAt: { $gte: startOfWeek } }),
      DataRecord.countDocuments({ userId, status: 'raw' }),
      DataRecord.countDocuments({ userId, status: 'failed' }),
      DataRecord.countDocuments({ userId, status: 'sent-to-outreach' }),
      DataRecord.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId.toString()) } },
        { $group: { _id: '$sourceType', count: { $sum: 1 } } }
      ])
    ]);

    return {
      totalRecords,
      processedToday,
      processedThisWeek,
      rawPending,
      failedRecords,
      sentToOutreach,
      bySource: bySource.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {})
    };
  }
}

module.exports = new DataPipelineService();
