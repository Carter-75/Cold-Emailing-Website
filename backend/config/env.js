const { z } = require('zod');
const path = require('path');
const fs = require('fs');

/**
 * Robust Environment Variable Validation
 * Ensures the project has everything it needs to "physically work"
 */

const resolveEnvPath = () => {
    const candidates = [
        path.join(process.cwd(), '.env.local'),
        path.join(process.cwd(), 'backend', '.env.local'),
        path.join(process.cwd(), '../.env.local')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return candidates[0];
};

require('dotenv').config({ path: resolveEnvPath() });

const envSchema = z.object({
    // Critical Infrastructure
    MONGODB_URI: z.string().url({ message: "MONGODB_URI must be a valid connection string" }).optional(),
    JWT_SECRET: z.string().min(10, { message: "JWT_SECRET should be a secure string of at least 10 chars" }),
    
    // Server Config
    PORT: z.string().optional().default('3000'),
    PRODUCTION: z.string().optional().default('false'),
    PROJECT_NAME: z.string().optional().default('Cold Outreach System'),
    
    // Essential for core functionality (Discovery/AI)
    // Note: These can also be provided per-user in the DB, 
    // but having defaults or checking existence is good practice.
    OPENAI_API_KEY: z.string().optional(),
    SERPAPI_KEY: z.string().optional(),
});

const validateEnv = () => {
    try {
        const parsed = envSchema.parse(process.env);
        console.log('✅ Environment configuration validated.');
        return parsed;
    } catch (err) {
        console.error('\n❌ FATAL CONFIGURATION ERROR:');
        err.errors.forEach(e => {
            console.error(`   - ${e.path.join('.')}: ${e.message}`);
        });
        console.error('\n   The application physically cannot work without these variables.');
        console.error('   Please update your .env.local file.\n');
        process.exit(1);
    }
};

module.exports = validateEnv();
