const mongoose = require('mongoose');
const Lead = require('./models/Lead');

const uri = "mongodb+srv://Vercel-Admin-cold-emailing-website:y7JAEmmnM3wJfyXT@cold-emailing-website.fw3kjrk.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 10000 }).then(async () => {
  console.log('Connected to MongoDB.');
  const result = await Lead.deleteMany({ source: { $in: ['portfolio', 'data-enrichment'] } });
  console.log(`Deleted ${result.deletedCount} fake leads from the database.`);
  process.exit(0);
}).catch(err => {
  console.error('Failed to connect:', err.message);
  process.exit(1);
});
