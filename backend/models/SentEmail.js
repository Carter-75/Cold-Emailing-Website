const mongoose = require('mongoose');

const SentEmailSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientEmail: { type: String, required: true },
  businessName: String,
  city: String,
  sentAt: { type: Date, default: Date.now },
  status: { type: String, default: 'sent' }
});

// Ensure we don't send to the same email multiple times for a specific user
SentEmailSchema.index({ userId: 1, recipientEmail: 1 }, { unique: true });

module.exports = mongoose.model('SentEmail', SentEmailSchema);
