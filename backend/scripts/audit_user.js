const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('../utils/encryption');

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
        const user = await mongoose.connection.db.collection('users').findOne({});
        if (!user) {
            console.log('No user found');
            return;
        }

        const config = user.config || {};
        const SENSITIVE_FIELDS = [
            'openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaKey', 'appPassword'
        ];

        console.log('--- User Configuration Audit ---');
        console.log('Display Name:', user.displayName);
        console.log('Email:', user.email);
        
        const audit = {};
        const allFields = [
            'openaiKey', 'serpapiKey', 'apolloKey', 'verifaliaKey',
            'senderEmail', 'appPassword', 'smtpHost', 'smtpPort', 'imapHost', 'imapPort',
            'senderName', 'senderTitle', 'companyName', 'companyDesc', 'serviceDesc',
            'valueProp', 'targetOutcome', 'websiteUrl', 'physicalAddress', 'personaContext',
            'signature', 'priceTier1', 'priceTier2', 'priceTier3'
        ];

        allFields.forEach(field => {
            let value = config[field];
            if (value && SENSITIVE_FIELDS.includes(field) && value.includes(':')) {
                try {
                    value = decrypt(value);
                } catch (e) {
                    value = '[Decryption Failed]';
                }
            }
            
            if (!value || value === '' || value === 'Available on Request') {
                audit[field] = 'NOT SET';
            } else {
                audit[field] = 'SET' + (SENSITIVE_FIELDS.includes(field) ? ' (Encrypted)' : '');
            }
        });

        console.table(audit);
        
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
