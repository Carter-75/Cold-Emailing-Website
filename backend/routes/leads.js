const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Unsubscribe = require('../models/Unsubscribe');
const Lead = require('../models/Lead');
const { verifyToken } = require('../middleware/auth');
const EmailService = require('../services/email.service');
const { catchAsync } = require('../middleware/error');

router.get('/', verifyToken, catchAsync(async (req, res) => {
  // ── Query 1: Engine leads (this user's automated outreach) ──────────────
  const engineLeads = await Lead.find({ userId: req.user._id })
    .sort({ updatedAt: -1 });

  const unsubList = await Unsubscribe.find({ userId: req.user._id });
  const unsubEmails = new Set(unsubList.map(u => u.recipientEmail.toLowerCase()));
  
  const user = await User.findById(req.user._id);
  const defaultEngineEmail = user?.config?.senderEmail || 'unknown@engine.com';

  const engineLeadsFormatted = engineLeads.map(l => {
    const raw = l.toObject ? l.toObject() : l;
    return {
      ...raw,
      isUnsubscribed: unsubEmails.has(l.recipientEmail.toLowerCase()),
      source: 'engine',
      sourceEmail: raw.sourceEmail || defaultEngineEmail
    };
  });

  res.json(engineLeadsFormatted);
}));

router.post('/:id/replies', verifyToken, catchAsync(async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ message: 'Reply content is required.' });

  let lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });

  const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const recipientEmail = lead.recipientEmail || lead.email;
  const isUnsubscribed = await Unsubscribe.findOne({ userId: user._id, recipientEmail: recipientEmail.toLowerCase() });
  if (isUnsubscribed) {
    return res.status(403).json({ message: 'Cannot send manual reply: Lead is on the suppression (unsubscribe) list.' });
  }

  const sendConfig = user.config?.toObject ? user.config.toObject() : user.config;

  const emailResult = await EmailService.sendEmail({
    ...sendConfig,
    userId: user._id,
    displayName: user.displayName || user.config.senderName
  }, recipientEmail, body, lead.businessName, false, true);

  if (!lead.thread) lead.thread = [];
  lead.thread.push({
    from: user.config.senderEmail,
    to: recipientEmail,
    subject: emailResult.subject,
    body: body,
    timestamp: new Date()
  });

  if (!lead.messageIds) lead.messageIds = [];
  lead.messageIds.push(emailResult.messageId);

  if (lead.status === 'discovery' || lead.status === 'pending') {
    lead.status = 'emailed';
  }

  await lead.save();
  res.status(201).json({ message: 'Reply sent successfully', lead });
}));

router.post('/:id/reply-refinements', verifyToken, catchAsync(async (req, res) => {
  const { draft } = req.body;
  if (!draft) return res.status(400).json({ message: 'Draft is required for refinement.' });

  let lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });

  const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const refinedText = await EmailService.refineReply(lead, user.config, draft);
  res.status(201).json({ refinedText });
}));

router.post('/:id/thread-cleanups', verifyToken, catchAsync(async (req, res) => {
  let lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });

  const user = req.user.isShadow ? req.user : await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

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

  res.status(201).json({ message: 'Thread cleaned successfully', lead });
}));

module.exports = router;
