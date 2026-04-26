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
    if (req.user.isShadow) {
      const config = { ...(req.user.config || {}), outreachEnabled: true };
      const newToken = jwt.sign({ ...req.user, config }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ message: 'Automation enabled (Shadow Mode)', token: newToken });
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
    
    // Safety check: Don't send if unsubscribed
    const isUnsubbed = await Unsubscribe.findOne({ 
      userId: user._id, 
      recipientEmail: recipient 
    });
    
    if (isUnsubbed) {
      console.error(`[Manual Test] Blocked: ${recipient} is in the unsubscribe list.`);
      return res.status(403).json({ 
        message: 'Manual test blocked: This email is currently in your unsubscribe list. Clear it in the Infrastructure tab to test again.' 
      });
    }

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
    }, recipient, `[MANUAL TEST]\n\n` + content, testLead.businessName);
    
    res.json({ message: 'Test email sent successfully to ' + recipient });
  } catch (err) {
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

// Update Config
router.post('/config', verifyToken, async (req, res) => {
  try {
    const allowedKeys = [
      'openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaKey', 'senderEmail', 'appPassword', 
      'senderName', 'senderTitle', 'companyName', 'websiteUrl', 'physicalAddress', 'priceTier1', 
      'priceTier2', 'priceTier3', 'valueProp', 'targetOutcome', 'personaContext', 'dailyLeadLimit', 
      'smtpHost', 'smtpPort', 'smtpSecure', 'testModeActive', 'testRecipientEmail', 'signature'
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
