const { ImapFlow } = require('imapflow');
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
      const result = await this.checkInbox(user);
      summary.usersChecked += 1;
      summary.repliesDetected += result?.repliesDetected ?? 0;
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
        // Fetch last 50 emails to check for replies
        // In a real SaaS, we would track the last UID checked
        for await (let message of client.fetch('1:*', { envelope: true })) {
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
              lead.status = 'replied';
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
