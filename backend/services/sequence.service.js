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

      // Get Template (A/B)
      let template = await Template.findOne({ userId: user._id, step: currentStep, variant: lead.variant });
      
      // If template doesn't exist, we might need to generate it or use a default logic
      // For this SaaS version, we expect templates to be pre-generated or we generate them on the fly
      if (!template) {
        console.log(`[Sequence] Template missing for Step ${currentStep} Variant ${lead.variant}. Skipping.`);
        return;
      }

      // Final Check: Test Mode
      let recipient = lead.recipientEmail;
      let subject = template.subject;
      let body = template.body;

      if (user.config.testModeActive) {
        recipient = user.config.testRecipientEmail;
        body = `--- TEST MODE METADATA ---
Original Recipient: ${lead.recipientEmail}
Business: ${lead.businessName}
Step: ${currentStep}
Variant: ${lead.variant}
---------------------------
\n\n` + body;
      }

      // Send Email
      console.log(`[Sequence] Sending Step ${currentStep} to ${recipient}...`);
      const sentInfo = await EmailService.sendEmail(user.config, recipient, body, lead.businessName);
      
      // Update Lead
      lead.sequenceStep += 1;
      lead.lastEmailedAt = new Date();
      
      // Schedule next step
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
