const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Unsubscribe = require('../models/Unsubscribe');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({ status: 'online', message: 'Cold Emailing API root' });
});

// Outreach Controls
router.post('/outreach/start', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Subscription check
    const status = user.subscription?.status;
    const isSubscribed = status === 'active' || status === 'trialing';

    if (!isSubscribed) {
      return res.status(403).json({ 
        message: 'Subscription Required: Please upgrade your account to initiate the engine.',
        needsUpgrade: true
      });
    }

    user.config.outreachEnabled = true;
    await user.save();
    res.json({ message: 'Automation enabled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/outreach/stop', verifyToken, async (req, res) => {
  try {
    if (req.user.isShadow) {
      const config = { ...(req.user.config || {}), outreachEnabled: false };
      const newToken = jwt.sign({ ...req.user, config }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ message: 'Automation disabled (Shadow Mode)', token: newToken });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.config.outreachEnabled = false;
    await user.save();

    res.json({ message: 'Automation disabled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/outreach/test-send', verifyToken, async (req, res) => {
  try {
    const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const recipient = user.config?.testRecipientEmail || user.config?.senderEmail;
    if (!recipient) return res.status(400).json({ message: 'No test recipient email configured.' });

    const Lead = require('../models/Lead');
    const OutreachEngine = require('../services/engine.service');
    const SequenceService = require('../services/sequence.service');

    // 1. Check Daily Limit (Mimic real engine)
    const dailyLimit = user.config?.dailyLeadLimit || 3;
    const totalSentToday = await OutreachEngine.getSentTodayCount(user._id);
    
    if (totalSentToday >= dailyLimit) {
      return res.status(403).json({ 
        message: `Daily Limit Reached (${totalSentToday}/${dailyLimit}). Test send blocked to mimic real automation limits.` 
      });
    }

    // 2. Check Unsubscribe List
    const isUnsubbed = await Unsubscribe.findOne({ 
      userId: user._id, 
      recipientEmail: recipient 
    });
    
    if (isUnsubbed) {
      return res.status(403).json({ 
        message: 'Manual test blocked: This email is currently in your unsubscribe list.' 
      });
    }

    // 3. Find or Create Test Lead
    let testLead = await Lead.findOne({ userId: user._id, isTestData: true });
    
    if (!testLead) {
      // Create a fresh test lead
      testLead = await Lead.create({
        userId: user._id,
        businessName: 'TEST - ' + (user.config?.companyName || 'Lead'),
        recipientEmail: recipient,
        city: 'Test City',
        status: 'emailed', // Start at emailed for Step 1
        sequenceStep: 1,   // Will be incremented by processLead
        isTestData: true
      });
    } else {
      // Sync recipient email in case user changed it in config
      if (testLead.recipientEmail !== recipient) {
        testLead.recipientEmail = recipient;
        // If recipient changed, we might want to reset status if it was finished/replied
        // but let's assume the user wants to test the sequence for the NEW recipient
        testLead.status = 'emailed';
        testLead.sequenceStep = 1;
        await testLead.save();
      }
    }

    // 4. Mimic Suppression Logic (Sync status with Unsubscribe list if needed)
    if (isUnsubbed && testLead.status !== 'finished') {
      testLead.status = 'finished';
      await testLead.save();
    }

    if (testLead.status === 'replied') {
      return res.status(403).json({ 
        message: 'Logic Conflict: This test lead has already "replied". Real outreach would be suppressed. Reset the lead or clear its status to test again.' 
      });
    }

    if (testLead.status === 'finished') {
      const reason = isUnsubbed ? 'Lead has unsubscribed.' : 'Sequence complete (3/3 emails sent).';
      return res.status(403).json({ 
        message: `Sequence Suppressed: ${reason} Real outreach is finished for this contact.` 
      });
    }

    // 5. Execute using REAL Sequence Logic
    // We pass the populated user object for shadow mode compatibility
    testLead.userId = user; 
    const result = await SequenceService.processLead(testLead, true); // forceSend = true

    if (result === 'finished') {
      return res.json({ message: 'Test email sent! Sequence is now complete for this lead.' });
    } else if (result === 'processed') {
      return res.json({ message: 'Test email sent successfully! Mimicking Step ' + testLead.sequenceStep });
    } else {
      return res.status(500).json({ message: 'Engine failed to process test lead.' });
    }
  } catch (err) {
    console.error('[TestSend] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Unsubscribe Management (Testing/UI)
router.get('/outreach/unsub-list', verifyToken, async (req, res) => {
  try {
    const Unsubscribe = require('../models/Unsubscribe');
    const list = await Unsubscribe.find({ userId: req.user._id }).sort({ unsubscribedAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/outreach/unsub-status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const recipient = user.config?.testRecipientEmail || user.config?.senderEmail;
    const unsub = await Unsubscribe.findOne({ userId: user._id, recipientEmail: recipient });
    res.json({ isUnsubscribed: !!unsub, email: recipient });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/outreach/unsub-clear', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const recipient = user.config?.testRecipientEmail || user.config?.senderEmail;
    await Unsubscribe.deleteOne({ userId: user._id, recipientEmail: recipient });
    res.json({ message: 'Unsubscribe status cleared for ' + recipient });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/outreach/sync-inbox', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const IMAPService = require('../services/imap.service');
    const result = await IMAPService.checkInbox(user);
    
    res.json({ 
      message: `Inbox synced. Detected ${result.repliesDetected} new replies.`,
      result 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lead Management
router.get('/leads', verifyToken, async (req, res) => {
  try {
    const Lead = require('../models/Lead');
    const Unsubscribe = require('../models/Unsubscribe');
    const leads = await Lead.find({ userId: req.user._id })
      .sort({ updatedAt: -1 }); 
    
    const unsubList = await Unsubscribe.find({ userId: req.user._id });
    const unsubEmails = new Set(unsubList.map(u => u.recipientEmail.toLowerCase()));

    const leadsWithUnsub = leads.map(l => ({
      ...l.toObject ? l.toObject() : l,
      isUnsubscribed: unsubEmails.has(l.recipientEmail.toLowerCase())
    }));

    res.json(leadsWithUnsub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/leads/:id/reply', verifyToken, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ message: 'Reply content is required.' });

    const Lead = require('../models/Lead');
    const EmailService = require('../services/email.service');
    const lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });

    const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const Unsubscribe = require('../models/Unsubscribe');
    const isUnsubscribed = await Unsubscribe.findOne({ userId: user._id, recipientEmail: lead.recipientEmail.toLowerCase() });
    if (isUnsubscribed) {
      return res.status(403).json({ message: 'Cannot send manual reply: Lead is on the suppression (unsubscribe) list.' });
    }

    const sendConfig = user.config?.toObject ? user.config.toObject() : user.config;

    // Send the manual reply
    const emailResult = await EmailService.sendEmail({
      ...sendConfig,
      userId: user._id,
      displayName: user.displayName || user.config.senderName
    }, lead.recipientEmail, body, lead.businessName);

    // Update Lead Thread
    lead.thread.push({
      from: user.config.senderEmail,
      to: lead.recipientEmail,
      subject: emailResult.subject,
      body: body, // Use original body to avoid <br> tags if not needed, but sendEmail adds them for HTML
      timestamp: new Date()
    });

    lead.messageIds.push(emailResult.messageId);
    
    // If we reply, we might want to change status back to 'emailed' to continue sequence
    // OR keep it at 'replied' if we are handling it manually.
    // Let's keep it at 'replied' but updated.
    // Only set to emailed if it's currently discovery (to start sequence)
    // If it's already replied or finished, keep that status.
    if (lead.status === 'discovery') {
      lead.status = 'emailed';
    }

    await lead.save();
    res.json({ message: 'Reply sent successfully', lead });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/leads/:id/refine-reply', verifyToken, async (req, res) => {
  try {
    const { draft } = req.body;
    if (!draft) return res.status(400).json({ message: 'Draft is required for refinement.' });

    const Lead = require('../models/Lead');
    const EmailService = require('../services/email.service');
    const lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });

    const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const refinedText = await EmailService.refineReply(lead, user.config, draft);
    res.json({ refinedText });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/leads/:id/clean-thread', verifyToken, async (req, res) => {
  try {
    const Lead = require('../models/Lead');
    const EmailService = require('../services/email.service');
    const lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });

    const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Clean each message in the thread
    const cleanedThread = [];
    for (const msg of lead.thread) {
      const cleanedBody = await EmailService.cleanMessageWithAI(msg.body, user.config);
      cleanedThread.push({
        ...msg.toObject ? msg.toObject() : msg,
        body: cleanedBody
      });
    }

    lead.thread = cleanedThread;
    await lead.save();

    res.json({ message: 'Thread cleaned successfully', lead });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update Config
router.post('/config', verifyToken, async (req, res) => {
  try {
    const allowedKeys = [
      'openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaKey', 'senderEmail', 'appPassword', 
      'senderName', 'senderTitle', 'companyName', 'websiteUrl', 'physicalAddress', 'priceTier1', 
      'priceTier2', 'priceTier3', 'valueProp', 'targetOutcome', 'personaContext', 'dailyLeadLimit', 
      'smtpHost', 'smtpPort', 'smtpSecure', 'testRecipientEmail', 'signature'
    ];

    let safeBody = {};
    if (req.body) {
      Object.keys(req.body).forEach(k => {
        if (allowedKeys.includes(k)) safeBody[k] = req.body[k];
      });
    }

    // Shadow Mode Support
    if (req.user.isShadow) {
      const config = { ...(req.user.config || {}), ...safeBody };
      const newToken = jwt.sign({ ...req.user, config }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ message: 'Configuration saved to session (Shadow Mode)', token: newToken });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const oldKeys = {
      openaiKey: user.config?.openaiKey || ''
    };
    
    // Explicitly update config fields
    Object.keys(safeBody).forEach(key => {
      user.config[key] = safeBody[key];
    });

    await user.save();

    const OptimizerService = require('../services/optimizer.service');
    if (user.config.openaiKey && (!oldKeys.openaiKey || oldKeys.openaiKey !== user.config.openaiKey)) {
      await OptimizerService.bootstrapTemplates(user._id, user.config.openaiKey);
    }

    res.json({ message: 'Configuration saved and templates optimized' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Unsubscribe
const crypto = require('crypto');
router.get('/unsubscribe', async (req, res) => {
  const { email, userId, businessName, sig } = req.query;
  if (!email || !userId || !sig) return res.status(400).send('Invalid request');

  const expectedSig = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(email + userId)
    .digest('hex');

  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return res.status(403).send('Invalid signature. Unsubscribe link forged or expired.');
  }
  
  try {
    const Lead = require('../models/Lead');

    await Unsubscribe.findOneAndUpdate(
      { userId, recipientEmail: email },
      { userId, recipientEmail: email, businessName },
      { upsert: true }
    );

    const query = { $or: [{ userId, recipientEmail: email }] };
    if (businessName) query.$or.push({ userId, businessName });

    await Lead.updateMany(query, { status: 'finished' });

    res.send('<h1>You have been unsubscribed.</h1><p>We will not contact you or your business again.</p>');
  } catch (err) {
    console.error('Unsubscribe Error:', err);
    res.status(500).send('Error processing unsubscribe request.');
  }
});

module.exports = router;
