require('dotenv').config();
const mongoose = require('mongoose');
const InboxMessage = require('../models/InboxMessage');

async function fixWarmups() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const regex = /Phone[_ ]?N0:\s*\d{3}-\d{3}-\d{3}\s*$/i;
  let count = 0;
  
  const messages = await InboxMessage.find({ isWarmUp: false });
  for (const msg of messages) {
    const textToCheck = msg.textBody ? msg.textBody.trim() : (msg.htmlBody || '').replace(/<[^>]*>?/gm, '').trim();
    if (regex.test(textToCheck)) {
      msg.isWarmUp = true;
      msg.isRead = true;
      await msg.save();
      count++;
    }
  }
  
  console.log(`Updated ${count} existing messages to isWarmUp=true`);
  mongoose.disconnect();
}

fixWarmups().catch(err => {
  console.error(err);
  process.exit(1);
});
