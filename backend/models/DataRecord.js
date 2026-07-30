const mongoose = require('mongoose');

const DataRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Source Provenance
  sourceType: { 
    type: String, 
    enum: ['building-permits', 'gov-contracts', 'sec-filings'],
    required: true 
  },
  sourceId: { type: String, required: true },   // Unique ID from the source (permit #, contract #, etc.)
  sourceUrl: { type: String },                   // Direct link to original listing
  
  // Raw Payload (archived for auditing / re-processing)
  raw: { type: mongoose.Schema.Types.Mixed },
  
  // AI-Extracted Structured Data
  structured: {
    companyName: { type: String, default: '' },
    estimatedBudget: { type: Number, default: 0 },
    projectType: { type: String, default: '' },
    location: {
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      zip: { type: String, default: '' },
      fullAddress: { type: String, default: '' }
    },
    contactInfo: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' }
    },
    executiveSummary: { type: String, default: '' },
    tags: [String]
  },
  
  // Pipeline State
  status: { 
    type: String, 
    enum: ['raw', 'processing', 'processed', 'published', 'failed', 'sent-to-outreach'],
    default: 'raw' 
  },
  failureReason: { type: String },
  
  // SEO Publishing (Phase 4)
  publishedUrl: { type: String },
  publishedAt: { type: Date },
  
  // Cross-reference to outreach pipeline
  linkedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  
  processedAt: { type: Date }
}, { timestamps: true });

// Prevent duplicate records from the same source
DataRecordSchema.index({ userId: 1, sourceType: 1, sourceId: 1 }, { unique: true });

// Pipeline queries: find raw records needing processing
DataRecordSchema.index({ userId: 1, status: 1 });

// Text search on structured data
DataRecordSchema.index({ 
  'structured.companyName': 'text', 
  'structured.projectType': 'text', 
  'structured.executiveSummary': 'text',
  'structured.location.city': 'text'
});

module.exports = mongoose.model('DataRecord', DataRecordSchema);
