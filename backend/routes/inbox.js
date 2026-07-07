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

const { verifyToken } = require('../middleware/auth');

// Middleware to ensure authentication
router.use(verifyToken);

// Get inbox stats
router.get('/stats', async (req, res) => {
  try {
    const messages = await InboxMessage.find({ 
      userId: req.user._id,
      isTrashed: false,
      isWarmUp: false,
      syncStatus: { $ne: 'pending_delete' }
    });
    
    const stats = { all: { total: 0, unread: 0 } };
    
    for (const m of messages) {
      if (!stats[m.inboxEmail]) stats[m.inboxEmail] = { total: 0, unread: 0 };
      
      stats.all.total++;
      stats[m.inboxEmail].total++;
      
      if (!m.isRead) {
        stats.all.unread++;
        stats[m.inboxEmail].unread++;
      }
    }
    
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch inbox stats' });
  }
});

// Get all inbox messages (Paginated)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const { search, viewMode, account, repliesOnly } = req.query;

    const query = { userId: req.user._id };

    // Account filtering
    if (account && account !== 'all') {
      query.inboxEmail = account;
    }

    // ViewMode filtering
    if (viewMode === 'trash') {
      query.isTrashed = true;
      query.syncStatus = { $ne: 'pending_delete' };
    } else if (viewMode === 'warm-up') {
      query.isWarmUp = true;
      query.isTrashed = false;
      query.syncStatus = { $ne: 'pending_delete' };
    } else {
      // Default 'inbox' view
      query.isTrashed = false;
      query.isWarmUp = false; // Hide warm-ups from main inbox
      query.syncStatus = { $ne: 'pending_delete' };
    }

    // Replies only
    if (repliesOnly === 'true') {
      query.isReply = true;
    }

    // Search filtering
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { subject: searchRegex },
        { from: searchRegex },
        { to: searchRegex },
        { textBody: searchRegex }
      ];
    }

    const messages = await InboxMessage.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await InboxMessage.countDocuments(query);

    res.json({
      items: messages,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch inbox messages' });
  }
});

// Get connected emails
router.get('/connected-emails', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.json({ primary: null, emails: [] });
    
    const emails = [];
    if (user.config?.senderEmail) emails.push(user.config.senderEmail);
    if (user.config?.connectedInboxes && Array.isArray(user.config.connectedInboxes)) {
      emails.push(...user.config.connectedInboxes.map(i => i.email).filter(e => e));
    }
    const uniqueEmails = [...new Set(emails)];
    res.json({
      primary: user.config?.senderEmail || null,
      emails: uniqueEmails
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch connected emails' });
  }
});

// Get Unsubscribed Leads (Paginated)
router.get('/unsubbed', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const Unsubscribe = require('../models/Unsubscribe');
    const unsubList = await Unsubscribe.find({ userId: req.user._id });
    const unsubEmails = unsubList.map(u => u.recipientEmail);
    
    const query = { userId: req.user._id, recipientEmail: { $in: unsubEmails } };
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { businessName: searchRegex },
        { recipientEmail: searchRegex },
        { email: searchRegex }
      ];
    }

    const unsubbedLeads = await Lead.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await Lead.countDocuments(query);

    res.json({
      items: unsubbedLeads,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch unsubscribed leads' });
  }
});

// Get Pending Leads (Paginated)
router.get('/pending', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const Unsubscribe = require('../models/Unsubscribe');
    const unsubList = await Unsubscribe.find({ userId: req.user._id });
    const unsubEmails = unsubList.map(u => u.recipientEmail);

    const query = { 
      userId: req.user._id, 
      status: { $in: ['discovery', 'verifying', 'ready'] },
      recipientEmail: { $nin: unsubEmails }
    };
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { businessName: searchRegex },
        { recipientEmail: searchRegex },
        { email: searchRegex }
      ];
    }

    const pendingLeads = await Lead.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await Lead.countDocuments(query);

    res.json({
      items: pendingLeads,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch pending leads' });
  }
});

