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
const session = require('express-session');
const passport = require('passport');
require('./config/passport');

const app = express();

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
    
    // 2. Check if it matches allowed list or is a Vercel subdomain
    const isAllowed = allowed.includes(origin) || 
                      origin.endsWith('.vercel.app') || 
                      origin.includes('localhost') || 
                      origin.includes('127.0.0.1');

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

let aiRouter;
try {
  // We assume aiRouter might be added later or exist in certain flavors
  // For the general template, we'll keep it as a placeholder or empty
} catch (err) {
  console.error('FATAL: Failed to load aiRouter:', err);
}

const indexRouter = require('./routes/index');

const PROJECT_NAME = process.env.PROJECT_NAME || 'Portfolio Project';

// --- MongoDB Setup ---
const { initAgenda } = require('./services/agenda.service');

const mongoURI = process.env.MONGODB_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => {
      console.log('OK: Connected to MongoDB');
      initAgenda();
    })
    .catch(err => {
      console.error('WARN: MongoDB Connection Error (Graceful):', err.message);
      console.log('INFO: Continuing without database features...');
      mongoose.set('bufferCommands', false);
    });
} else {
  console.log('INFO: No MONGODB_URI found in .env.local. Database features disabled.');
  mongoose.set('bufferCommands', false);
}

app.use(session({
  secret: process.env.JWT_SECRET || 'cold-outreach-secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Portfolio Iframe Security ---
const isProd = process.env.PRODUCTION === 'true';
const prodUrl = process.env.PROD_FRONTEND_URL;

const authRouter = require('./routes/auth');

app.use((req, res, next) => {
  // Dynamically calculate frame ancestors to support various Vercel aliases
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const currentOrigin = `${protocol}://${host}`;
  
  const ancestors = ["'self'", "https://carter-portfolio.fyi", "https://*.vercel.app", currentOrigin];
  
  res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors.join(' ')}`);
  res.setHeader('X-Frame-Options', 'ALLOWALL'); 
  next();
});

app.get('/', (req, res) => {
  res.send(`API for ${PROJECT_NAME} is running at /api`);
});

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
