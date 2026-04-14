const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

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
    smtpHost: { type: String, default: 'smtp.gmail.com' },
    smtpPort: { type: Number, default: 465 },
    smtpSecure: { type: Boolean, default: true },
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
    personaContext: String,
    signature: String,
    priceTier1: { type: String, default: '' },
    priceTier2: { type: String, default: '' },
    priceTier3: { type: String, default: '' },
    
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

// --- Transparent Encryption Hooks ---

const SENSITIVE_FIELDS = [
  'openaiKey',
  'serpapiKey',
  'apolloKey',
  'verifaliaKey',
  'appPassword'
];

/**
 * Encrypt sensitive fields before saving
 */
UserSchema.pre('save', function(next) {
  if (this.config) {
    SENSITIVE_FIELDS.forEach(field => {
      if (this.isModified(`config.${field}`) && this.config[field]) {
        // Only encrypt if text is not already in encrypted format (contains Delimiter)
        if (!this.config[field].includes(':')) {
           this.config[field] = encrypt(this.config[field]);
        }
      }
    });
  }
  next();
});

/**
 * Decrypt sensitive fields when document is initialized from DB
 */
UserSchema.post('init', function(doc) {
  if (doc.config) {
    SENSITIVE_FIELDS.forEach(field => {
      if (doc.config[field]) {
        doc.config[field] = decrypt(doc.config[field]);
      }
    });
  }
});

/**
 * Special handling for Save output to ensure the object in memory remains decrypted
 */
UserSchema.post('save', function(doc) {
  if (doc.config) {
    SENSITIVE_FIELDS.forEach(field => {
      if (doc.config[field]) {
        doc.config[field] = decrypt(doc.config[field]);
      }
    });
  }
});

module.exports = mongoose.model('User', UserSchema);
