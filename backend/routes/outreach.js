const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Unsubscribe = require('../models/Unsubscribe');
const Lead = require('../models/Lead');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const OutreachEngine = require('../services/engine.service');
const SequenceService = require('../services/sequence.service');
const IMAPService = require('../services/imap.service');
const { catchAsync } = require('../middleware/error');

// Outreach Controls
router.patch('/status', verifyToken, catchAsync(async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: 'Status is required' });

  if (status === 'running') {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.config.outreachEnabled = true;
    await user.save();
    res.json({ message: 'Automation enabled' });
  } else if (status === 'stopped') {
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
  } else {
    res.status(400).json({ message: 'Invalid status value' });
  }
}));

router.post('/test-messages', verifyToken, catchAsync(async (req, res) => {
  const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const recipient = user.config?.testRecipientEmail || user.config?.senderEmail;
  if (!recipient) return res.status(400).json({ message: 'No test recipient email configured.' });

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
    testLead = await Lead.create({
      userId: user._id,
      businessName: 'TEST - ' + (user.config?.companyName || 'Lead'),
      recipientEmail: recipient,
      city: 'Test City',
      status: 'emailed', // Start at emailed for Step 1
      sequenceStep: 1,   
      isTestData: true
    });
  } else {
    if (testLead.recipientEmail !== recipient) {
      testLead.recipientEmail = recipient;
      testLead.status = 'emailed';
      testLead.sequenceStep = 1;
      await testLead.save();
    }
  }

  // 4. Mimic Suppression Logic
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
  testLead.userId = user;
  const result = await SequenceService.processLead(testLead, true); // forceSend = true

  if (result === 'finished') {
    return res.json({ message: 'Test email sent! Sequence is now complete for this lead.' });
  } else if (result === 'processed') {
    return res.json({ message: 'Test email sent successfully! Mimicking Step ' + testLead.sequenceStep });
  } else {
    return res.status(500).json({ message: 'Engine failed to process test lead.' });
  }
}));

// Unsubscribe Management
router.get('/unsubscribes', verifyToken, catchAsync(async (req, res) => {
  const suppressionList = await Unsubscribe.find({ userId: req.user._id });
  const finishedLeads = await Lead.find({ userId: req.user._id, status: 'finished' });

  const formattedFinished = finishedLeads.map(l => ({
    recipientEmail: l.recipientEmail,
    businessName: l.businessName,
    unsubscribedAt: l.updatedAt,
    isAutoFinished: true
  }));

  const combined = [
    ...suppressionList.map(u => ({ ...u.toObject ? u.toObject() : u, isLinkUnsub: true })),
    ...formattedFinished
  ];

  combined.sort((a, b) => new Date(b.unsubscribedAt).getTime() - new Date(a.unsubscribedAt).getTime());

  res.json(combined);
}));

router.get('/unsubscribes/status', verifyToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  const recipient = user.config?.testRecipientEmail || user.config?.senderEmail || '';
  const unsub = await Unsubscribe.findOne({ userId: user._id, recipientEmail: recipient });
  res.json({ isUnsubscribed: !!unsub, email: recipient });
}));

router.delete('/unsubscribes', verifyToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  const recipient = user.config?.testRecipientEmail || user.config?.senderEmail;

  await Unsubscribe.deleteOne({ userId: user._id, recipientEmail: recipient });
  await Lead.deleteMany({ userId: user._id, recipientEmail: recipient });

  res.json({ message: 'All test data cleared for ' + recipient + '. You can now re-test from scratch.' });
}));

router.post('/syncs', verifyToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const result = await IMAPService.checkInbox(user);

  res.json({
    message: `Inbox synced. Detected ${result.repliesDetected} new replies.`,
    result
  });
}));

module.exports = router;
