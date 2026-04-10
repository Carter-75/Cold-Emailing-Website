// Explicit Environment Resolution
const path = require('path');
const fs = require('fs');
const resolveEnvPath = () => {
  const candidates = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), 'backend', '.env.local')];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return candidates[0];
};
require('dotenv').config({ path: resolveEnvPath() });
const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');

const app = express();

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

// --- Diagnostic Routes (Moved up for early availability) ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    cwd: process.cwd(),
    dirname: __dirname,
    env: process.env.PRODUCTION === 'true' ? 'production' : 'development',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/debug-bundle', async (req, res) => {
  const fs = require('fs').promises;
  async function listFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const file of list) {
      const res = path.resolve(dir, file.name);
      if (file.isDirectory()) {
        results.push({ name: file.name, type: 'dir', children: await listFiles(res) });
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
const mongoURI = process.env.MONGODB_URI;
    if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('OK: Connected to MongoDB'))
    .catch(err => {
      console.error('WARN: MongoDB Connection Error (Graceful):', err.message);
      console.log('INFO: Continuing without database features...');
    });
} else {
  console.log('INFO: No MONGODB_URI found in .env.local. Database features disabled.');
}

// --- Middlewares ---
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- Portfolio Iframe Security ---
const isProd = process.env.PRODUCTION === 'true';
const prodUrl = process.env.PROD_FRONTEND_URL;

const frameAncestors = ["'self'", "https://carter-portfolio.fyi", "https://carter-portfolio.vercel.app", "https://*.vercel.app", `http://localhost:${process.env.PORT || '{be_port}'}`];
if (prodUrl) {{
  frameAncestors.push(prodUrl);
}}
if (process.env.PROD_BACKEND_URL) {{
  frameAncestors.push(process.env.PROD_BACKEND_URL);
}}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": frameAncestors,
    },
  },
}));

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL'); // For compatibility
  next();
});

app.get('/', (req, res) => {
  res.send(`API for ${PROJECT_NAME} is running at /api`);
});

app.use('/api', indexRouter);
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
