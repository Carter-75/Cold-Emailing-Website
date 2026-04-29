const app = require('./app');

// Explicit diagnostic route for Vercel Services Setup
app.get('/api/vercel-service-check', (req, res) => {
    res.json({ status: 'service-configuration-active', timestamp: new Date().toISOString() });
});

module.exports = app;
