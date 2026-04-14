const LeadGenService = require('./lead-gen.service');
const EnrichmentService = require('./enrichment.service');
const VerificationService = require('./verification.service');
const EmailService = require('./email.service');
const cityRotator = require('./city-rotator');
const SentEmail = require('../models/SentEmail');
const Unsubscribe = require('../models/Unsubscribe');
const User = require('../models/User');
const Lead = require('../models/Lead');
const { emitToAll, hasActiveDashboard } = require('./socket.service');

class OutreachEngine {
  constructor() {
    this.isRunning = false;
    this.currentUser = null;
    this.currentCity = null;
    this.processedLeadsCount = 0; // Legacy local counter, will be supplemented by database check
  }

  async getSentTodayCount(userId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return await SentEmail.countDocuments({
      userId,
      sentAt: { $gte: startOfToday }
    });
  }

  async start(userId) {
    if (this.isRunning) return;
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const config = user.config;
    if (!config.openaiKey || !config.serpapiKey || !config.apolloKey || !config.verifaliaKey || !config.senderEmail || !config.appPassword) {
      throw new Error('Incomplete configuration. Please provide all API keys and SMTP settings.');
    }

    this.isRunning = true;
    this.currentUser = user;
    console.log('Outreach Engine STARTED for user:', user.email);
    emitToAll('engine-status', { status: 'running', message: 'Engine started' });

    this.loop();
  }

  stop(reason = 'User stopped') {
    this.isRunning = false;
    console.log('Outreach Engine STOPPED. Reason:', reason);
    emitToAll('engine-status', { status: 'stopped', message: reason });
  }