// Get Contacted Leads (Paginated)
router.get('/contacted', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search } = req.query;

    const Unsubscribe = require('../models/Unsubscribe');
    const unsubList = await Unsubscribe.find({ userId: req.user._id });
    const unsubEmails = unsubList.map(u => u.recipientEmail);

    const query = { 
      userId: req.user._id, 
      status: { $in: ['emailed', 'replied', 'finished'] },
      recipientEmail: { $nin: unsubEmails }
    };
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { businessName: searchRegex },
        { recipientEmail: searchRegex },
        { email: searchRegex }
      ];
    }

    const contactedLeads = await Lead.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await Lead.countDocuments(query);

    res.json({
      items: contactedLeads,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch contacted leads' });
  }
});

// Drafts Endpoints (Paginated)
router.get('/drafts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const { search, account } = req.query;
    
    const query = { userId: req.user._id };
    
    if (account && account !== 'all') {
      query.inboxEmail = account;
    }
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { subject: searchRegex },
        { to: searchRegex },
        { textBody: searchRegex }
      ];
    }

    const drafts = await InboxDraft.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await InboxDraft.countDocuments(query);
    
    res.json({
      items: drafts,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch drafts' });
  }
});

router.post('/drafts', async (req, res) => {
  try {
    const { inboxEmail, to, subject, textBody, replyToMessageId } = req.body;
    
    const draft = new InboxDraft({ userId: req.user._id });
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
    res.status(500).json({ message: 'Failed to create draft' });
  }
});

router.put('/drafts/:id', async (req, res) => {
  try {
    const { inboxEmail, to, subject, textBody, replyToMessageId } = req.body;
    
    let draft = await InboxDraft.findOne({ _id: req.params.id, userId: req.user._id });
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    
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
    res.status(500).json({ message: 'Failed to update draft' });
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

// Update Message Fields (Read/Star)
router.patch('/:id', async (req, res) => {
  try {
    const { isRead, isStarred } = req.body;
    const message = await InboxMessage.findById(req.params.id);
    if (!message || message.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    const user = await User.findById(req.user._id);

    if (isRead !== undefined) {
      message.isRead = isRead;
      await IMAPService.markAsRead(user, message.inboxEmail, message.messageId);
    }

    if (isStarred !== undefined) {
      message.isStarred = isStarred;
      await IMAPService.starMessage(user, message.inboxEmail, message.messageId, isStarred);
    }
    
    await message.save();
    res.json({ success: true, message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating message' });
  }
});

// Reply
router.post('/:id/replies', async (req, res) => {
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
router.delete('/:id/replies/:sendId', async (req, res) => {
  const { sendId } = req.params;
  if (global.pendingSends && global.pendingSends[sendId]) {
    clearTimeout(global.pendingSends[sendId]);
    delete global.pendingSends[sendId];
    return res.json({ success: true, message: 'Reply cancelled' });
  }
  res.status(404).json({ message: 'Pending send not found or already sent' });
});



// Move to Trash
router.post('/batch-delete', async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    // Instantly mark as trashed locally and set pending sync status
    await InboxMessage.updateMany(
      { _id: { $in: messageIds }, userId: req.user._id }, 
      { $set: { isTrashed: true, syncStatus: 'pending_trash' } }
    );

    // Return immediately to frontend
    res.json({ success: true, trashedCount: messageIds.length, message: 'Processing in background' });

    // Process IMAP deletions asynchronously
    const user = await User.findById(req.user._id);
    IMAPService.processPendingActions(user).catch(err => {
      console.error('[IMAP] Background process pending failed:', err);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error moving to trash' });
  }
});

// Permanent Delete
router.post('/batch-permanent-delete', async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    // Instantly mark as pending permanent delete
    await InboxMessage.updateMany(
      { _id: { $in: messageIds }, userId: req.user._id }, 
      { $set: { syncStatus: 'pending_delete' } }
    );

    // Return immediately to frontend
    res.json({ success: true, deletedCount: messageIds.length, message: 'Processing in background' });

    // Process IMAP deletions asynchronously
    const user = await User.findById(req.user._id);
    IMAPService.processPendingActions(user).catch(err => {
      console.error('[IMAP] Background process pending failed:', err);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error permanently deleting messages' });
  }
});

// Compose New Email
router.post('/messages', async (req, res) => {
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
