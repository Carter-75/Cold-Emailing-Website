const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const User = require('../models/User');
const Lead = require('../models/Lead');
const InboxMessage = require('../models/InboxMessage');

class IMAPService {
  async checkAllInboxes() {
    const users = await User.find({
      'config.appPassword': { $exists: true, $ne: '' },
      'config.senderEmail': { $exists: true, $ne: '' },
      'config.imapHost': { $exists: true, $ne: '' },
      'config.imapPort': { $exists: true, $ne: null }
    });

    const summary = {
      usersChecked: 0,
      repliesDetected: 0,
      inboxMessagesSaved: 0
    };

    for (const user of users) {
      const userSummary = await this.syncUserInboxes(user);
      summary.repliesDetected += userSummary.repliesDetected;
      summary.inboxMessagesSaved += userSummary.inboxMessagesSaved;
      summary.usersChecked += 1;
    }

    return summary;
  }

  async syncUserInboxes(user) {
    const summary = {
      repliesDetected: 0,
      inboxMessagesSaved: 0
    };

    const inboxesToCheck = [];
    
    const getImapHost = (email, host) => {
      if (host) return host;
      const lower = (email || '').toLowerCase();
      if (lower.includes('@outlook') || lower.includes('@hotmail') || lower.includes('@live.com')) return 'outlook.office365.com';
      if (lower.includes('@yahoo')) return 'imap.mail.yahoo.com';
      return 'imap.gmail.com';
    };

    if (user.config.senderEmail && user.config.appPassword) {
      inboxesToCheck.push({
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: getImapHost(user.config.senderEmail, user.config.imapHost),
        port: user.config.imapPort || 993
      });
    }

    if (user.config.connectedInboxes && Array.isArray(user.config.connectedInboxes)) {
      for (const inbox of user.config.connectedInboxes) {
        if (inbox.email && inbox.appPassword) {
          inboxesToCheck.push({
            email: inbox.email,
            pass: inbox.appPassword,
            host: getImapHost(inbox.email, inbox.imapHost),
            port: inbox.imapPort || 993
          });
        }
      }
    }

    summary.errors = [];
    for (const inboxConfig of inboxesToCheck) {
      try {
        const result = await this.checkInbox(user, inboxConfig);
        summary.repliesDetected += result?.repliesDetected ?? 0;
        summary.inboxMessagesSaved += result?.inboxMessagesSaved ?? 0;
        if (result?.error) summary.errors.push(`${inboxConfig.email}: ${result.error}`);
      } catch (err) {
        console.error(`[IMAP] Failed to check inbox for ${inboxConfig.email}:`, err.message);
        summary.errors.push(`${inboxConfig.email}: ${err.message}`);
      }
    }
    
    // Process any pending deletes/trashes in background
    this.processPendingActions(user).catch(err => console.error('[IMAP] Background process pending failed:', err));
    
    return summary;
  }

  async processPendingActions(user) {
    // Process pending permanent deletes
    const pendingDeletes = await InboxMessage.find({ userId: user._id, syncStatus: 'pending_delete' });
    for (const msg of pendingDeletes) {
      if (msg.messageId) {
        const success = await this.deleteMessage(user, msg.inboxEmail, msg.messageId);
        if (success) {
          await InboxMessage.deleteOne({ _id: msg._id });
        }
      } else {
        await InboxMessage.deleteOne({ _id: msg._id });
      }
    }

    // Process pending move to trash
    const pendingTrashes = await InboxMessage.find({ userId: user._id, syncStatus: 'pending_trash' });
    for (const msg of pendingTrashes) {
      if (msg.messageId) {
        const success = await this.trashMessage(user, msg.inboxEmail, msg.messageId);
        if (success) {
          msg.syncStatus = 'synced';
          await msg.save();
        }
      } else {
        msg.syncStatus = 'synced';
        await msg.save();
      }
    }
  }

