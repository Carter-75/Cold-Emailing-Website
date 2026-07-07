require('dotenv').config({ path: '../.env.local' });
const mongoose = require('mongoose');
const Lead = require('./models/Lead');
const InboxMessage = require('./models/InboxMessage');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
    console.log('Connected to MongoDB');
    
    const leads = await Lead.find({ status: 'emailed' });
    console.log('Total Leads Emailed:', leads.length);
    
    const testLeads = await Lead.find({ isTestData: true, status: 'emailed' });
    console.log('Test Leads Emailed:', testLeads.length);
    if (testLeads.length > 0) {
      console.log('Test Lead Emails:', testLeads.map(l => l.recipientEmail));
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
