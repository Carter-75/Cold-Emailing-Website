const mongoose = require('mongoose');
const { attachDatabasePool } = require('@vercel/functions');

/**
 * MongoDB Connection Management for Vercel Functions
 * Implements connection pool management to prevent leaks in serverless environments.
 */

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined');
    }

    const options = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(mongoURI, options).then((mongoose) => {
      console.log('OK: New MongoDB connection established');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = { connectToDatabase };
