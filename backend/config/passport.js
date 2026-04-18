const passport = require('passport');
const mongoose = require('mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER',
    callbackURL: '/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const isDbConnected = mongoose.connection.readyState === 1;
      
      if (!isDbConnected) {
        console.log('INFO: Shadow Mode Auth - Creating in-memory user for', profile.emails[0].value);
        const shadowUser = {
          _id: 'shadow_' + profile.id,
          googleId: profile.id,
          email: profile.emails[0].value,
          displayName: profile.displayName,
          isShadow: true,
          config: {
            senderName: profile.displayName.split(' ')[0],
            senderEmail: profile.emails[0].value
          },
          stats: { emailsSent: 0, replies: 0 }
        };
        return done(null, shadowUser);
      }

      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          displayName: profile.displayName
        });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  const id = user.id || user._id;
  if (user.isShadow) {
    // For shadow users, serialize the full config so it persists across session requests
    done(null, { 
      id, 
      isShadow: true, 
      displayName: user.displayName, 
      email: user.email,
      config: user.config 
    });
  } else {
    done(null, id);
  }
});

passport.deserializeUser(async (data, done) => {
  try {
    if (data && data.isShadow) {
      return done(null, {
        _id: data.id,
        googleId: data.id.replace('shadow_', ''),
        email: data.email,
        displayName: data.displayName,
        isShadow: true,
        stats: { emailsSent: 0, replies: 0 },
        config: data.config
      });
    }

    const user = await User.findById(data);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});
