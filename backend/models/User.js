const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Hashed password for local auth
  displayName: String,
  config: {
    // API Keys
    openaiKey: String,
    serpapiKey: String,
    apolloKey: String,
    verifaliaUsername: String,  // Verifalia account email (HTTP Basic Auth)
    verifaliaPassword: String,  // Verifalia account password (HTTP Basic Auth)
    
    // SMTP & IMAP (Primary outbox)
    senderEmail: String,
    appPassword: String,
    smtpHost: String,
    smtpPort: Number,
    smtpSecure: { type: Boolean, default: true },
    imapHost: String,
    imapPort: Number,
    
    // Secondary Inboxes for Webmail Client
    connectedInboxes: [{
      email: String,
      appPassword: String,
      smtpHost: String,
      smtpPort: Number,
      smtpSecure: { type: Boolean, default: true },
      imapHost: String,
      imapPort: Number
    }],
    
    // Personalization & Branding
    senderName: String,
    senderTitle: String,
    companyName: String,
    companyDesc: String,
    serviceDesc: String,
    valueProp: String,
    targetOutcome: String,
    websiteUrl: String,
    physicalAddress: String,
    personaContext: String,
    signature: String,
    priceTier1: { type: String, default: '' },
    priceTier2: { type: String, default: '' },
    priceTier3: { type: String, default: '' },
    
    // Autonomous logic
    dailyLeadLimit: { type: Number, default: 3 },
    outreachEnabled: { type: Boolean, default: false },
    outreachPaused: { type: Boolean, default: false },         // Kill switch — set true on fatal API error
    outreachPausedReason: { type: String, default: '' },       // Human-readable reason stored for dashboard display
    timezone: { type: String, default: 'America/Chicago' },   // Used to gate engine to user's 8am-6pm local time
    testRecipientEmail: String,
    lastAlertSentAt: { type: Date }, // Tracked for daily diagnostic emails
    diagnosticFlags: {
      openai: { active: { type: Boolean, default: false }, lastAlertedAt: Date },
      serpapi: { active: { type: Boolean, default: false }, lastAlertedAt: Date },
      verifalia: { active: { type: Boolean, default: false }, lastAlertedAt: Date },
      smtp: { active: { type: Boolean, default: false }, lastAlertedAt: Date }
    }
  },
  stats: {
    emailsSent: { type: Number, default: 0 },
    unsubscribes: { type: Number, default: 0 },
    replies: { type: Number, default: 0 }
  },
  subscription: {
    customerId: String,
    status: { type: String, default: 'none' }, // 'none', 'trialing', 'active', 'past_due', 'canceled'
    priceId: String,
    subscriptionId: String,
    currentPeriodEnd: Date
  }
}, { timestamps: true });

// --- Transparent Encryption Hooks ---

const SENSITIVE_FIELDS = [
  'openaiKey',
  'serpapiKey',
  'apolloKey',
  'verifaliaPassword',  // Only encrypt the password; username is an email (not secret)
  'appPassword'
];

/**
 * Encrypt sensitive fields before saving
 */
UserSchema.pre('save', function(next) {
  if (this.config) {
    SENSITIVE_FIELDS.forEach(field => {
      const fieldPath = `config.${field}`;
      if (this.isModified(fieldPath) && this.config[field]) {
        // Robust check: Only encrypt if it's not already in format iv:tag:data
        // We trust isModified but verify format as a fail-safe
        if (!this.config[field].includes(':')) {
           this.config[field] = encrypt(this.config[field]);
        }
      }
    });
    
    if (this.config.connectedInboxes && Array.isArray(this.config.connectedInboxes)) {
      this.config.connectedInboxes.forEach(inbox => {
        if (inbox.appPassword && !inbox.appPassword.includes(':')) {
          inbox.appPassword = encrypt(inbox.appPassword);
        }
      });
    }
  }
  next();
});

/**
 * Decrypt sensitive fields when document is initialized from DB
 */
UserSchema.post('init', function(doc) {
  if (doc.config) {
    SENSITIVE_FIELDS.forEach(field => {
      if (doc.config[field] && doc.config[field].includes(':')) {
        doc.config[field] = decrypt(doc.config[field]);
      }
    });
    
    if (doc.config.connectedInboxes && Array.isArray(doc.config.connectedInboxes)) {
      doc.config.connectedInboxes.forEach(inbox => {
        if (inbox.appPassword && inbox.appPassword.includes(':')) {
          inbox.appPassword = decrypt(inbox.appPassword);
        }
      });
    }
  }
});

/**
 * Decrypt after save to ensure in-memory object remains usable
 */
UserSchema.post('save', function(doc) {
  if (doc.config) {
    SENSITIVE_FIELDS.forEach(field => {
      if (doc.config[field] && doc.config[field].includes(':')) {
        doc.config[field] = decrypt(doc.config[field]);
      }
    });

    if (doc.config.connectedInboxes && Array.isArray(doc.config.connectedInboxes)) {
      doc.config.connectedInboxes.forEach(inbox => {
        if (inbox.appPassword && inbox.appPassword.includes(':')) {
          inbox.appPassword = decrypt(inbox.appPassword);
        }
      });
    }
  }
});

module.exports = mongoose.model('User', UserSchema);
