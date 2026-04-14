const mongoose = require('mongoose');

const UnsubscribeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientEmail: { type: String, required: true },
  businessName: { type: String }, // Optional: allowing business-level suppression
  unsubscribedAt: { type: Date, default: Date.now }
});

// Unique index to prevent duplicate entries
UnsubscribeSchema.index({ userId: 1, recipientEmail: 1 }, { unique: true });

module.exports = mongoose.model('Unsubscribe', UnsubscribeSchema);
