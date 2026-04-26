const Lead = require('../models/Lead');
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

    const summary = {
      dueLeads: leads.length,
      processed: 0,
      skipped: 0,
      finished: 0,
      errors: 0
    };

    for (const lead of leads) {
      const result = await this.processLead(lead);
      if (result === 'processed') summary.processed += 1;
      else if (result === 'finished') summary.finished += 1;
      else if (result === 'skipped') summary.skipped += 1;
      else if (result === 'error') summary.errors += 1;
    }

    return summary;
  }

  async processLead(lead) {
    const user = lead.userId;
    if (!user || !user.config?.outreachEnabled || lead.status === 'finished') {
      return 'skipped';
    }

    try {
      // Step 0: Enrichment (If still in discovery status)
      if (lead.status === 'discovery') {
        const email = await EnrichmentService.findEmail(lead.businessName, lead.city, user.config.apolloKey);
        if (!email) {
          lead.status = 'finished'; // No email found, give up
          await lead.save();
          return 'finished';
        }
        
        const isValid = await VerificationService.verifyEmail(email, user.config.verifaliaKey);
        if (!isValid) {
          lead.status = 'finished';
          await lead.save();
          return 'finished';
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
        return 'finished';
      }

      // Generate AI Content based on step
      console.log(`[Sequence] Generating AI Step ${currentStep} for ${lead.businessName}...`);
      const body = await EmailService.generateContent(lead, user.config, currentStep);

      // Send Email
      console.log(`[Sequence] Sending Step ${currentStep} to ${lead.recipientEmail}...`);
      const sendConfig = user.config?.toObject ? user.config.toObject() : user.config;

      const emailResult = await EmailService.sendEmail({
        ...sendConfig,
        userId: user._id,
        displayName: user.displayName
      }, lead.recipientEmail, body, lead.businessName);
      
      // Update Lead / Record Sent Email (Crucial for Unified daily limit)
      const SentEmail = require('../models/SentEmail');
      await SentEmail.findOneAndUpdate(
        {
          userId: user._id,
          recipientEmail: lead.recipientEmail
        },
        {
          userId: user._id,
          recipientEmail: lead.recipientEmail,
          businessName: lead.businessName,
          city: lead.city,
          sentAt: new Date(),
          status: 'follow-up-' + currentStep
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

      // Update Lead (Production logic)
      lead.sequenceStep += 1;
      const nextDelay = 7; // Day 1 -> 7 -> 14
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + nextDelay);
      lead.nextEmailAt = nextDate;
      
      lead.messageIds.push(emailResult.messageId);
      lead.thread.push({
        from: user.config.senderEmail,
        to: lead.recipientEmail,
        subject: emailResult.subject,
        body: emailResult.html,
        timestamp: new Date()
      });

      if (lead.sequenceStep > 3) {
        lead.status = 'finished';
      }

      await lead.save();
      
      await Template.findOneAndUpdate(
        {
          userId: user._id,
          step: currentStep,
          variant: lead.variant
        },
        {
          $inc: { 'stats.sentCount': 1 }
        }
      );

      return lead.status === 'finished' ? 'finished' : 'processed';

    } catch (err) {
      console.error(`[Sequence] Error processing lead ${lead._id}:`, err.message);
      // In a SaaS version, we might retry or log a specific error status
      return 'error';
    }
  }
}

module.exports = new SequenceService();
