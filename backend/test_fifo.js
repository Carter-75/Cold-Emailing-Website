const mongoose = require('mongoose');
const OutreachEngine = require('./services/engine.service');
const Lead = require('./models/Lead');
const User = require('./models/User');
const SentEmail = require('./models/SentEmail');

// Mock services to avoid real API calls
// We don't actually need to mock them if we don't call them, 
// but we should ensure the environment is correct.
require('./config/env');

async function testPipeline() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB");

  // 1. Cleanup
  const testUserEmail = 'test-fifo@example.com';
  await User.deleteMany({ email: testUserEmail });
  await Lead.deleteMany({});
  await SentEmail.deleteMany({});

  const user = await User.create({
    email: testUserEmail,
    config: {
      outreachEnabled: true,
      dailyLeadLimit: 10,
      openaiKey: 'mock-key',
      serpapiKey: 'mock-key',
      senderEmail: 'sender@example.com',
      appPassword: 'mock-pass',
      smtpHost: 'smtp.example.com',
      timezone: 'America/Chicago'
    }
  });

  console.log("User created");

  // 2. Setup leads in various states
  // a. Discovery leads (5)
  for (let i = 1; i <= 5; i++) {
    await Lead.create({
      userId: user._id,
      businessName: `Disc ${i}`,
      recipientEmail: `disc${i}@example.com`,
      status: 'discovery',
      createdAt: new Date(Date.now() - i * 1000) // Disc 1 is NEWEST, Disc 5 is OLDEST
    });
  }

  // b. Ready leads (2)
  await Lead.create({
    userId: user._id,
    businessName: "Ready Old",
    recipientEmail: "ready-old@example.com",
    status: 'ready',
    updatedAt: new Date(Date.now() - 5000)
  });
  await Lead.create({
    userId: user._id,
    businessName: "Ready New",
    recipientEmail: "ready-new@example.com",
    status: 'ready',
    updatedAt: new Date(Date.now() - 1000)
  });

  // c. Follow-up lead (1)
  await Lead.create({
    userId: user._id,
    businessName: "Follow Up",
    recipientEmail: "follow@example.com",
    status: 'emailed',
    nextEmailAt: new Date(Date.now() - 10000)
  });

  console.log("Leads setup");

  // 3. Test 12 PM Alert Logic
  console.log("Testing 12 PM Alert Logic...");
  user.config.timezone = 'Asia/Tokyo'; // Currently ~12:46 PM in Tokyo if it's 21:46 CST
  user.config.diagnosticFlags.openai.active = true;
  user.config.diagnosticFlags.openai.lastAlertedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // > 24h ago
  await user.save();

  // Run at 12 PM
  // Note: OutreachEngine uses Intl.DateTimeFormat with the timezone.
  // We'll trust the logic if the hour check passes.
  
  // 4. Run Pipeline Loop
  console.log("Running Recursive Pipeline Loop...");
  const res = await OutreachEngine.processChunk(user._id);
  console.log("Process Result:", res);
  
  const readyCountFinal = await Lead.countDocuments({ userId: user._id, status: 'ready' });
  console.log("Final Ready Count (should be filling up):", readyCountFinal);
  
  const discoveryCountFinal = await Lead.countDocuments({ userId: user._id, status: 'discovery' });
  console.log("Final Discovery Count (should be near 10):", discoveryCountFinal);
  // Expected: discovery_sent ready-old@example.com

  // 5. Test Queue Limits
  // Fill discovery to 10
  for (let i = 6; i <= 15; i++) {
    await Lead.create({
      userId: user._id,
      businessName: `Disc ${i}`,
      recipientEmail: `disc${i}@example.com`,
      status: 'discovery'
    });
  }
  const countDisc = await Lead.countDocuments({ userId: user._id, status: 'discovery' });
  console.log("Discovery Count:", countDisc);
  
  // Tick 3: Should refill ready queue
  console.log("Running Tick 3...");
  const res3 = await OutreachEngine.processChunk(user._id);
  console.log("Tick 3 Result:", res3.status);
  
  const readyCount = await Lead.countDocuments({ userId: user._id, status: 'ready' });
  console.log("Ready Count after Tick 3:", readyCount);

  await mongoose.disconnect();
}

testPipeline().catch(err => {
    console.error(err);
    process.exit(1);
});
