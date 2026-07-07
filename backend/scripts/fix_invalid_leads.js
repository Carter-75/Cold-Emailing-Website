require('dotenv').config({ path: '../.env.local' });
const mongoose = require('mongoose');
const Lead = require('./models/Lead');

async function fixFinishedLeads() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
    console.log('Connected to MongoDB');
    
    // Find all leads marked as 'finished' that have no messageIds (meaning they were never emailed)
    const badLeads = await Lead.find({ status: 'finished', messageIds: { $size: 0 } });
    console.log(`Found ${badLeads.length} leads that were marked finished but never emailed.`);
    
    for (const lead of badLeads) {
      lead.status = 'invalid';
      await lead.save();
    }
    
    console.log('Successfully moved to invalid status.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
fixFinishedLeads();
