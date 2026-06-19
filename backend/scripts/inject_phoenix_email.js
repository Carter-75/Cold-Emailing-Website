require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Hardcoding for the injection script context
const DB_URI = "mongodb+srv://Vercel-Admin-cold-emailing-website:y7JAEmmnM3wJfyXT@cold-emailing-website.fw3kjrk.mongodb.net/?retryWrites=true&w=majority";

async function run() {
  await mongoose.connect(DB_URI);
  console.log('Connected to DB');

  const users = await User.find({ email: /cartermoyer75/i });
  if (users.length === 0) {
    console.log('User not found.');
    process.exit(1);
  }

  const user = users[0];
  console.log(`Found user: ${user.email}`);

  if (!user.config) user.config = {};
  if (!user.config.connectedInboxes) user.config.connectedInboxes = [];

  const exists = user.config.connectedInboxes.find(i => i.email === 'hello@phoenixwebsites.ai');
  if (!exists) {
    user.config.connectedInboxes.push({
      email: 'hello@phoenixwebsites.ai',
      appPassword: 'LavaPhoenix7501!', // This will be encrypted by the pre-save hook
      smtpHost: 'smtppro.zoho.com',
      smtpPort: 465,
      smtpSecure: true,
      imapHost: 'imappro.zoho.com', // Typically it's imappro, user had imapppro in .env. We'll stick to imappro to be safe, Zoho's standard is imappro.
      imapPort: 993
    });
    
    user.markModified('config');
    await user.save();
    console.log('Successfully injected hello@phoenixwebsites.ai into connectedInboxes.');
  } else {
    console.log('Inbox already exists in user config.');
  }

  await mongoose.connection.close();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
