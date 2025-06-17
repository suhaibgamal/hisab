import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// PBKDF2 parameters for password hashing.
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // 128 bits

// Base64 encoding map
const ENCODE_MAP =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

// Base64 encoding/decoding functions
const encode = (buffer: Uint8Array): string => {
  let output = "";
  for (let i = 0; i < buffer.length; i += 3) {
    const byte1 = buffer[i];
    const byte2 = buffer[i + 1];
    const byte3 = buffer[i + 2];
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

// Hash a password using PBKDF2
const hashPassword = async (password: string): Promise<string> => {
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
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      group_id,
      name,
      description,
      password,
      member_limit,
      invite_code_visible,
      auto_approve_members,
      activity_log_privacy,
      export_control,
    } = await req.json();

    // Validate required fields
    if (!group_id || !name) {
      throw new Error("Group ID and name are required.");
    }

    // Validate member limit if provided
    if (member_limit !== undefined && member_limit !== null) {
      if (!Number.isInteger(member_limit) || member_limit < 2) {
        throw new Error("Member limit must be an integer greater than 1.");
      }
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    let password_hash = undefined; // Default to undefined to not update password
    // Only hash password if it's provided and non-empty
    if (password?.trim()) {
      password_hash = await hashPassword(password.trim());
    }

    const { error: rpcError } = await userClient.rpc("update_group_settings", {
      p_group_id: group_id,
      p_name: name,
      p_description: description,
      p_password_hash: password_hash, // Only send if password was provided
      p_member_limit: member_limit,
      p_invite_code_visible: invite_code_visible,
      p_auto_approve_members: auto_approve_members,
      p_activity_log_privacy: activity_log_privacy,
      p_export_control: export_control,
    });

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
