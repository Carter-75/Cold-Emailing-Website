const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
    envPath = path.join(process.cwd(), '..', '.env.local');
}

const env = fs.readFileSync(envPath, 'utf8');
const mongoUriMatch = env.match(/MONGODB_URI=(.*)/);
const mongoURI = mongoUriMatch ? mongoUriMatch[1].trim().replace(/^"|"$/g, '') : null;

async function run() {
    try {
        await mongoose.connect(mongoURI);
        const User = require('../models/User'); // Use the model to handle encryption hooks
        
        const user = await User.findOne({});
        if (!user) {
            console.log('No user found to update');
            return;
        }

        console.log('Current User Configuration:', {
            displayName: user.displayName,
            companyName: user.config.companyName,
            openaiKey: user.config.openaiKey ? 'SET' : 'NOT SET'
        });

        // Apply Updates
        user.config.openaiKey = ''; // Clear OpenAI Key
        user.config.companyName = 'Phoenix';
        user.config.companyDesc = "Phoenix is a premier software development studio specializing in high-performance full-stack web applications, led by Carter Moyer.";
        user.config.serviceDesc = "End-to-end full-stack development, architecting scalable web solutions using modern MEAN stacks and intelligent AI integration.";

        await user.save();
        console.log('OK: User configuration updated successfully.');
        
        const updatedUser = await User.findOne({});
        console.log('Updated Configuration Audit:');
        console.log({
            companyName: updatedUser.config.companyName,
            companyDesc: updatedUser.config.companyDesc ? 'SET' : 'NOT SET',
            serviceDesc: updatedUser.config.serviceDesc ? 'SET' : 'NOT SET',
            openaiKey: updatedUser.config.openaiKey ? 'SET' : 'NOT SET'
        });

    } catch (err) {
        console.error('CRITICAL: Update failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
