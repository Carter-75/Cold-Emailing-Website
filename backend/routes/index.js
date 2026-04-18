const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Unsubscribe = require('../models/Unsubscribe');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({ status: 'online', message: 'Cold Emailing API root' });
});

// Outreach Controls
router.post('/outreach/start', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.isShadow) {
      req.user.config = { ...req.user.config, outreachEnabled: true };
      return req.login(req.user, (err) => {
        if (err) return res.status(500).json({ message: 'Session update failed' });
        return res.json({ message: 'Automation enabled' });
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.config.outreachEnabled = true;
    await user.save();

    res.json({ message: 'Automation enabled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/outreach/stop', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.isShadow) {
      req.user.config = { ...req.user.config, outreachEnabled: false };
      return req.login(req.user, (err) => {
        if (err) return res.status(500).json({ message: 'Session update failed' });
        return res.json({ message: 'Automation disabled' });
      });
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

router.post('/outreach/test-send', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const EmailService = require('../services/email.service');
    
    const companyName = user.config?.companyName || user.companyName || 'Your Company';
    const rawConfig = user.config?.toObject ? user.config.toObject() : (user.config || {});
    const testLead = { businessName: 'TEST BUSINESS - ' + companyName };
    const content = await EmailService.generateContent(testLead, user.config);
    
    await EmailService.sendEmail({
      ...rawConfig,
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
    if (!user) return res.status(404).json({ message: 'User not found' });
    const oldKeys = {
      openaiKey: user.config?.openaiKey || ''
    };
    
    // Explicitly update config fields to trigger Mongoose isModified correctly
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        user.config[key] = req.body[key];
      });
    }

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
