const LeadGenService = require('./lead-gen.service');
const EnrichmentService = require('./enrichment.service');
const VerificationService = require('./verification.service');
const EmailService = require('./email.service');
const SequenceService = require('./sequence.service');
const cityRotator = require('./city-rotator');
const SentEmail = require('../models/SentEmail');
const Unsubscribe = require('../models/Unsubscribe');
const User = require('../models/User');
const Lead = require('../models/Lead');

class OutreachEngine {
  constructor() {
    this.processedLeadsCount = 0;
  }

  async getSentTodayCount(userId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return await SentEmail.countDocuments({
      userId,
      sentAt: { $gte: startOfToday }
    });
  }

  /**
   * Atomic, stateless background processor
   * Intended to be triggered via Serverless Cron
   */
  async processChunk(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const config = user.config;

    // OpenAI is strictly required for generation
    if (!config.openaiKey) {
       throw new Error('OpenAI Key is required for core generation.');
    }

    if (!config.serpapiKey || !config.apolloKey || !config.verifaliaKey || !config.senderEmail || !config.appPassword) {
      throw new Error('Incomplete configuration for production outreach.');
    }

    const dailyLimit = config.dailyLeadLimit || 3;
    const totalSentToday = await this.getSentTodayCount(userId);
    
    if (totalSentToday >= dailyLimit) {
      console.log(`[Engine] Daily Limit Reached (${totalSentToday}/${dailyLimit}) for ${user.email}`);
      return { status: 'limit_reached', count: 0 };
    }

    // 1. PRIORITY: Process a chunk of Follow-ups
    let dueFollowUps = await Lead.find({
      userId: user._id,
      status: 'emailed',
      nextEmailAt: { $lte: new Date() }
    }).limit(3);

    if (dueFollowUps.length > 0) {
      for (const followUp of dueFollowUps) {
        const currentCount = await this.getSentTodayCount(user._id);
        if (currentCount >= dailyLimit) return { status: 'limit_reached', count: 0 };
        await SequenceService.processLead(followUp);
      }
      return { status: 'follow_ups_processed', count: dueFollowUps.length };
    }

    // 2. SECONDARY: Discovery
    const currentCity = cityRotator.getNextCity();
    let leads = [];
    try {
      leads = await LeadGenService.findLeads(currentCity, config.serpapiKey, isTest);
    } catch (e) {
      console.error('[Engine] Lead discovery failed:', e.message);
      return { status: 'discovery_failed', count: 0 };
    }

    let discoveryProcessed = 0;
    for (const lead of leads) {
      const currentCount = await this.getSentTodayCount(user._id);
      if (currentCount >= dailyLimit) break;

      const alreadySent = await SentEmail.findOne({ 
        userId: user._id, 
        $or: [{ recipientEmail: lead.phone }, { businessName: lead.name }] 
      });
      const unsubscribed = await Unsubscribe.findOne({ 
        userId: user._id, 
        $or: [{ recipientEmail: lead.phone }, { businessName: lead.name }] 
      });

      if (alreadySent || unsubscribed) continue;

      const email = await EnrichmentService.findEmail(lead.name, currentCity, config.apolloKey, isTest);
      if (!email) continue;

      const leadStatus = await Lead.findOne({ 
        userId: user._id, 
        $or: [{ recipientEmail: email }, { businessName: lead.name }],
        status: 'replied' 
      });
      
      if (leadStatus) continue;

      const isValid = await VerificationService.verifyEmail(email, config.verifaliaKey, isTest);
      if (!isValid) continue;

      const content = await EmailService.generateContent(lead, config);

      const emailResult = await EmailService.sendEmail({
        ...config.toObject ? config.toObject() : config,
        userId: user._id,
        displayName: user.displayName
      }, email, content, lead.name);

      await SentEmail.create({
        userId: user._id,
        recipientEmail: email,
        businessName: lead.name,
        city: currentCity
      });

      // Create or update Lead record
      await Lead.findOneAndUpdate(
        { userId: user._id, recipientEmail: email },
        {
          userId: user._id,
          businessName: lead.name,
          recipientEmail: email,
          city: currentCity,
          status: 'emailed',
          sequenceStep: 1,
          lastEmailedAt: new Date(),
          nextEmailAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days follow-up
          $push: { 
            messageIds: emailResult.messageId,
            thread: {
              from: config.senderEmail,
              to: email,
              subject: emailResult.subject,
              body: emailResult.html,
              timestamp: new Date()
            }
          }
        },
        { upsert: true }
      );
      
      discoveryProcessed++;
      break; 
    }
    
    return { status: 'discovery_processed', count: discoveryProcessed };
  }
}

module.exports = new OutreachEngine();
