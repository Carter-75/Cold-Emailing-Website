const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Import Model
const UserSchema = new mongoose.Schema({
  email: String,
  displayName: String,
  config: Object
});
const User = mongoose.model('User', UserSchema);

// Utils (Copy from encryption.js)
const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  try {
    const secret = process.env.ENCRYPTION_KEY;
    const key = crypto.createHash('sha256').update(String(secret)).digest();
    const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return 'DECRYPT_FAILED';
  }
}

async function audit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('--- Database Audit ---');
    
    // Find the user (assuming Carter based on context)
    const user = await User.findOne({ $or: [{ email: /carter/i }, { displayName: /carter/i }] }).sort({ updatedAt: -1 });
    
    if (!user) {
      console.log('No user found matching "Carter"');
      const all = await User.find().limit(1);
      if (all[0]) console.log('Found generic user:', all[0].email);
      else console.log('Database is empty.');
      return;
    }

    console.log('User Found:', user.email);
    console.log('Display Name:', user.displayName);
    
    if (!user.config) {
      console.log('Config object is MISSING entirely.');
    } else {
      const sensitive = ['openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaKey', 'appPassword'];
      
      Object.keys(user.config).forEach(key => {
        let val = user.config[key];
        if (sensitive.includes(key)) {
            val = val ? (decrypt(val) === 'DECRYPT_FAILED' ? '[ENCRYPTED]' : '[DECRYPTED_SUCCESS]') : '[EMPTY]';
        }
        console.log(`${key}: ${val}`);
      });
    }

  } catch (err) {
    console.error('Audit Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

audit();
