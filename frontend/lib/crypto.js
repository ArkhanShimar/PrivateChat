/**
 * End-to-End Encryption (E2EE) Utility
 * Using native Web Crypto API (SubtleCrypto)
 */

const ECDH_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
const AES_ALGO = { name: 'AES-GCM', length: 256 };

/**
 * Helper: ArrayBuffer to Base64
 */
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
}

/**
 * Helper: Base64 to ArrayBuffer
 */
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Generate a new identity key pair (ECDH)
 */
export async function generateIdentityKeys() {
  const pair = await window.crypto.subtle.generateKey(ECDH_ALGO, true, ['deriveKey', 'deriveBits']);
  const publicKey = await window.crypto.subtle.exportKey('spki', pair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey('pkcs8', pair.privateKey);
  
  return {
    publicKey: bufferToBase64(publicKey),
    privateKey: bufferToBase64(privateKey)
  };
}

/**
 * Derive a 256-bit AES key from a password using PBKDF2
 */
async function deriveWrappingKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt private key with the user's password for server storage
 */
export async function wrapPrivateKey(privateKeyB64, password, salt) {
  const wrappingKey = await deriveWrappingKey(password, salt);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    base64ToBuffer(privateKeyB64)
  );
  
  // Return IV + Ciphertext joined for storage
  return bufferToBase64(iv) + '.' + bufferToBase64(encrypted);
}

/**
 * Decrypt private key using user's password
 */
export async function unwrapPrivateKey(wrappedKeyStr, password, salt) {
  const [ivB64, ciphertextB64] = wrappedKeyStr.split('.');
  const wrappingKey = await deriveWrappingKey(password, salt);
  const iv = new Uint8Array(base64ToBuffer(ivB64));
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    base64ToBuffer(ciphertextB64)
  );
  
  return bufferToBase64(decrypted);
}

/**
 * Derive a shared secret between two users
 */
export async function deriveSharedSecret(ownPrivateB64, partnerPublicB64) {
  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8', base64ToBuffer(ownPrivateB64), ECDH_ALGO, false, ['deriveKey']
  );
  const publicKey = await window.crypto.subtle.importKey(
    'spki', base64ToBuffer(partnerPublicB64), ECDH_ALGO, false, []
  );
  
  return window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a text message
 */
export async function encryptMessage(text, aesKey) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(text)
  );
  
  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv)
  };
}

/**
 * Decrypt a text message
 */
export async function decryptMessage(ciphertextB64, ivB64, aesKey) {
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(ivB64)) },
      aesKey,
      base64ToBuffer(ciphertextB64)
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Decryption failed:', err);
    return '[Encrypted Message]';
  }
}
