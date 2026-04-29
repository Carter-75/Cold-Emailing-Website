const app = require('../backend/app');

// Explicit diagnostic route for Vercel
app.get('/api/vercel-check', (req, res) => {
    res.json({ status: 'reached-handler', timestamp: new Date().toISOString() });
});

module.exports = app;
