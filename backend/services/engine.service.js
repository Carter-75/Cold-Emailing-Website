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
    this.processedLeadsCount = 0;
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
        this.currentCity = cityRotator.getNextCity();
        emitToAll('engine-log', `Searching for businesses in ${this.currentCity}...`);

        const leads = await LeadGenService.findLeads(this.currentCity, this.currentUser.config.serpapiKey);
        
        if (leads.length === 0) {
          emitToAll('engine-log', `No leads found in ${this.currentCity}. Moving to next city.`);
          continue;
        }

        for (const lead of leads) {
          if (!this.isRunning) break;
          
          // Re-check heartbeat inside lead loop
          if (!hasActiveDashboard()) break;

          emitToAll('engine-log', `Processing: ${lead.name}...`);

          // 1. Check history & suppression
          const alreadySent = await SentEmail.findOne({ userId: this.currentUser._id, recipientEmail: lead.phone }); // Using phone as temporary proxy if email not found yet, but we'll check email specifically after enrichment
          const unsubscribed = await Unsubscribe.findOne({ userId: this.currentUser._id, recipientEmail: lead.phone }); // Ditto

          if (alreadySent || unsubscribed) {
            emitToAll('engine-log', `Skipping ${lead.name} (Already in history/suppression).`);
            continue;
          }

          // 2. Find Email
          const email = await EnrichmentService.findEmail(lead.name, this.currentCity, this.currentUser.config.apolloKey);
          if (!email) {
            emitToAll('engine-log', `No email found for ${lead.name}. Skipping.`);
            continue;
          }

          // 3. Double Check Sent/Unsubscribe/Replied with actual email
          const emailSent = await SentEmail.findOne({ userId: this.currentUser._id, recipientEmail: email });
          const emailUnsub = await Unsubscribe.findOne({ userId: this.currentUser._id, recipientEmail: email });
          const leadStatus = await Lead.findOne({ userId: this.currentUser._id, recipientEmail: email, status: 'replied' });
          
          if (emailSent || emailUnsub || leadStatus) {
            emitToAll('engine-log', `Email ${email} has already responded, unsubscribed, or been sent. Skipping.`);
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
          const content = await EmailService.generateContent(lead.name, this.currentUser.config.openaiKey);

          // 6. Send Email (Handling Test Mode)
          let recipient = email;
          let emailContent = content;
          if (this.currentUser.config.testModeActive) {
            recipient = this.currentUser.config.testRecipientEmail || email;
            emailContent = `[TEST MODE] Original Recipient: ${email}\n\n` + content;
            emitToAll('engine-log', `TEST MODE: Redirecting email for ${lead.name} to ${recipient}`);
          } else {
            emitToAll('engine-log', `Sending email to ${email}...`);
          }

          await EmailService.sendEmail({
            ...this.currentUser.config.toObject(),
            userId: this.currentUser._id,
            displayName: this.currentUser.displayName,
            testMode: this.currentUser.config.testModeActive
          }, recipient, emailContent, lead.name);

          // 7. Log to DB
          await SentEmail.create({
            userId: this.currentUser._id,
            recipientEmail: email,
            businessName: lead.name,
            city: this.currentCity
          });

          this.processedLeadsCount++;
          emitToAll('engine-stats', { sent: this.processedLeadsCount });
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
