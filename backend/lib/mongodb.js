const mongoose = require('mongoose');
const { attachDatabasePool } = require('@vercel/functions');

/**
 * MongoDB Connection Management for Vercel Functions
 * Implements connection pool management to prevent leaks in serverless environments.
 */

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

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('[MongoDB] CRITICAL: MONGODB_URI is missing');
    throw new Error('MONGODB_URI is not defined');
  }

  console.log('[MongoDB] Initiating new connection...');

  // Configure Mongoose for serverless stability
  const options = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  };

  cachedConnection = mongoose.connect(mongoURI, options);

  try {
    console.log('[MongoDB] Awaiting mongoose.connect...');
    await cachedConnection;
    
    console.log('[MongoDB] Successfully connected. Retrieving client for pooling...');
    const client = mongoose.connection.getClient();
    
    if (client) {
      console.log('[MongoDB] Client found. Attaching Vercel database pool...');
      try {
        attachDatabasePool(client);
        console.log('[MongoDB] Vercel Pool Attached successfully.');
      } catch (poolErr) {
        console.warn('[MongoDB] attachDatabasePool failed (ignoring):', poolErr.message);
      }
    } else {
      console.warn('[MongoDB] No client found; skipping pool attachment.');
    }

    console.log('[MongoDB] OK: Connection fully established.');
    return mongoose.connection;
  } catch (err) {
    cachedConnection = null;
    console.error('[MongoDB] CRITICAL: MongoDB connection failed:', err.message);
    throw err;
  }
}

module.exports = { connectToDatabase };
