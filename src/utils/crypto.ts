import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ''; // 32-byte key in hex (64 chars)

function getKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    // Return a fallback key buffer for development/testing if not fully set up
    // so the app doesn't crash, but log a warning.
    console.warn('WARNING: ENCRYPTION_KEY is not a valid 32-byte hex string. Using a development-only fallback key.');
    return crypto.scryptSync('friend-ring-fallback-salt-128', 'salt', 32);
  }
  return Buffer.from(ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypts a string using AES-256-GCM.
 * The output format is: iv_hex:auth_tag_hex:encrypted_hex
 */
export function encryptText(text: string): string {
  if (!text) return '';
  try {
    const key = getKeyBuffer();
    const iv = crypto.randomBytes(12); // 12-byte IV is standard for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    return text; // Fallback to plain text in case of fatal failure
  }
}

/**
 * Decrypts a string encrypted with AES-256-GCM.
 */
export function decryptText(encryptedText: string): string {
  if (!encryptedText) return '';
  
  // If the format doesn't match iv:tag:content, treat as unencrypted plain text (for safety/backward compatibility)
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    return encryptedText;
  }
  
  try {
    const [ivHex, tagHex, encryptedHex] = parts;
    const key = getKeyBuffer();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Encrypted Address - Decryption Error]';
  }
}

/**
 * Utility to partially mask an address string in the UI for privacy.
 * e.g., "123 Main Street, Apt 4B" -> "123 **** ******, *** **"
 */
export function maskAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 6) return '***';
  // Mask every alphanumeric character except first 3 and last 3 characters, keeping spaces/commas intact
  const prefix = address.slice(0, 3);
  const suffix = address.slice(-3);
  const middle = address.slice(3, -3).replace(/[a-zA-Z0-9]/g, '*');
  return `${prefix}${middle}${suffix}`;
}
