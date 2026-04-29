const app = require('../backend-logic/app');

// Diagnostic route
app.get('/api/bundle-check', (req, res) => {
    res.json({ status: 'injected-bundle-reached', timestamp: new Date().toISOString() });
});

module.exports = app;
