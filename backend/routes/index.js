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
        await testLead.save();
      }
    }

    // 4. Mimic Suppression Logic
    if (testLead.status === 'replied') {
      return res.status(403).json({ 
        message: 'Logic Conflict: Lead has already replied. Real outreach would be suppressed. Test send blocked.' 
      });
    }

    if (testLead.status === 'finished') {
      return res.status(403).json({ 
        message: 'Sequence Complete: This lead has already received all 3 emails. Real outreach is finished.' 
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

// Unsubscribe Management (Testing)
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

// Lead Management
router.get('/leads', verifyToken, async (req, res) => {
  try {
    const Lead = require('../models/Lead');
    const leads = await Lead.find({ userId: req.user._id })
      .sort({ status: 1, updatedAt: -1 }); // 'replied' is alphabetically after 'emailed', wait.
      // enum: ['discovery', 'emailed', 'replied', 'finished']
      // Actually, user wants replied at the top.
    
    // Sort logic: replied first, then others by date
    const sortedLeads = leads.sort((a, b) => {
      if (a.status === 'replied' && b.status !== 'replied') return -1;
      if (a.status !== 'replied' && b.status === 'replied') return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    res.json(sortedLeads);
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
