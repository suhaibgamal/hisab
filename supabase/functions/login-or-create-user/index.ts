// Enable Supabase Edge-runtime types
// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// --- START: Self-Contained Base64 Code ---
// This code is pasted here directly to bypass the runtime's import bug.
const ENCODE_MAP =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function encode(data: Uint8Array): string {
  let output = "";
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
  return output;
}

const DECODE_MAP = new Uint8Array([
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255,
  255, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 64, 255, 255,
  255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 255, 255, 255, 255, 255, 255, 26, 27, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
]);

function decode(b64: string): Uint8Array {
  const bin = new Uint8Array((b64.length / 4) * 3);
  let binIndex = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const c1 = DECODE_MAP[b64.charCodeAt(i)];
    const c2 = DECODE_MAP[b64.charCodeAt(i + 1)];
    const c3 = DECODE_MAP[b64.charCodeAt(i + 2)];
    const c4 = DECODE_MAP[b64.charCodeAt(i + 3)];
    bin[binIndex++] = (c1 << 2) | (c2 >> 4);
    if (c3 < 64) bin[binIndex++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 < 64) bin[binIndex++] = ((c3 & 3) << 6) | c4;
  }
  return bin.subarray(0, binIndex);
}
// --- END: Self-Contained Base64 Code ---

// PBKDF2 parameters for password hashing.
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    ),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"] // Corrected key usages
  );
  const keyData = await crypto.subtle.exportKey("raw", key);
  return `${encode(salt)}:${encode(new Uint8Array(keyData))}`;
}

async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const [saltBase64, keyBase64] = storedHash.split(":");
    if (!saltBase64 || !keyBase64) return false;

    const salt = decode(saltBase64);
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      ),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"] // Corrected key usages
    );
    const keyData = await crypto.subtle.exportKey("raw", derivedKey);
    return encode(new Uint8Array(keyData)) === keyBase64;
  } catch (error) {
    console.error("Error verifying password:", error);
    return false;
  }
}

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { username, password, displayName } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // First check if user exists in our users table
    const { data: existingUser, error: fetchErr } = await supabaseAdmin
      .from("users")
      .select("id, username, display_name, password_hash, supabase_auth_id")
      .eq("username", username)
      .single();

    if (fetchErr && fetchErr.code !== "PGRST116") {
      throw fetchErr;
    }

    let user;
    let session;

    if (existingUser) {
      // Verify password
      const isValidPassword = await verifyPassword(
        password,
        existingUser.password_hash
      );

      if (!isValidPassword) {
        return new Response(
          JSON.stringify({ error: "Invalid username or password." }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // If user exists but no auth_id, create auth user
      if (!existingUser.supabase_auth_id) {
        const { data: authData, error: signUpError } =
          await supabaseAdmin.auth.admin.createUser({
            email: `${username}@hisab.local`,
            password: password,
            email_confirm: true,
          });

        if (signUpError) throw signUpError;

        // Update user with auth_id
        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update({ supabase_auth_id: authData.user.id })
          .eq("id", existingUser.id);

        if (updateError) throw updateError;

        // Get session
        const {
          data: { session: newSession },
          error: signInError,
        } = await supabaseAdmin.auth.signInWithPassword({
          email: `${username}@hisab.local`,
          password: password,
        });

        if (signInError) throw signInError;
        session = newSession;
      } else {
        // User exists and has auth_id, just sign in
        const {
          data: { session: existingSession },
          error: signInError,
        } = await supabaseAdmin.auth.signInWithPassword({
          email: `${username}@hisab.local`,
          password: password,
        });

        if (signInError) throw signInError;
        session = existingSession;
      }

      const { password_hash, supabase_auth_id, ...userData } = existingUser;
      user = userData;
    } else {
      // New user registration
      if (!displayName) {
        return new Response(
          JSON.stringify({ error: "Display name is required for new users." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Create auth user first
      const { data: authData, error: signUpError } =
        await supabaseAdmin.auth.admin.createUser({
          email: `${username}@hisab.local`,
          password: password,
          email_confirm: true,
        });

      if (signUpError) throw signUpError;

      // Create app user
      const password_hash = await hashPassword(password);
      const { data: newUser, error: createError } = await supabaseAdmin
        .from("users")
        .insert({
          username,
          display_name: displayName,
          password_hash,
          supabase_auth_id: authData.user.id,
        })
        .select("id, username, display_name")
        .single();

      if (createError) throw createError;

      // Sign in to get session
      const {
        data: { session: newSession },
        error: signInError,
      } = await supabaseAdmin.auth.signInWithPassword({
        email: `${username}@hisab.local`,
        password: password,
      });

      if (signInError) throw signInError;

      user = newUser;
      session = newSession;
    }

    if (!session?.access_token) {
      throw new Error("Failed to create session");
    }

    return new Response(
      JSON.stringify({
        user,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in login-or-create-user:", error);
    return new Response(
      JSON.stringify({
        error: "An unexpected error occurred",
        detail: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
