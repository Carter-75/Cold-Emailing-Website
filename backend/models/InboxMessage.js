const mongoose = require('mongoose');

const InboxMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageId: { type: String, unique: true, sparse: true }, // IMAP Message-ID
  inboxEmail: { type: String, required: true }, // Which connectedInbox received this
  from: String,
  to: String,
  subject: String,
  textBody: String,
  htmlBody: String,
  isRead: { type: Boolean, default: false },
  isReply: { type: Boolean, default: false },
  isStarred: { type: Boolean, default: false },
  date: Date,
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' } // Optional link if it relates to a lead
}, { timestamps: true });

module.exports = mongoose.model('InboxMessage', InboxMessageSchema);
