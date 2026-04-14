const Lead = require('../models/Lead');
const User = require('../models/User');
const Template = require('../models/Template');
const EmailService = require('./email.service');
const EnrichmentService = require('./enrichment.service');
const VerificationService = require('./verification.service');

class SequenceService {
  async processAllSequences() {
    const leads = await Lead.find({ 
      status: { $in: ['discovery', 'emailed'] },
      nextEmailAt: { $lte: new Date() }
    }).populate('userId');

    for (const lead of leads) {
      await this.processLead(lead);
    }
  }

  async processLead(lead) {
    const user = lead.userId;
    if (!user || user.config.testModeActive === false && lead.status === 'finished') return;

    try {
      // Step 0: Enrichment (If still in discovery status)
      if (lead.status === 'discovery') {
        const email = await EnrichmentService.findEmail(lead.businessName, lead.city, user.config.apolloKey);
        if (!email) {
          lead.status = 'finished'; // No email found, give up
          await lead.save();
          return;
        }
        
        const isValid = await VerificationService.verifyEmail(email, user.config.verifaliaKey);
        if (!isValid) {
          lead.status = 'finished';
          await lead.save();
          return;
        }

        lead.recipientEmail = email;
        lead.status = 'emailed';
        lead.sequenceStep = 1;
        lead.nextEmailAt = new Date(); // Send Step 1 immediately
      }

      // Step 1/2/3 Logic
      const currentStep = lead.sequenceStep;
      if (currentStep > 3) {
        lead.status = 'finished';
        await lead.save();
        return;
      }

      // Generate AI Content based on step
      console.log(`[Sequence] Generating AI Step ${currentStep} for ${lead.businessName}...`);
      const body = await EmailService.generateContent(lead, user.config, currentStep);

      // Final Check: Test Mode
      let recipient = lead.recipientEmail;
      let finalBody = body;

      if (user.config.testModeActive) {
        recipient = user.config.testRecipientEmail || lead.recipientEmail;
        finalBody = `--- DATABASE SNAPSHOT [TEST MODE] ---
Business: ${lead.businessName}
Found Email: ${lead.recipientEmail}
City: ${lead.city}
Category: ${lead.category || 'N/A'}
Sequence Step: ${currentStep}
Variant: ${lead.variant}
Status: ${lead.status}
--------------------------------------
\n\n` + body;
      }

      // Send Email
      console.log(`[Sequence] Sending Step ${currentStep} to ${recipient}...`);
      await EmailService.sendEmail(user.config, recipient, finalBody, lead.businessName);
      
      // Update Lead / Record Sent Email (Crucial for Unified daily limit)
      const SentEmail = require('../models/SentEmail');
      const sentRecord = await SentEmail.create({
        userId: user._id,
        recipientEmail: lead.recipientEmail,
        businessName: lead.businessName,
        status: 'follow-up-' + currentStep,
        testMode: !!user.config.testModeActive
      });

      // Cleanup logic for Stateless Testing
      if (user.config.testModeActive) {
        console.log(`[Test Mode] Cleaning up stateless data for ${lead.businessName}...`);
        await Lead.deleteOne({ _id: lead._id });
        await SentEmail.deleteOne({ _id: sentRecord._id });
        return; // Terminate early for this lead in test mode
      }

      // Update Lead (Production logic)
      lead.sequenceStep += 1;
      const nextDelay = currentStep === 1 ? 7 : 7; // Day 1 -> 7 -> 14
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + nextDelay);
      lead.nextEmailAt = nextDate;

      if (lead.sequenceStep > 3) {
        lead.status = 'finished';
      }

      await lead.save();
      
      // Update Template Stats
      template.stats.sentCount += 1;
      await template.save();

    } catch (err) {
      console.error(`[Sequence] Error processing lead ${lead._id}:`, err.message);
      // In a SaaS version, we might retry or log a specific error status
    }
  }
}

module.exports = new SequenceService();
