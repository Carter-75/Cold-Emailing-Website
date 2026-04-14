const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Import Model
const UserSchema = new mongoose.Schema({
  email: String,
  config: Object
});
const User = mongoose.model('User', UserSchema);

async function finalAudit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOne({ email: 'cartermoyer75@gmail.com' });
    
    if (!user) {
      console.log('User not found.');
      return;
    }

    const REQUIRED_FIELDS = [
      'openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaKey',
      'senderEmail', 'appPassword', 'smtpHost', 'smtpPort', 'imapHost', 'imapPort',
      'senderName', 'senderTitle', 'companyName', 'websiteUrl', 'physicalAddress',
      'personaContext', 'signature', 'valueProp', 'targetOutcome',
      'priceTier1', 'priceTier2', 'priceTier3', 'dailyLeadLimit'
    ];

    console.log('\n--- FINAL SCHEMA AUDIT ---');
    let emptyFields = [];
    
    REQUIRED_FIELDS.forEach(field => {
      const val = user.config[field];
      if (val === undefined || val === null || val === '') {
        emptyFields.push(field);
      }
    });

    if (emptyFields.length === 0) {
      console.log('✅ ALL FIELDS ARE FULL!');
    } else {
      console.log('❌ MISSING FIELDS:');
      emptyFields.forEach(f => console.log(` - ${f}`));
    }

  } catch (err) {
    console.error('Audit Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

finalAudit();
