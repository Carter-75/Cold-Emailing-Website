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

async function migrateEmail() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('--- Email Alias Migration (help -> hello) ---');
    
    const users = await User.find({ 
      $or: [
        { 'config.senderEmail': /help@carter-portfolio\.fyi/i },
        { 'config.signature': /help@carter-portfolio\.fyi/i }
      ]
    });

    console.log(`Found ${users.length} users to update.`);

    for (const user of users) {
      console.log(`Updating user: ${user.email}`);
      
      // Update Sender Email
      if (user.config.senderEmail && user.config.senderEmail.toLowerCase() === 'help@carter-portfolio.fyi') {
        user.config.senderEmail = 'hello@carter-portfolio.fyi';
      }

      // Update Signature (global replace in string)
      if (user.config.signature) {
        user.config.signature = user.config.signature.replace(/help@carter-portfolio\.fyi/gi, 'hello@carter-portfolio.fyi');
      }

      // Ensure Website URL is also checked for help (unlikely)
      // Save changes
      user.markModified('config');
      await user.save();
      console.log('✅ Updated.');
    }

    console.log('Migration complete.');

  } catch (err) {
    console.error('Migration Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrateEmail();