  async loop() {
    while (this.isRunning) {
      // HEARTBEAT CHECK: User said "only run when on the website"
      if (!hasActiveDashboard()) {
        console.log('No active dashboard detected. Pausing engine...');
        emitToAll('engine-status', { status: 'paused', message: 'No active browser tab detected' });
        await this.delay(10000); // Check again in 10s
        continue;
      }

      try {
        // 1. Unified Daily Limit Check
        const totalSentToday = await this.getSentTodayCount(this.currentUser._id);
        const dailyLimit = this.currentUser.config.dailyLeadLimit || 3;
        
        if (totalSentToday >= dailyLimit) {
          emitToAll('engine-log', `Daily Limit Reached (${totalSentToday}/${dailyLimit}). Engine pausing...`);
          this.stop('Daily limit reached (Database synchronized)');
          break;
        }

        // 2. PRIORITY: Process Scheduled Follow-ups FIRST
        emitToAll('engine-log', `Checking for due follow-ups (Priority 1)...`);
        const SequenceService = require('./sequence.service');
        const dueFollowUps = await Lead.find({
          userId: this.currentUser._id,
          status: 'emailed',
          nextEmailAt: { $lte: new Date() }
        });

        if (dueFollowUps.length > 0) {
          emitToAll('engine-log', `Found ${dueFollowUps.length} follow-ups due. Processing...`);
          for (const followUp of dueFollowUps) {
            if (!this.isRunning || !hasActiveDashboard()) break;
            
            // Re-check limit inside follow-up loop
            const currentCount = await this.getSentTodayCount(this.currentUser._id);
            if (currentCount >= dailyLimit) break;

            await SequenceService.processLead(followUp);
            emitToAll('engine-stats', { sent: currentCount + 1 });
            
            // Delay between follow-ups
            await this.delay(10000);
          }
          continue; // Re-start loop to check limits and more follow-ups before discovery
        }

        // 3. SECONDARY: Discovery (Find new businesses)
        this.currentCity = cityRotator.getNextCity();
        emitToAll('engine-log', `No follow-ups due. Searching for NEW businesses in ${this.currentCity}...`);

        const leads = await LeadGenService.findLeads(this.currentCity, this.currentUser.config.serpapiKey);

        for (const lead of leads) {
          if (!this.isRunning) break;
          
          // Re-check heartbeat inside lead loop
          if (!hasActiveDashboard()) break;

          // Limit Enforcement
          if (this.processedLeadsCount >= this.currentUser.config.dailyLeadLimit) {
            emitToAll('engine-log', `Daily Limit Reached (${this.currentUser.config.dailyLeadLimit}). Engine stopping...`);
            this.stop('Daily limit reached');
            break;
          }

          emitToAll('engine-log', `Processing: ${lead.name}...`);

          // 1. Check history & suppression (Email proxy or Business Name)
          const alreadySent = await SentEmail.findOne({ 
            userId: this.currentUser._id, 
            $or: [{ recipientEmail: lead.phone }, { businessName: lead.name }] 
          });
          const unsubscribed = await Unsubscribe.findOne({ 
            userId: this.currentUser._id, 
            $or: [{ recipientEmail: lead.phone }, { businessName: lead.name }] 
          });

          if (alreadySent || unsubscribed) {
            emitToAll('engine-log', `Skipping ${lead.name} (Business/Phone already in history/suppression).`);
            continue;
          }

          // 2. Find Email
          const email = await EnrichmentService.findEmail(lead.name, this.currentCity, this.currentUser.config.apolloKey);
          if (!email) {
            emitToAll('engine-log', `No email found for ${lead.name}. Skipping.`);
            continue;
          }

          // 3. Double Check Sent/Unsubscribe/Replied with actual email OR Business Name
          const emailSent = await SentEmail.findOne({ 
            userId: this.currentUser._id, 
            $or: [{ recipientEmail: email }, { businessName: lead.name }] 
          });
          const emailUnsub = await Unsubscribe.findOne({ 
            userId: this.currentUser._id, 
            $or: [{ recipientEmail: email }, { businessName: lead.name }] 
          });
          const leadStatus = await Lead.findOne({ 
            userId: this.currentUser._id, 
            $or: [{ recipientEmail: email }, { businessName: lead.name }],
            status: 'replied' 
          });
          
          if (emailSent || emailUnsub || leadStatus) {
            emitToAll('engine-log', `Business ${lead.name} or Email ${email} has already responded, unsubscribed, or been sent. Skipping.`);
            continue;
          }

          // 4. Verify Email
          const isValid = await VerificationService.verifyEmail(email, this.currentUser.config.verifaliaKey);
          if (!isValid) {
            emitToAll('engine-log', `Email ${email} failed verification. Skipping.`);
            continue;
          }

          // 5. Generate AI Content
          emitToAll('engine-log', `Generating personalized pitch for ${lead.name}...`);
          const content = await EmailService.generateContent(lead, this.currentUser.config);

          // 6. Send Email (Handling Test Mode)
          let recipient = email;
          let emailContent = content;
          if (this.currentUser.config.testModeActive) {
            recipient = this.currentUser.config.testRecipientEmail || email;
            emailContent = `--- DATABASE SNAPSHOT [TEST MODE] ---
Business: ${lead.name}
Found Email: ${email}
City: ${this.currentCity}
Category: ${lead.category || 'N/A'}
Phone: ${lead.phone || 'N/A'}
Source Maps Address: ${lead.address || 'N/A'}
--------------------------------------
\n\n` + content;
            emitToAll('engine-log', `TEST MODE: Redirecting email for ${lead.name} to ${recipient}`);
          } else {
            emitToAll('engine-log', `Sending email to ${email}...`);
          }

          const safeConfig = this.currentUser.config.toObject ? this.currentUser.config.toObject() : this.currentUser.config;
          
          await EmailService.sendEmail({
            ...safeConfig,
            userId: this.currentUser._id,
            displayName: this.currentUser.displayName,
            testMode: this.currentUser.config.testModeActive
          }, recipient, emailContent, lead.name);

          // 7. Log to DB
          const sentRecord = await SentEmail.create({
            userId: this.currentUser._id,
            recipientEmail: email,
            businessName: lead.name,
            city: this.currentCity,
            testMode: !!this.currentUser.config.testModeActive
          });

          // Cleanup logic for Stateless Testing
          if (this.currentUser.config.testModeActive) {
            console.log(`[Test Mode] Cleaning up stateless data for ${lead.name}...`);
            await SentEmail.deleteOne({ _id: sentRecord._id });
            // Note: Discovery leads aren't always saved as 'Lead' models in this loop yet,
            // but if they were, they would be deleted here. 
            emitToAll('engine-log', `[Test Mode] Success! (Data wiped)`);
            continue; 
          }

          // Update User Stats
          const newSentCount = await this.getSentTodayCount(this.currentUser._id);
          emitToAll('engine-stats', { sent: newSentCount });
          emitToAll('engine-log', `Success! Email sent to ${lead.name}.`);

          // 8. Jitter Delay
          const delayTime = Math.floor(Math.random() * (120000 - 60000 + 1)) + 60000;
          emitToAll('engine-log', `Waiting ${Math.floor(delayTime/1000)}s before next send...`);
          await this.delay(delayTime);
        }

      } catch (err) {
        console.error('FATAL LOGIC ERROR:', err);
        this.stop(`FATAL ERROR: ${err.message}`); // KILL SWITCH
        break;
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new OutreachEngine();
