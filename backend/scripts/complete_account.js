const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Import Model
const UserSchema = new mongoose.Schema({
  email: String,
  config: Object
});
const User = mongoose.model('User', UserSchema);

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('--- Account Data Completion ---');
    
    // Target user
    const targetEmail = 'cartermoyer75@gmail.com';
    const user = await User.findOne({ email: targetEmail });
    
    if (!user) {
      console.log(`User ${targetEmail} not found.`);
      return;
    }

    console.log('Updating record for:', user.email);

    // Prepare full config
    const updatedConfig = {
      ...user.config,
      // Identity
      senderName: 'Carter',
      senderTitle: 'Founder',
      companyName: 'Carter Portfolio',
      physicalAddress: 'Available on Request', // Standard legal compliant placeholder
      websiteUrl: 'carter-portfolio.fyi',
      
      // AI Awareness
      personaContext: 'I am a web developer finishing my degree and help businesses build a professional online presence. I focus on high-performance, clean designs.',
      valueProp: 'High-performance, custom-built websites that convert visitors into customers.',
      targetOutcome: 'A professional digital presence and increased organic leads.',
      
      // Pricing Context
      priceTier1: 'Basic Landing Pages: $100',
      priceTier2: 'Custom Business Sites: $250',
      priceTier3: 'Full Custom Applications: $475',
      
      // Logic
      dailyLeadLimit: 3
    };

    user.config = updatedConfig;
    await user.save();

    console.log('✅ Account successfully updated and filled!');

  } catch (err) {
    console.error('Migration Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
