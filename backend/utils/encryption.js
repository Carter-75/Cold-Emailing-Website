const crypto = require('crypto');

/**
 * Robust Encryption Utility (AES-256-GCM)
 * Provides transparent security for database fields
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

function getSecret() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CRITICAL: ENCRYPTION_KEY is missing from environment variables!');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypt a string
 */
function encrypt(text) {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecret(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string
 */
function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

  try {
    const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');
    
    if (!ivHex || !authTagHex || !encryptedData) return encryptedText;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getSecret(), iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.warn('Decryption failed. Returning original value (might be plain text):', err.message);
    return encryptedText;
  }
}

module.exports = { encrypt, decrypt };
