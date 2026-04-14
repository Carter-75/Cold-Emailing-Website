const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  step: { type: Number, required: true }, // 1, 2, or 3
  variant: { type: String, enum: ['A', 'B'], required: true },
  subject: String,
  body: String,
  
  // Performance Stats
  stats: {
    sentCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 }
  },
  
  lastOptimizedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure unique variant per step per user
TemplateSchema.index({ userId: 1, step: 1, variant: 1 }, { unique: true });

module.exports = mongoose.model('Template', TemplateSchema);
