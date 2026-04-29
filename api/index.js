const app = require('../backend/app');

// Ultimate Diagnostic Route
app.get('/api/ping', (req, res) => {
    res.json({ status: 'pong', source: 'root-api-handler', timestamp: new Date().toISOString() });
});

module.exports = app;
