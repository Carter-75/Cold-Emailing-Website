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
    // Security
    ENCRYPTION_KEY: z.string().optional(),
    JWT_SECRET: z.string().min(10, { message: "JWT_SECRET should be a secure string of at least 10 chars" }),
    CRON_SECRET: z.string().min(16, { message: "CRON_SECRET should be at least 16 chars when configured" }).optional(),
    
    // Server Config
    PORT: z.string().optional().default('3000'),
    PRODUCTION: z.string().optional().default('false'),
    PROJECT_NAME: z.string().optional().default('Cold Outreach System'),
    
    // Essential for core functionality (Discovery/AI)
    // Note: These can also be provided per-user in the DB, 
    // but having defaults or checking existence is good practice.
    OPENAI_API_KEY: z.string().optional(),
    SERPAPI_KEY: z.string().optional(),

    // Auth & Integration
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    FRONTEND_URL: z.string().url().optional(),
    PROD_FRONTEND_URL: z.string().url().optional(),
    PROD_BACKEND_URL: z.string().url().optional(),
    
    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID: z.string().optional(),
    STRIPE_TRIAL_DAYS: z.string().optional().default('3'),
});

const validateEnv = () => {
    try {
        const parsed = envSchema.parse(process.env);
        return parsed;
    } catch (err) {
        console.error('\n⚠️ CONFIGURATION WARNING:');
        err.errors.forEach(e => {
            console.error(`   - ${e.path.join('.')}: ${e.message}`);
        });
        console.warn('\n   Continuing in DEGRATED MODE. Some features will fail until .env.local/Vercel variables are updated.\n');
        
        // Return partially valid env or defaults to allow booting for diagnostics
        return {
            ...process.env,
            PRODUCTION: process.env.PRODUCTION || 'false',
            PORT: process.env.PORT || '3000',
            PROJECT_NAME: process.env.PROJECT_NAME || 'Cold Outreach (Degraded)'
        };
    }
};

module.exports = validateEnv();
