// PBKDF2 parameters for password hashing
const PBKDF2_CONFIG = {
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: 100000,
  outputBits: 256,
};
const SALT_LENGTH = 16; // 128 bits

// Base64 encoding map
const ENCODE_MAP =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

// Base64 encoding/decoding functions
export const encode = (buffer) => {
  let output = "";
  const data = new Uint8Array(buffer);
  for (let i = 0; i < data.length; i += 3) {
    const byte1 = data[i];
    const byte2 = data[i + 1];
    const byte3 = data[i + 2];
    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
    let enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
    let enc4 = byte3 & 63;
    if (isNaN(byte2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(byte3)) {
      enc4 = 64;
    }
    output +=
      ENCODE_MAP.charAt(enc1) +
      ENCODE_MAP.charAt(enc2) +
      ENCODE_MAP.charAt(enc3) +
      ENCODE_MAP.charAt(enc4);
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

const DECODE_MAP = new Uint8Array([
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255,
  255, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 64, 255, 255,
  255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 255, 255, 255, 255, 255, 255, 26, 27, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
]);

export const decode = (b64) => {
  const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = new Uint8Array((base64.length / 4) * 3);
  let binIndex = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const c1 = DECODE_MAP[base64.charCodeAt(i)];
    const c2 = DECODE_MAP[base64.charCodeAt(i + 1)];
    const c3 = DECODE_MAP[base64.charCodeAt(i + 2)];
    const c4 = DECODE_MAP[base64.charCodeAt(i + 3)];
    bin[binIndex++] = (c1 << 2) | (c2 >> 4);
    if (c3 < 64) bin[binIndex++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 < 64) bin[binIndex++] = ((c3 & 3) << 6) | c4;
  }
  return bin.subarray(0, binIndex);
};

// Convert Uint8Array to base64url
const toBase64url = (buffer) => {
  const bin = String.fromCharCode(...new Uint8Array(buffer));
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Convert base64url to Uint8Array
const toUint8Array = (b64url) => {
  const b64 =
    b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

// Hash a password using PBKDF2
export const hashPassword = async (password) => {
  try {
    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    // Derive bits directly
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: PBKDF2_CONFIG.name,
        hash: PBKDF2_CONFIG.hash,
        salt,
        iterations: PBKDF2_CONFIG.iterations,
      },
      keyMaterial,
      PBKDF2_CONFIG.outputBits
    );

    const derivedKey = new Uint8Array(derivedBits);
    // Add version prefix for future compatibility
    return `v1:${toBase64url(salt)}:${toBase64url(derivedKey)}`;
  } catch (error) {
    console.error("Error hashing password:", error);
    throw error;
  }
};

// Verify a password against a stored hash
export const verifyPassword = async (password, storedHash) => {
  try {
    console.log("[Debug] Starting verification for hash:", storedHash);

    // Parse hash components
    const parts = storedHash.split(":");
    let saltB64url, keyB64url;

    // Handle versioned and unversioned hashes
    if (parts.length === 3 && parts[0] === "v1") {
      [, saltB64url, keyB64url] = parts;
    } else if (parts.length === 2) {
      [saltB64url, keyB64url] = parts;
    } else {
      console.log("[Debug] Invalid hash format");
      return false;
    }

    if (!saltB64url || !keyB64url) {
      console.log("[Debug] Missing salt or key");
      return false;
    }

    const salt = toUint8Array(saltB64url);
    const storedKey = toUint8Array(keyB64url);
    const passwordBytes = new TextEncoder().encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    // Derive bits directly
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: PBKDF2_CONFIG.name,
        hash: PBKDF2_CONFIG.hash,
        salt,
        iterations: PBKDF2_CONFIG.iterations,
      },
      keyMaterial,
      PBKDF2_CONFIG.outputBits
    );

    const derivedKey = new Uint8Array(derivedBits);

    // Constant-time comparison
    if (storedKey.length !== derivedKey.length) {
      console.log("[Debug] Key length mismatch");
      return false;
    }

    let result = true;
    for (let i = 0; i < storedKey.length; i++) {
      result = result && storedKey[i] === derivedKey[i];
    }

    console.log("[Debug] Verification result:", result);
    return result;
  } catch (error) {
    console.error("[Debug] Error verifying password:", error);
    return false;
  }
};

// Test function to verify password hashing and verification
export const testPasswordHash = async () => {
  console.log("=== Password Hash Test ===");

  // Test case 1: Simple password
  const testPassword = "123456";
  console.log("[Test] Password:", testPassword);

  // Generate hash
  console.log("\n[Step 1] Generating hash...");
  const hash = await hashPassword(testPassword);
  console.log("[Hash] Generated hash:", hash);

  // Verify correct password
  console.log("\n[Step 2] Verifying correct password...");
  const correctResult = await verifyPassword(testPassword, hash);
  console.log("[Verify] Correct password result:", correctResult);

  // Verify wrong password
  console.log("\n[Step 3] Verifying wrong password...");
  const wrongResult = await verifyPassword("wrong" + testPassword, hash);
  console.log("[Verify] Wrong password result:", wrongResult);

  // Test case 2: Known test vector
  console.log("\n[Step 4] Testing against known vector...");
  const knownHash =
    "p2abCLyrYS-BvMsEU_hSRg:cAyQRrP88Kw1LjoBToPVljwR52wpyx8ZsgWqM4ciE3g";
  const knownResult = await verifyPassword(testPassword, knownHash);
  console.log("[Known] Hash:", knownHash);
  console.log("[Known] Result:", knownResult);

  return {
    newHashVerification: correctResult,
    wrongPasswordTest: !wrongResult,
    knownVectorTest: knownResult,
  };
};
