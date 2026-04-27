const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const User = require('../models/User');
const Lead = require('../models/Lead');

class IMAPService {
  async checkAllInboxes() {
    const users = await User.find({
      'config.outreachEnabled': true,
      'config.appPassword': { $exists: true, $ne: '' },
      'config.senderEmail': { $exists: true, $ne: '' },
      'config.imapHost': { $exists: true, $ne: '' },
      'config.imapPort': { $exists: true, $ne: null }
    });

    const summary = {
      usersChecked: 0,
      repliesDetected: 0
    };

    for (const user of users) {
      try {
        const result = await this.checkInbox(user);
        summary.usersChecked += 1;
        summary.repliesDetected += result?.repliesDetected ?? 0;
      } catch (err) {
        console.error(`[IMAP] Failed to check inbox for ${user.email}:`, err.message);
      }
    }

    return summary;
  }

  async checkInbox(user) {
    const client = new ImapFlow({
      host: user.config.imapHost,
      port: user.config.imapPort,
      secure: true,
      auth: {
        user: user.config.senderEmail,
        pass: user.config.appPassword
      },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      let repliesDetected = 0;
      
      try {
        const mailbox = await client.status('INBOX', { messages: true });
        const startSeq = Math.max(1, (mailbox.messages || 0) - 49);
        
        // Fetch last 50 emails to check for replies
        for await (let message of client.fetch(`${startSeq}:*`, { envelope: true, source: true })) {
          const inReplyTo = message.envelope.inReplyTo;
          if (inReplyTo) {
            // Check if this 'inReplyTo' matches any of our sent Message-IDs
            const lead = await Lead.findOne({ 
              userId: user._id, 
              messageIds: inReplyTo,
              status: { $ne: 'replied' }
            });

            if (lead) {
              console.log(`[IMAP] Reply detected from ${lead.recipientEmail}! Aborting sequence.`);
              
              // Parse message source for body
              const parsed = await simpleParser(message.source);
              const replyBody = parsed.text || parsed.html || '[No content]';
              
              lead.status = 'replied';
              lead.thread.push({
                from: message.envelope.from[0]?.address || 'Unknown',
                to: user.config.senderEmail,
                subject: message.envelope.subject,
                body: replyBody,
                timestamp: message.envelope.date || new Date()
              });
              
              await lead.save();
              repliesDetected += 1;
              
              // Update user stats
              user.stats.replies += 1;
              await user.save();
            }
          }
        }
      } finally {
        lock.release();
      }
      
      await client.logout();
      return { repliesDetected };
    } catch (err) {
      console.error(`[IMAP] Error checking inbox for ${user.email}:`, err.message);
      return { repliesDetected: 0, error: err.message };
    }
  }
}

module.exports = new IMAPService();
