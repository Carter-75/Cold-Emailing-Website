const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  displayName: String,
  config: {
    // API Keys
    openaiKey: String,
    serpapiKey: String,
    apolloKey: String,
    verifaliaKey: String,
    
    // SMTP & IMAP
    senderEmail: String,
    appPassword: String,
    imapHost: { type: String, default: 'imap.gmail.com' },
    imapPort: { type: Number, default: 993 },
    
    // Personalization & Branding
    senderName: String,
    senderTitle: String,
    companyName: String,
    companyDesc: String,
    serviceDesc: String,
    valueProp: String,
    targetOutcome: String,
    websiteUrl: { type: String, default: 'carter-portfolio.fyi' },
    physicalAddress: String,
    
    // Autonomous logic
    dailyLeadLimit: { type: Number, default: 3 },
    testModeActive: { type: Boolean, default: false },
    testRecipientEmail: String
  },
  stats: {
    emailsSent: { type: Number, default: 0 },
    unsubscribes: { type: Number, default: 0 },
    replies: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
