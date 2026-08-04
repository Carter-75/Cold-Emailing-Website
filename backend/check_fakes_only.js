const dns = require('dns').promises;
const mongoose = require('mongoose');
const User = require('./models/User');
const Lead = require('./models/Lead');
const SentEmail = require('./models/SentEmail');

process.env.ENCRYPTION_KEY = '2d23c04538022b85dbf8a99d2342bb9fbb9132fc135592b03ecb431cfcc5cb16';
process.env.NODE_ENV = 'production';

async function run() {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    const srvRecords = await dns.resolveSrv('_mongodb._tcp.cold-emailing-website.fw3kjrk.mongodb.net');
    
    const hosts = srvRecords.map(r => `${r.name}:${r.port}`).join(',');
    const txtRecords = await dns.resolveTxt('cold-emailing-website.fw3kjrk.mongodb.net');
    let txtOpts = '&' + txtRecords.map(r => r.join('')).join('&');
    const standardUri = `mongodb://Vercel-Admin-cold-emailing-website:y7JAEmmnM3wJfyXT@${hosts}/?ssl=true${txtOpts}&retryWrites=true&w=majority`;
    
    await mongoose.connect(standardUri, { serverSelectionTimeoutMS: 5000 });
    
    const user = await User.findOne({ email: 'cartermoyer75@gmail.com' });
    
    const testLeads = await Lead.find({ userId: user._id, isTestData: true });
    console.log(`Found ${testLeads.length} explicit test leads (isTestData: true)`);
    testLeads.forEach(l => console.log(`- ${l.businessName} (${l.status})`));
    
    const manualFakes = await Lead.find({ userId: user._id, businessName: /test/i });
    console.log(`Found ${manualFakes.length} leads with 'test' in the name`);
    manualFakes.forEach(l => console.log(`- ${l.businessName} (${l.status})`));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
run();
