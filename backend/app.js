// Strict Environment Validation
require('./config/env');

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const { connectToDatabase } = require('./lib/mongodb');

const app = express();
const isProd = process.env.PRODUCTION === 'true';

app.set('trust proxy', 1);

// --- Middlewares ---
app.use(cors({
  origin: (origin, callback) => {
    // 1. No origin (like mobile apps or curl) or same-domain
    if (!origin) return callback(null, true);
    
    const allowed = [
      process.env.FRONTEND_URL, 
      process.env.PROD_FRONTEND_URL, 
      'https://carter-portfolio.fyi'
    ].filter(Boolean);
    
    // 2. Check if it matches allowed list or is strict localhost
    const isLocalhost = origin === 'http://localhost:3000' || origin === 'http://localhost:4200' || origin === 'http://127.0.0.1:3000' || origin === 'http://127.0.0.1:4200';
    
    const isAllowed = allowed.includes(origin) || isLocalhost || (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`);

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('⚠️ Blocked by CORS:', origin);
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false
}));

// --- Session Polyfill (Hardening for Vercel Auth Loops) ---
app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = (cb) => cb();
  }
  if (req.session && !req.session.save) {
    req.session.save = (cb) => cb();
  }
  next();
});

// --- MongoDB Connectivity Middleware ---
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    // Fail gracefully for diagnostics, or block if critical
    console.error('Database connection failed in middleware:', err.message);
    next();
  }
});

// --- Diagnostic Routes (More resilient for Vercel Rewrites) ---
app.all(['/api/health', '/api/ping', '/health', '/ping'], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: 'online',
    path: req.path,
    url: req.url,
    method: req.method,
    version: '1.0.2-stable',
    env: process.env.PRODUCTION === 'true' ? 'production' : 'development',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/debug-bundle', async (req, res) => {
  if (isProd) return res.status(404).json({ error: 'Not Found' });
  const fs = require('fs').promises;
  async function listFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const file of list) {
      const resPath = path.resolve(dir, file.name);
      if (file.isDirectory()) {
        results.push({ name: file.name, type: 'dir', children: await listFiles(resPath) });
      } else {
        results.push({ name: file.name, type: 'file' });
      }
    }
    return results;
  }
  try {
    const root = await listFiles(process.cwd());
    res.json({ root });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// --- Feature Routers ---
// Note: aiRouter is currently optional/flavor-specific
let aiRouter = null; 

const indexRouter = require('./routes/index');
const cronRouter = require('./routes/cron');

const PROJECT_NAME = process.env.PROJECT_NAME || 'Portfolio Project';

// --- MongoDB Initialization ---
connectToDatabase()
  .then(() => {})
  .catch(err => {
    console.error('Initial MongoDB Connection failed:', err.message);
    mongoose.set('bufferCommands', false);
  });

if (isProd && !process.env.JWT_SECRET) {
  console.error('\n🛑 CRITICAL: JWT_SECRET is missing from environment variables!');
  throw new Error('CRITICAL: JWT_SECRET is missing in production. Server halt.');
}

if (isProd && !process.env.ENCRYPTION_KEY) {
  console.error('\n🛑 CRITICAL: ENCRYPTION_KEY is missing from environment variables!');
  throw new Error('CRITICAL: ENCRYPTION_KEY is missing in production. Server halt.');
}

// JWT authentication is handled per-route via the middleware/auth.js module

// --- Portfolio Iframe Security ---
const authRouter = require('./routes/auth');

app.use((req, res, next) => {
  // Dynamically calculate frame ancestors to support various Vercel aliases
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const currentOrigin = `${protocol}://${host}`;
  
  const ancestors = ["'self'", "https://*.vercel.app", currentOrigin];
  
  res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors.join(' ')}`);
  res.setHeader('X-Frame-Options', 'ALLOWALL'); 
  next();
});

app.get('/', (req, res) => {
  res.send(`API for ${PROJECT_NAME} is running at /api`);
});

app.use('/api/cron', cronRouter);
app.use('/api', indexRouter);
app.use('/api/auth', authRouter);
if (aiRouter) {
  app.use('/api/ai', aiRouter);
}

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message,
    error: req.app.get('env') === 'development' ? err : {}
  });
});

module.exports = app;
