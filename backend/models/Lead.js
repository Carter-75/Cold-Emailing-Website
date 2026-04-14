const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessName: { type: String, required: true },
  recipientEmail: { type: String, required: true },
  city: String,
  category: String,
  
  // Interaction State
  status: { 
    type: String, 
    enum: ['discovery', 'emailed', 'replied', 'finished'], 
    default: 'discovery' 
  },
  sequenceStep: { type: Number, default: 0 },
  lastEmailedAt: Date,
  nextEmailAt: Date,
  variant: { type: String, enum: ['A', 'B'], default: () => Math.random() > 0.5 ? 'A' : 'B' },
  
  // Tracking
  messageIds: [String], // Store Message-IDs for reply detection
  stats: {
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 }
  },
  isTestData: { type: Boolean, default: false }
}, { timestamps: true });

// Ensure unique outreach per user per email
LeadSchema.index({ userId: 1, recipientEmail: 1 }, { unique: true });

module.exports = mongoose.model('Lead', LeadSchema);
