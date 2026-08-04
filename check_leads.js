const mongoose = require('mongoose');
const Lead = require('./backend/models/Lead');

const uri = "mongodb+srv://Vercel-Admin-cold-emailing-website:y7JAEmmnM3wJfyXT@cold-emailing-website.fw3kjrk.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(uri).then(async () => {
  const augustDate = new Date('2026-08-01T00:00:00Z');
  const leads = await Lead.find({ 
    createdAt: { $gte: augustDate } 
  });
  
  console.log('Total Leads since August 1, 2026:', leads.length);
  if (leads.length > 0) {
    console.log('Sample Lead:', JSON.stringify(leads[0], null, 2));
    
    // Check statuses
    const statuses = {};
    leads.forEach(l => {
      statuses[l.status] = (statuses[l.status] || 0) + 1;
    });
    console.log('Statuses:', statuses);
  }
  
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
