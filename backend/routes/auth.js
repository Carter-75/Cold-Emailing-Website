const express = require('express');
const router = express.Router();
const passport = require('passport');

// Auth with Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google Auth Callback
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect to dashboard.
    // Determine the frontend URL: prioritize environment variable, otherwise use current host
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const redirectPath = frontendUrl.endsWith('/') ? `${frontendUrl}dashboard` : `${frontendUrl}/dashboard`;
    
    // Safety check for production to ensure we don't accidentally redirect to the backend port
    const finalRedirect = redirectPath.replace(':3000', ':4200'); // Clean up any cross-port leakage in local dev
    
    res.redirect(finalRedirect);
  }
);

// Get current user
router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      ...req.user,
      isShadow: !!req.user.isShadow,
      dbStatus: require('mongoose').connection.readyState === 1 ? 'online' : 'shadow-mode'
    });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ message: 'Logged out' });
  });
});

module.exports = router;
