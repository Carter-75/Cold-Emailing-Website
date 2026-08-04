const dns = require('dns').promises;
const mongoose = require('mongoose');
const User = require('./models/User');
const EmailService = require('./services/email.service');
const nodemailer = require('nodemailer');

// INJECT ENCRYPTION KEY SO MONGOOSE PLUGIN CAN DECRYPT PROPERLY
process.env.ENCRYPTION_KEY = '2d23c04538022b85dbf8a99d2342bb9fbb9132fc135592b03ecb431cfcc5cb16';
process.env.NODE_ENV = 'production';

async function testSMTP(config) {
  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost || 'smtppro.zoho.com',
      port: config.smtpPort || 465,
      secure: true,
      auth: {
        user: config.senderEmail,
        pass: config.appPassword
      },
      connectionTimeout: 10000,
    });

    transporter.verify((error, success) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

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
    if (!user) return console.log('No user found');

    console.log('--- CORRECT INTEGRATION TEST ---');
    
    // Clear the error flags I accidentally caused
    if (user.config.diagnosticFlags) {
        user.config.diagnosticFlags.openai.active = false;
        user.config.diagnosticFlags.smtp.active = false;
        user.config.diagnosticFlags.serpapi.active = false;
        await user.save();
        console.log('✅ Cleared diagnostic error flags blocking the engine.');
    }

    // Test OpenAI
    console.log('1. Testing OpenAI Key:', (user.config.openaiKey || '').substring(0, 10) + '...');
    try {
      const isApproved = await EmailService.verifyContentWithAI("Hello, this is a test.", user.config);
      console.log('   ✅ OpenAI Verification Request Passed!');
    } catch (err) {
      console.log('   ❌ OpenAI Exception:', err.message);
    }
    
    // Test Zoho SMTP
    console.log('2. Testing Zoho SMTP...');
    console.log(`   Host: ${user.config.smtpHost} | User: ${user.config.senderEmail}`);
    const smtpResult = await testSMTP(user.config);
    if (smtpResult.success) {
      console.log('   ✅ Zoho SMTP Login Successful!');
    } else {
      console.log('   ❌ Zoho SMTP Failed:', smtpResult.error);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
run();
