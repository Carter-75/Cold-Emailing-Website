const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Unsubscribe = require('../models/Unsubscribe');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.json({ status: 'online', message: 'Cold Emailing API root' });
});



// Update Config
router.post('/config', verifyToken, async (req, res) => {
  try {
    const allowedKeys = [
      'openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaUsername', 'verifaliaPassword',
      'senderEmail', 'appPassword', 'senderName', 'senderTitle', 'companyName', 'websiteUrl',
      'physicalAddress', 'priceTier1', 'priceTier2', 'priceTier3', 'valueProp', 'targetOutcome',
      'personaContext', 'dailyLeadLimit', 'smtpHost', 'smtpPort', 'smtpSecure',
      'imapHost', 'imapPort',
      'testRecipientEmail', 'signature',
      'timezone', 'outreachPaused', 'outreachPausedReason', 'outreachEnabled', 'engineTestMode', 'connectedInboxes'
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
    const wasTestMode = user.config?.engineTestMode === true;

    // Explicitly update config fields
    Object.keys(safeBody).forEach(key => {
      user.config[key] = safeBody[key];
    });

    await user.save();

    // Reset test leads if engineTestMode is turned OFF
    if (wasTestMode && user.config.engineTestMode === false) {
      const Lead = require('../models/Lead');
      await Lead.updateMany(
        { userId: user._id, status: 'test_emailed' },
        { $set: { status: 'discovery', thread: [], messageIds: [], sequenceStep: 0 }, $unset: { lastEmailedAt: "", nextEmailAt: "" } }
      );
    }

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
