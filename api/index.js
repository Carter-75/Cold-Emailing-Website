const app = require('../backend/app');

// Explicit diagnostic route for Vercel Root Setup
app.get('/api/vercel-root-check', (req, res) => {
    res.json({ status: 'root-configuration-active', timestamp: new Date().toISOString() });
});

module.exports = app;
