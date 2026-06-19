const mongoose = require('mongoose');

const InboxDraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inboxEmail: { type: String, required: true },
  to: { type: String },
  subject: { type: String },
  textBody: { type: String },
  htmlBody: { type: String },
  replyToMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'InboxMessage' }
}, { timestamps: true });

module.exports = mongoose.model('InboxDraft', InboxDraftSchema);
