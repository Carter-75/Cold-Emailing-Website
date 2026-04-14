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

async function updateAddress() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Target user
    const targetEmail = 'cartermoyer75@gmail.com';
    const user = await User.findOne({ email: targetEmail });
    
    if (!user) {
      console.log(`User ${targetEmail} not found.`);
      return;
    }

    user.config.physicalAddress = 'N7646 County Road UU Fond du Lac WI 54937';
    await user.save();

    console.log('✅ Physical Address updated successfully!');

  } catch (err) {
    console.error('Update Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

updateAddress();
