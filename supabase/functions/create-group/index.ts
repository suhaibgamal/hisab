/// <reference types="https://deno.land/x/super_deno@4.8.0/src/deno.d.ts" />

// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// --- START: Self-Contained Base64 Code ---
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
// --- END: Self-Contained Base64 Code ---

// PBKDF2 parameters for password hashing.
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // 128 bits

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
    ["encrypt", "decrypt"]
  );
  const keyData = await crypto.subtle.exportKey("raw", key);
  return `${encode(salt)}:${encode(new Uint8Array(keyData))}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_name, password, user_id, user_display_name } =
      await req.json();
    if (!group_name || !user_id) {
      throw new Error("Group name and user ID are required.");
    }

    let password_hash = null;
    if (password) {
      password_hash = await hashPassword(password);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    // First, get the user's display name from the database
    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("display_name, username")
      .eq("id", user_id)
      .single();

    if (userError) {
      console.error("Error fetching user data:", userError);
      throw userError;
    }

    const displayName =
      user_display_name ||
      userData.display_name ||
      userData.username ||
      "مستخدم";

    const { error: rpcError } = await supabaseAdmin.rpc(
      "create_group_with_manager",
      {
        p_group_name: group_name,
        p_password_hash: password_hash,
        p_user_id: user_id,
        p_user_display_name: displayName,
      }
    );

    if (rpcError) {
      console.error("RPC Error:", rpcError);
      throw rpcError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in create-group function:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.details,
        code: error.code,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
