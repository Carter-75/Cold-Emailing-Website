const express = require('express');
const router = express.Router();
const { issueToken } = require('../services/session-token');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { catchAsync } = require('../middleware/error');

const generateToken = issueToken;

// --- Google Auth Routes ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', (req, res, next) => {
  // OAuth codes must never be logged.
    passport.authenticate('google', (err, user, info) => {
      const host = req.get('host') || '';
      const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');
      const frontendUrl = isLocalHost ? 'http://localhost:4200' : (process.env.PROD_FRONTEND_URL || 'https://cold-emailing-website.vercel.app');

      if (err || !user) {
        console.error('❌ Google Auth Error:', err || info);
        return res.redirect(`${frontendUrl}/dashboard?error=google`);
      }
      
      const token = generateToken(user);
      console.log(`✅ Google Login Successful: ${user.email}`);
      res.redirect(`${frontendUrl}/dashboard#token=${token}`);
    })(req, res, next);
});

// --- Local Auth Routes ---

// Signup
router.post('/signup', catchAsync(async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(400).json({ message: 'User already exists' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: email.toLowerCase(),
    password: hashedPassword,
    displayName: displayName || email.split('@')[0]
  });

  const token = generateToken(user);
  const publicUser = user.toObject();
  delete publicUser.password;
  res.status(201).json({ token, user: publicUser });
}));

// Login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: info.message || 'Login failed' });

    const token = generateToken(user);
    const publicUser = user.toObject();
    delete publicUser.password;
    res.json({ token, user: publicUser });
  })(req, res, next);
});

// Get current user via local token payload
router.get('/me', verifyToken, catchAsync(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'Account settings are temporarily unavailable. Retry shortly.' });
  }
  const dbUser = await User.findById(req.user._id).select('-password');
  if (!dbUser) return res.status(401).json({ message: 'User record no longer exists' });
  res.json({ ...dbUser.toObject(), dbStatus: 'online' });
}));

module.exports = router;
