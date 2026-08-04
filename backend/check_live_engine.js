const dns = require('dns').promises;
const mongoose = require('mongoose');
const User = require('./models/User');
const Lead = require('./models/Lead');
const SentEmail = require('./models/SentEmail');

async function run() {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    const srvRecords = await dns.resolveSrv('_mongodb._tcp.cold-emailing-website.fw3kjrk.mongodb.net');
    
    const hosts = srvRecords.map(r => `${r.name}:${r.port}`).join(',');
    const txtRecords = await dns.resolveTxt('cold-emailing-website.fw3kjrk.mongodb.net');
    let txtOpts = '&' + txtRecords.map(r => r.join('')).join('&');
    const standardUri = `mongodb://Vercel-Admin-cold-emailing-website:y7JAEmmnM3wJfyXT@${hosts}/?ssl=true${txtOpts}&retryWrites=true&w=majority`;
    
    await mongoose.connect(standardUri, { serverSelectionTimeoutMS: 5000 });
    
    const user = await User.findOne({});

    console.log('--- Current Live Engine Status ---');
    console.log('Outreach Enabled:', user.config.outreachEnabled);
    console.log('Test Mode:', user.config.engineTestMode);
    
    // Check if diagnostic flags are active
    const openaiFlag = user.config.diagnosticFlags?.openai?.active;
    console.log('OpenAI API Error Flag Active?:', !!openaiFlag);

    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const sentRecently = await SentEmail.countDocuments({
        userId: user._id,
        createdAt: { $gte: fiveMinsAgo }
    });
    console.log(`Emails successfully sent in the last 5 minutes: ${sentRecently}`);

    const readyCount = await Lead.countDocuments({ userId: user._id, status: 'ready' });
    console.log(`Leads currently sitting in 'ready' queue: ${readyCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
run();