  async checkInbox(user, inboxConfig) {
    const client = new ImapFlow({
      host: inboxConfig.host,
      port: inboxConfig.port,
      secure: true,
      auth: {
        user: inboxConfig.email,
        pass: inboxConfig.pass
      },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      let repliesDetected = 0;
      let inboxMessagesSaved = 0;
      
      try {
        const mailbox = await client.status('INBOX', { messages: true });
        
        if (mailbox.messages > 0) {
          const startSeq = Math.max(1, mailbox.messages - 499);
          
          for await (let message of client.fetch(`${startSeq}:*`, { envelope: true, source: true, flags: true })) {
          const msgId = message.envelope.messageId;
          const inReplyTo = message.envelope.inReplyTo;
          const fromAddress = message.envelope.from[0]?.address || 'Unknown';
          const toAddress = message.envelope.to[0]?.address || inboxConfig.email;
          const subject = message.envelope.subject || 'No Subject';
          
          let isLeadReply = false;

          if (inReplyTo) {
            const lead = await Lead.findOne({ 
              userId: user._id, 
              messageIds: inReplyTo
            });

            if (lead) {
              isLeadReply = true;
              
              const isFromMe = fromAddress.toLowerCase() === inboxConfig.email.toLowerCase();
              if (!isFromMe && lead.status !== 'replied') {
                console.log(`[IMAP] Reply detected from ${lead.recipientEmail}! Aborting sequence.`);
                lead.status = 'replied';
                
                user.stats.replies += 1;
                await user.save();
                repliesDetected += 1;
              }
              
              const parsed = await simpleParser(message.source);
              const rawBody = parsed.text || parsed.html || '[No content]';
              
              const EmailService = require('./email.service');
              const replyBody = await EmailService.cleanMessageWithAI(rawBody, user.config);
              
              const alreadyExists = lead.thread.some(t => Math.abs(t.timestamp - (message.envelope.date || new Date())) < 5000);
              
              if (!alreadyExists) {
                lead.thread.push({
                  from: fromAddress,
                  to: toAddress,
                  subject: subject,
                  body: replyBody,
                  timestamp: message.envelope.date || new Date()
                });
                await lead.save();
              }
            }
          }

          // Always save to Universal Inbox regardless of Lead Reply status
          if (msgId) {
            const existingMsg = await InboxMessage.findOne({ messageId: msgId, userId: user._id });
            if (existingMsg) {
              let currentIsRead = message.flags?.has('\\Seen') || false;
              let currentIsTrashed = message.flags?.has('\\Deleted') || false;
              let needsSave = false;

              if (existingMsg.isRead !== currentIsRead) {
                existingMsg.isRead = currentIsRead;
                needsSave = true;
              }
              if (existingMsg.isTrashed !== currentIsTrashed) {
                existingMsg.isTrashed = currentIsTrashed;
                needsSave = true;
              }
              if (needsSave) {
                await existingMsg.save();
              }
            } else {
              const parsed = await simpleParser(message.source);
              const textBody = parsed.text || '';
              const htmlBody = parsed.html || '';

              let isWarmUp = false;
              let isRead = message.flags?.has('\\Seen') || false;
              
              const warmUpRegex = /Phone[_ ]?N0:\s*\d{3}-\d{3}-\d{3}\s*$/i;
              const textToCheck = textBody ? textBody.trim() : htmlBody.replace(/<[^>]*>?/gm, '').trim();
              
              if (warmUpRegex.test(textToCheck)) {
                isWarmUp = true;
                isRead = true;
                try {
                  await client.messageFlagsAdd(message.seq, ['\\Seen']);
                } catch (err) {
                  console.error('[IMAP] Failed to mark warm up as seen:', err);
                }
              }

              const newMsg = new InboxMessage({
                userId: user._id,
                messageId: msgId,
                inboxEmail: inboxConfig.email,
                from: fromAddress,
                to: toAddress,
                subject: subject,
                textBody: textBody,
                htmlBody: htmlBody,
                isRead: isRead,
                isWarmUp: isWarmUp,
                isReply: isLeadReply,
                date: message.envelope.date || new Date()
              });
              await newMsg.save();
              inboxMessagesSaved += 1;
            }
          }
        }
        }
      } finally {
        lock.release();
      }
      
      await client.logout();
      return { repliesDetected, inboxMessagesSaved };
    } catch (err) {
      console.error(`[IMAP] Error checking inbox ${inboxConfig.email}:`, err);
      return { repliesDetected: 0, inboxMessagesSaved: 0, error: err.response || err.message };
    }
  }

  async markAsRead(user, inboxEmail, messageId) {
    let inboxConfig = null;
    if (user.config.senderEmail === inboxEmail) {
      inboxConfig = {
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: user.config.imapHost,
        port: user.config.imapPort
      };
    } else if (user.config.connectedInboxes) {
      const secondary = user.config.connectedInboxes.find(i => i.email === inboxEmail);
      if (secondary) {
        inboxConfig = {
          email: secondary.email,
          pass: secondary.appPassword,
          host: secondary.imapHost,
          port: secondary.imapPort
        };
      }
    }

    if (!inboxConfig) return false;

    const client = new ImapFlow({
      host: inboxConfig.host,
      port: inboxConfig.port,
      secure: true,
      auth: { user: inboxConfig.email, pass: inboxConfig.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        // messageFlagsAdd requires uid or sequence, but if we search by Header Message-ID we can find the sequence
        // Alternative: we search for the message
        let seq = await client.search({ header: { 'Message-ID': messageId } });
        if (seq && seq.length > 0) {
          await client.messageFlagsAdd(seq, ['\\Seen']);
        }
      } finally {
        lock.release();
      }
      await client.logout();
      return true;
    } catch (err) {
      console.error('[IMAP] Mark as read failed:', err);
      return false;
    }
  }

  async deleteMessage(user, inboxEmail, messageId) {
    let inboxConfig = null;
    if (user.config.senderEmail === inboxEmail) {
      inboxConfig = {
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: user.config.imapHost,
        port: user.config.imapPort
      };
    } else if (user.config.connectedInboxes) {
      const secondary = user.config.connectedInboxes.find(i => i.email === inboxEmail);
      if (secondary) {
        inboxConfig = {
          email: secondary.email,
          pass: secondary.appPassword,
          host: secondary.imapHost,
          port: secondary.imapPort
        };
      }
    }

    if (!inboxConfig) return false;

    const client = new ImapFlow({
      host: inboxConfig.host,
      port: inboxConfig.port,
      secure: true,
      auth: { user: inboxConfig.email, pass: inboxConfig.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        let seq = await client.search({ header: { 'Message-ID': messageId } });
        if (seq && seq.length > 0) {
          await client.messageFlagsAdd(seq, ['\\Deleted']);
        }
      } finally {
        lock.release(); // IMAP expunge happens implicitly on close or explicitly
      }
      await client.logout();
      return true;
    } catch (err) {
      console.error('[IMAP] Delete failed:', err);
      return false;
    }
  }

  async trashMessage(user, inboxEmail, messageId) {
    let inboxConfig = null;
    if (user.config.senderEmail === inboxEmail) {
      inboxConfig = {
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: user.config.imapHost,
        port: user.config.imapPort
      };
    } else if (user.config.connectedInboxes) {
      const secondary = user.config.connectedInboxes.find(i => i.email === inboxEmail);
      if (secondary) {
        inboxConfig = {
          email: secondary.email,
          pass: secondary.appPassword,
          host: secondary.imapHost,
          port: secondary.imapPort
        };
      }
    }

    if (!inboxConfig) return false;

    const client = new ImapFlow({
      host: inboxConfig.host,
      port: inboxConfig.port,
      secure: true,
      auth: { user: inboxConfig.email, pass: inboxConfig.pass },
      logger: false
    });

    try {
      await client.connect();
      
      // Try to find the trash mailbox path
      let trashPath = 'Trash';
      try {
        const mailboxes = await client.list();
        const trashBox = mailboxes.find(m => m.specialUse === '\\Trash' || m.path.toLowerCase().includes('trash'));
        if (trashBox) trashPath = trashBox.path;
      } catch(e) {}

      let lock = await client.getMailboxLock('INBOX');
      try {
        let seq = await client.search({ header: { 'Message-ID': messageId } });
        if (seq && seq.length > 0) {
          try {
            await client.messageMove(seq, trashPath);
          } catch (moveErr) {
            // Fallback if move fails
            await client.messageFlagsAdd(seq, ['\\Deleted']);
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      return true;
    } catch (err) {
      console.error('[IMAP] Trash failed:', err);
      return false;
    }
  }

  async starMessage(user, inboxEmail, messageId, isStarred) {
    let inboxConfig = null;
    if (user.config.senderEmail === inboxEmail) {
      inboxConfig = {
        email: user.config.senderEmail,
        pass: user.config.appPassword,
        host: user.config.imapHost,
        port: user.config.imapPort
      };
    } else if (user.config.connectedInboxes) {
      const secondary = user.config.connectedInboxes.find(i => i.email === inboxEmail);
      if (secondary) {
        inboxConfig = {
          email: secondary.email,
          pass: secondary.appPassword,
          host: secondary.imapHost,
          port: secondary.imapPort
        };
      }
    }

    if (!inboxConfig) return false;

    const client = new ImapFlow({
      host: inboxConfig.host,
      port: inboxConfig.port,
      secure: true,
      auth: { user: inboxConfig.email, pass: inboxConfig.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        let seq = await client.search({ header: { 'Message-ID': messageId } });
        if (seq && seq.length > 0) {
          if (isStarred) {
            await client.messageFlagsAdd(seq, ['\\Flagged']);
          } else {
            await client.messageFlagsRemove(seq, ['\\Flagged']);
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      return true;
    } catch (err) {
      console.error('[IMAP] Star failed:', err);
      return false;
    }
  }
}

module.exports = new IMAPService();
