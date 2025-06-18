// PBKDF2 parameters for password hashing
const PBKDF2_CONFIG = {
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: 100000,
  outputBits: 256,
};
const SALT_LENGTH = 16; // 128 bits

// Base64URL encoding/decoding functions
export const encode = (buffer) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

export const decode = (base64url) => {
  const base64 =
    base64url.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

// Verify a password against a stored hash
export async function verifyPassword(password, storedHash) {
  try {
    // Parse hash components
    const [version, saltB64url, keyB64url] = storedHash.split(":");

    if (!version || !saltB64url || !keyB64url) {
      return false;
    }

    // Convert base64url to bytes
    const salt = decode(saltB64url);
    const storedKey = decode(keyB64url);
    const passwordBytes = new TextEncoder().encode(password.trim());

    // Import key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    // Derive key using PBKDF2
    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_CONFIG.iterations,
        hash: PBKDF2_CONFIG.hash,
      },
      keyMaterial,
      PBKDF2_CONFIG.outputBits
    );

    // Compare keys
    const derivedKeyBase64url = encode(new Uint8Array(derivedKey));
    return derivedKeyBase64url === keyB64url;
  } catch (error) {
    console.error("Error verifying password:", error);
    throw error;
  }
}

// Helper functions
function base64ToBase64url(b64) {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binStr = atob(b64);
  const arr = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return arr;
}
