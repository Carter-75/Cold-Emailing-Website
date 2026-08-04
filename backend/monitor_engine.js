const dns = require('dns').promises;
const mongoose = require('mongoose');
const SentEmail = require('./models/SentEmail');
const User = require('./models/User');

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
    
    const tenMinsAgo = new Date(Date.now() - 15 * 60 * 1000); // look back up to 15 mins
    
    const sentRecently = await SentEmail.find({
        userId: user._id,
        createdAt: { $gte: tenMinsAgo }
    }).sort({ createdAt: -1 }).limit(10);
    
    if (sentRecently.length > 0) {
        console.log(`FOUND_EMAILS:${sentRecently.length}`);
        sentRecently.forEach(e => {
            console.log(`- Sent to ${e.recipientEmail} for ${e.businessName} at ${e.createdAt.toISOString()}`);
        });
    } else {
        // Also check if any error flag popped up again just in case
        if (user.config.diagnosticFlags?.openai?.active) {
            console.log('ERROR_OPENAI_FLAG_ACTIVE');
        } else if (user.config.diagnosticFlags?.smtp?.active) {
            console.log('ERROR_SMTP_FLAG_ACTIVE');
        } else {
            console.log('NO_EMAILS_YET');
        }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
run();
