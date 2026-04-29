const mongoose = require('mongoose');
const { attachDatabasePool } = require('@vercel/functions');

/**
 * MongoDB Connection Management for Vercel Functions
 * Implements connection pool management to prevent leaks in serverless environments.
 */

// Global Mongoose Configuration
mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', true);

let cachedConnection = null;

async function connectToDatabase() {
  console.log('[MongoDB] Entering connectToDatabase...');
  
  if (mongoose.connection.readyState === 1) {
    console.log('[MongoDB] Connection already active.');
    return mongoose.connection;
  }

  if (cachedConnection) {
    console.log('[MongoDB] Awaiting existing connection promise...');
    return await cachedConnection;
  }

  let mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('[MongoDB] CRITICAL: MONGODB_URI is missing');
    throw new Error('MONGODB_URI is not defined');
  }

  // Clean quotes if they leaked from .env
  mongoURI = mongoURI.replace(/^["'](.+)["']$/, '$1');

  console.log('[MongoDB] Initiating new connection...');

  // Configure Mongoose for serverless stability
  const options = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 8000, // Faster failure
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  };

  try {
    console.log('[MongoDB] Calling mongoose.connect...');
    
    // Create a timeout promise to prevent indefinite hangs
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MongoDB connection timed out after 10s')), 10000)
    );

    cachedConnection = mongoose.connect(mongoURI, options);
    
    // Race the connection against the timeout
    await Promise.race([cachedConnection, timeoutPromise]);
    
    console.log('[MongoDB] Successfully connected.');
    const client = mongoose.connection.getClient();
    
    if (client) {
      try {
        attachDatabasePool(client);
        console.log('[MongoDB] Vercel Pool Attached.');
      } catch (poolErr) {
        console.warn('[MongoDB] attachDatabasePool failed:', poolErr.message);
      }
    }

    return mongoose.connection;
  } catch (err) {
    cachedConnection = null;
    console.error('[MongoDB] Connection failed:', err.message);
    throw err;
  }
}

module.exports = { connectToDatabase };
