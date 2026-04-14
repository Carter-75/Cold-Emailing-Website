const express = require('express');
const router = express.Router();
const OutreachEngine = require('../services/engine.service');
const User = require('../models/User');
const Unsubscribe = require('../models/Unsubscribe');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

// Outreach Controls
router.post('/outreach/start', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    await OutreachEngine.start(req.user._id);
    res.json({ message: 'Engine starting' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/outreach/stop', (req, res) => {
  OutreachEngine.stop('User stopped');
  res.json({ message: 'Engine stopping' });
});

router.post('/outreach/test-send', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    const user = await User.findById(req.user._id);
    const EmailService = require('../services/email.service');
    
    const testLead = { businessName: 'TEST BUSINESS - ' + user.companyName };
    const content = await EmailService.generateContent(testLead, user.config);
    
    await EmailService.sendEmail({
      ...user.config.toObject(),
      userId: user._id,
      displayName: user.displayName,
      testMode: true
    }, user.config.testRecipientEmail || user.config.senderEmail, `[MANUAL TEST]\n\n` + content, testLead.businessName);
    
    res.json({ message: 'Test email sent successfully to ' + (user.config.testRecipientEmail || user.config.senderEmail) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update Config
router.post('/config', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    // Shadow Mode Support
    if (req.user.isShadow) {
      req.user.config = { ...req.user.config, ...req.body };
      // Re-serialize the shadow user into the session so changes persist for this browser session
      req.login(req.user, (err) => {
        if (err) return res.status(500).json({ message: 'Session update failed' });
        return res.json({ message: 'Configuration saved to session (Shadow Mode)' });
      });
      return;
    }

    const user = await User.findById(req.user._id);
    const oldKeys = { ...user.config.toObject() };
    user.config = { ...user.config, ...req.body };
    await user.save();

    // If OpenAI key was added/updated and no templates exist, bootstrap them
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
router.get('/unsubscribe', async (req, res) => {
  const { email, userId, businessName } = req.query;
  if (!email || !userId) return res.status(400).send('Invalid request');
  
  try {
    const Lead = require('../models/Lead');

    // 1. Record the unsubscribe with business context
    await Unsubscribe.findOneAndUpdate(
      { userId, recipientEmail: email },
      { userId, recipientEmail: email, businessName },
      { upsert: true }
    );

    // 2. Kill all active leads for this user/email or user/business
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
