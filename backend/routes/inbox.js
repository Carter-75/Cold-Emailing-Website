const express = require('express');
const router = express.Router();
const InboxMessage = require('../models/InboxMessage');
const InboxDraft = require('../models/InboxDraft');
const Lead = require('../models/Lead');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const IMAPService = require('../services/imap.service');

// Global store for delayed sends
if (!global.pendingSends) global.pendingSends = {};

// Middleware to ensure authentication
router.use((req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  next();
});

// Get all inbox messages
router.get('/', async (req, res) => {
  try {
    const messages = await InboxMessage.find({ userId: req.user._id }).sort({ date: -1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch inbox messages' });
  }
});

// Get connected emails
router.get('/connected-emails', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const emails = [];
    if (user.config.senderEmail) emails.push(user.config.senderEmail);
    if (user.config.connectedInboxes && Array.isArray(user.config.connectedInboxes)) {
      emails.push(...user.config.connectedInboxes.map(i => i.email).filter(e => e));
    }
    const uniqueEmails = [...new Set(emails)];
    res.json({
      primary: user.config.senderEmail || null,
      emails: uniqueEmails
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch connected emails' });
  }
});

// Get Unsubscribed Leads (formatted as basic info for inbox view)
router.get('/unsubbed', async (req, res) => {
  try {
    const unsubbedLeads = await Lead.find({ userId: req.user._id, isUnsubscribed: true }).sort({ updatedAt: -1 });
    res.json(unsubbedLeads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch unsubscribed leads' });
  }
});

// Get Pending Leads (not yet emailed)
router.get('/pending', async (req, res) => {
  try {
    const pendingLeads = await Lead.find({ 
      userId: req.user._id, 
      status: { $in: ['discovery', 'verifying', 'ready'] },
      isUnsubscribed: { $ne: true }
    }).sort({ updatedAt: -1 });
    res.json(pendingLeads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch pending leads' });
  }
});

// Get Contacted Leads
router.get('/contacted', async (req, res) => {
  try {
    const contactedLeads = await Lead.find({ 
      userId: req.user._id, 
      status: { $in: ['emailed', 'replied', 'finished'] },
      isUnsubscribed: { $ne: true }
    }).sort({ updatedAt: -1 });
    res.json(contactedLeads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch contacted leads' });
  }
});

// Drafts Endpoints
router.get('/drafts', async (req, res) => {
  try {
    const drafts = await InboxDraft.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.json(drafts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch drafts' });
  }
});

router.post('/drafts', async (req, res) => {
  try {
    const { draftId, inboxEmail, to, subject, textBody, replyToMessageId } = req.body;
    let draft;
    if (draftId) {
      draft = await InboxDraft.findOne({ _id: draftId, userId: req.user._id });
    }
    if (!draft) {
      draft = new InboxDraft({ userId: req.user._id });
    }
    draft.inboxEmail = inboxEmail;
    draft.to = to;
    draft.subject = subject;
    draft.textBody = textBody;
    draft.htmlBody = textBody ? textBody.replace(/\n/g, '<br>') : '';
    draft.replyToMessageId = replyToMessageId || null;

    await draft.save();
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save draft' });
  }
});

router.delete('/drafts/:id', async (req, res) => {
  try {
    await InboxDraft.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete draft' });
  }
});

// Manual IMAP Sync
router.post('/sync', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const summary = await IMAPService.syncUserInboxes(user);
    res.json({ success: true, summary });
  } catch (err) {
    console.error('[Sync] Error:', err);
    res.status(500).json({ message: 'Failed to sync emails' });
  }
});

// Mark as read
router.post('/:id/read', async (req, res) => {
  try {
    const message = await InboxMessage.findById(req.params.id);
    if (!message || message.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Update local DB
    message.isRead = true;
    await message.save();
    
    // Sync to IMAP
    const user = await User.findById(req.user._id);
    await IMAPService.markAsRead(user, message.inboxEmail, message.messageId);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error marking read' });
  }
});

// Reply
router.post('/:id/reply', async (req, res) => {
  try {
    const msg = await InboxMessage.findById(req.params.id);
    if (!msg || msg.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    const user = await User.findById(req.user._id);
    
    // Find the correct SMTP config
    let config = null;
    if (user.config.senderEmail === msg.inboxEmail) {
      config = {
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: user.config.smtpHost,
        port: user.config.smtpPort
      };
    } else if (user.config.connectedInboxes) {
      const secondary = user.config.connectedInboxes.find(i => i.email === msg.inboxEmail);
      if (secondary) {
        config = {
          email: secondary.email,
          pass: secondary.appPassword,
          host: secondary.smtpHost,
          port: secondary.smtpPort
        };
      }
    }
    
    if (!config) return res.status(400).json({ message: 'SMTP config not found for this inbox' });
    
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 465,
      secure: config.port === 465,
      auth: { user: config.email, pass: config.pass }
    });

    const { textBody } = req.body;
    const htmlBody = textBody.replace(/\n/g, '<br>');

    const mailOptions = {
      from: `"${user.config.displayName || user.config.senderName || 'Me'}" <${config.email}>`,
      to: msg.from,
      subject: msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`,
      text: textBody,
      html: htmlBody,
      inReplyTo: msg.messageId,
      references: [msg.messageId]
    };

    // Store in global memory and execute after 30 seconds
    const sendId = msg._id.toString() + '-' + Date.now();
    
    global.pendingSends[sendId] = setTimeout(async () => {
      try {
        await transporter.sendMail(mailOptions);
        
        // Optionally save the sent message in DB
        const replyMsg = new InboxMessage({
          userId: req.user._id,
          inboxEmail: msg.inboxEmail,
          messageId: `reply-${Date.now()}@coldauto.pro`,
          from: config.email,
          to: msg.from,
          subject: mailOptions.subject,
          textBody: textBody,
          htmlBody: htmlBody,
          date: new Date(),
          isRead: true,
          isReply: true
        });
        await replyMsg.save();
      } catch (err) {
        console.error('Delayed send failed:', err);
      } finally {
        delete global.pendingSends[sendId];
      }
    }, 30000);

    res.json({ success: true, message: 'Reply queued for 30s delay', sendId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error queueing reply' });
  }
});

// Cancel Reply
router.post('/:id/cancel-reply', async (req, res) => {
  const { sendId } = req.body;
  if (global.pendingSends && global.pendingSends[sendId]) {
    clearTimeout(global.pendingSends[sendId]);
    delete global.pendingSends[sendId];
    return res.json({ success: true, message: 'Reply cancelled' });
  }
  res.status(404).json({ message: 'Pending send not found or already sent' });
});

// Toggle Star
router.post('/:id/star', async (req, res) => {
  try {
    const msg = await InboxMessage.findOne({ _id: req.params.id, userId: req.user._id });
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    
    const newStatus = !msg.isStarred;
    msg.isStarred = newStatus;
    await msg.save();
    
    const user = await User.findById(req.user._id);
    await IMAPService.starMessage(user, msg.inboxEmail, msg.messageId, newStatus);
    
    res.json({ success: true, isStarred: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error starring message' });
  }
});

// Move to Trash
router.post('/delete', async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const messages = await InboxMessage.find({ _id: { $in: messageIds }, userId: req.user._id });
    const user = await User.findById(req.user._id);

    // Move to Trash in IMAP
    for (const msg of messages) {
      if (msg.messageId) {
        await IMAPService.trashMessage(user, msg.inboxEmail, msg.messageId);
      }
    }

    // Mark as trashed locally
    await InboxMessage.updateMany({ _id: { $in: messageIds }, userId: req.user._id }, { $set: { isTrashed: true } });

    res.json({ success: true, trashedCount: messages.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error moving to trash' });
  }
});

// Permanent Delete
router.post('/permanent-delete', async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const messages = await InboxMessage.find({ _id: { $in: messageIds }, userId: req.user._id });
    const user = await User.findById(req.user._id);

    // Sync deletion to IMAP
    for (const msg of messages) {
      if (msg.messageId) {
        await IMAPService.deleteMessage(user, msg.inboxEmail, msg.messageId);
      }
    }

    // Delete locally
    await InboxMessage.deleteMany({ _id: { $in: messageIds }, userId: req.user._id });

    res.json({ success: true, deletedCount: messages.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error permanently deleting messages' });
  }
});

// Compose New Email
router.post('/compose', async (req, res) => {
  try {
    const { fromEmail, to, subject, textBody } = req.body;
    if (!fromEmail || !to || !subject || !textBody) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const user = await User.findById(req.user._id);
    let config = null;
    if (user.config.senderEmail === fromEmail) {
      config = {
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: user.config.smtpHost,
        port: user.config.smtpPort
      };
    } else if (user.config.connectedInboxes) {
      const secondary = user.config.connectedInboxes.find(i => i.email === fromEmail);
      if (secondary) {
        config = {
          email: secondary.email,
          pass: secondary.appPassword,
          host: secondary.smtpHost,
          port: secondary.smtpPort
        };
      }
    }

    if (!config) return res.status(400).json({ message: 'Invalid from email' });

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.email, pass: config.pass }
    });

    const htmlBody = textBody.replace(/\n/g, '<br>');
    const mailOptions = {
      from: `"${user.config.displayName || user.config.senderName || 'Me'}" <${config.email}>`,
      to,
      subject,
      text: textBody,
      html: htmlBody
    };

    const sendId = 'compose-' + Date.now();
    global.pendingSends[sendId] = setTimeout(async () => {
      try {
        await transporter.sendMail(mailOptions);
        
        const newMsg = new InboxMessage({
          userId: req.user._id,
          inboxEmail: config.email,
          messageId: `sent-${Date.now()}@coldauto.pro`,
          from: config.email,
          to,
          subject,
          textBody,
          htmlBody,
          date: new Date(),
          isRead: true,
          isReply: true,
          isTrashed: false
        });
        await newMsg.save();
      } catch (err) {
        console.error('Delayed compose failed:', err);
      } finally {
        delete global.pendingSends[sendId];
      }
    }, 30000);

    res.json({ success: true, message: 'Message queued for 30s delay', sendId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error queueing message' });
  }
});

// AI Draft Endpoint
router.post('/ai-draft', async (req, res) => {
  try {
    const { intent, threadContext } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user.config.openaiKey) {
      return res.status(400).json({ message: 'OpenAI Key not configured' });
    }

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: user.config.openaiKey });

    const prompt = `You are an elite, top-tier professional email assistant.
Your goal is to translate the user's raw intent into a highly professional, well-structured email.

CRITICAL RULES:
1. NO MARKDOWN. NEVER use '#' or '*' or '**' anywhere. 
2. FORMATTING: You must output HTML. Use HTML tags for formatting (e.g., <b>bold</b>, <i>italic</i>, <u>underline</u>, <br> for line breaks, <p> for paragraphs, <ul><li> for lists). Use these tools effectively to make the email scannable and clean.
3. CONTEXT MATCHING: Analyze the thread context to mimic the user's previous sent emails in tone, while maintaining peak professionalism.
4. AGGRESSIVE INTENT TRANSLATION: If the user's intent is aggressive, rude, or unprofessional (e.g., "fuck off", "I hate you"), you MUST translate it into a firm, polite, and completely professional boundary or decline. However, you MUST also provide a "warning" to the user.

OUTPUT FORMAT:
You must return a valid JSON object exactly like this:
{
  "draft": "<p>Dear Name,</p><p>Body...</p>",
  "warning": "Provide a warning if the original intent was highly aggressive/rude, or leave as empty string."
}

Context of the thread:
${threadContext || 'This is a brand new email.'}

User's Intent/Instructions:
${intent}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const aiOutput = JSON.parse(response.choices[0].message.content.trim());
    res.json(aiOutput);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate AI draft' });
  }
});

module.exports = router;
