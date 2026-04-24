const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google/verify', async (req, res) => {
  const { idToken } = req.body;
  
  if (!idToken) {
    return res.status(400).json({ message: 'Google ID Token is required' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    
    if (!payload) {
      throw new Error("Empty payload from Google");
    }

    const googleId = payload['sub'];
    const email = payload['email'];
    const displayName = payload['name'];

    const isDbConnected = mongoose.connection.readyState === 1;

    let user;
    let isShadow = false;
    
    if (!isDbConnected) {
      console.log('INFO: Shadow Mode Auth - Creating in-memory user for', email);
      user = {
        _id: 'shadow_' + googleId,
        googleId,
        email,
        displayName,
        isShadow: true,
        config: {
          senderName: displayName.split(' ')[0],
          senderEmail: email
        },
        stats: { emailsSent: 0, replies: 0 }
      };
      isShadow = true;
    } else {
      user = await User.findOne({ googleId });
      if (!user) {
        user = await User.findOne({ email });
        if (user) {
          user.googleId = googleId;
          if (!user.displayName) user.displayName = displayName;
          await user.save();
        } else {
          user = await User.create({ googleId, email, displayName });
        }
      }
      // mongoose document to object
      if (user.toObject) {
         user = user.toObject();
      }
    }

    // Create JWT containing everything needed statelessly
    const tokenPayload = {
      _id: user._id,
      googleId: user.googleId,
      email: user.email,
      displayName: user.displayName,
      isShadow: !!isShadow,
      config: user.config
    };
    
    const sessionToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token: sessionToken, user: { ...user, isShadow: !!isShadow, dbStatus: isDbConnected ? 'online' : 'shadow-mode' } });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

// Safety Catch: If Google redirects here (misconfigured Redirect URI), send them back to the frontend
router.get('/google/callback', (req, res) => {
  const frontendUrl = process.env.PROD_FRONTEND_URL || 'http://localhost:4200';
  console.warn('⚠️ Google redirected to /callback. Check Google Console "Redirect URIs". Redirecting user to frontend...');
  res.redirect(frontendUrl);
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
