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
    // Dynamically resolve the frontend URL based on the current request
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;
    
    // Redirect to /dashboard on the same host (since Vercel hosts both on one domain)
    const finalRedirect = baseUrl.endsWith('/') ? `${baseUrl}dashboard` : `${baseUrl}/dashboard`;
    
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
