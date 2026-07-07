require('dotenv').config({ path: '../.env.local' });
const mongoose = require('mongoose');
const InboxMessage = require('../models/InboxMessage');
const User = require('../models/User');

async function checkBlankEmails() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const user = await User.findOne({ email: 'carter.bourette@gmail.com' }); // Assuming this is the user
  
  const messages = await InboxMessage.find({ 
    $or: [
      { subject: { $exists: false } },
      { subject: '' },
      { subject: null }
    ]
  }).limit(5);

  console.log('Blank messages found:', messages.length);
  messages.forEach(msg => {
    console.log(JSON.stringify(msg, null, 2));
  });

  process.exit(0);
}

checkBlankEmails();
