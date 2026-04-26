const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// --- Helper: Generate Token ---
const generateToken = (user, isShadow = false) => {
  const payload = {
    _id: user._id,
    googleId: user.googleId,
    email: user.email,
    displayName: user.displayName,
    isShadow: !!isShadow,
    config: user.config
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// --- Google Auth Routes ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login?error=google' }), (req, res) => {
  const token = generateToken(req.user);
  // Redirect to frontend with token in URL (frontend will save it and redirect)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  res.redirect(`${frontendUrl}/dashboard?token=${token}`);
});

// --- Local Auth Routes ---

// Signup
router.post('/signup', async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      displayName: displayName || email.split('@')[0]
    });

    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: info.message || 'Login failed' });

    const token = generateToken(user);
    res.json({ token, user });
  })(req, res, next);
});

// Get current user via local token payload
router.get('/user', verifyToken, async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    let freshUser = req.user;

    if (isDbConnected && !req.user.isShadow) {
      const dbUser = await User.findById(req.user._id);
      if (!dbUser) {
        return res.status(401).json({ message: 'User record no longer exists' });
      }
      freshUser = { ...req.user, ...dbUser.toObject() };
    }

    res.json({
      ...freshUser,
      dbStatus: isDbConnected ? 'online' : 'shadow-mode'
    });
  } catch (err) {
    console.error('Fetch user error:', err);
    res.status(500).json({ message: 'Failed to fetch user data' });
  }
});

module.exports = router;
