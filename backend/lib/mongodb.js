const mongoose = require('mongoose');
const { attachDatabasePool } = require('@vercel/functions');

/**
 * MongoDB Connection Management for Vercel Functions
 * Implements connection pool management to prevent leaks in serverless environments.
 */

let cachedConnection = null;

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (cachedConnection) {
    return await cachedConnection;
  }

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('CRITICAL: MONGODB_URI is missing');
    throw new Error('MONGODB_URI is not defined');
  }

  console.log('INFO: Initiating new MongoDB connection...');

  // Configure Mongoose for serverless stability
  const options = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  };

  cachedConnection = mongoose.connect(mongoURI, options);

  try {
    await cachedConnection;
    
    // Attach database pool for Vercel optimization
    // Mongoose uses the mongodb driver internally; getClient returns the MongoClient instance
    const client = mongoose.connection.getClient();
    if (client) {
      attachDatabasePool(client);
    }

    console.log('OK: Connected to MongoDB (Vercel Pool Attached)');
    return mongoose.connection;
  } catch (err) {
    cachedConnection = null;
    console.error('CRITICAL: MongoDB connection failed:', err.message);
    throw err;
  }
}

module.exports = { connectToDatabase };
