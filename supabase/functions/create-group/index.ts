/// <reference types="https://deno.land/x/super_deno@4.8.0/src/deno.d.ts" />

// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

console.log("Create Group Function Started");

// PBKDF2 parameters for password hashing
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // 128 bits

// Hash a password using PBKDF2
const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256 // bits
  );

  const derivedKey = new Uint8Array(derivedBits);
  // Add version prefix for future compatibility
  return `v1:${encode(salt)}:${encode(derivedKey)}`;
};

// --- START: Self-Contained Base64 Code ---
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
// --- END: Self-Contained Base64 Code ---

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    // Get the request body
    const body = await req.json();

    // Validate required fields
    const requiredFields = ["name"];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(
          JSON.stringify({
            error: `Missing required field: ${field}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "No authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get user data
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Error getting user data",
          details: userError,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get application user ID
    const { data: userData, error: userDataError } = await supabaseClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();

    if (userDataError || !userData) {
      return new Response(
        JSON.stringify({
          error: "Error getting application user data",
          details: userDataError,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call the database function to create the group
    const { data, error } = await supabaseClient.rpc(
      "create_group_with_manager",
      {
        p_group_name: body.name,
        p_description: body.description || null,
        p_password: body.password || null,
        p_member_limit: body.member_limit || 10,
        p_invite_code_visible: body.invite_code_visible ?? true,
        p_auto_approve_members: body.auto_approve_members ?? true,
        p_activity_log_privacy: body.activity_log_privacy || "managers",
        p_export_control: body.export_control || "managers",
        p_user_id: userData.id,
      }
    );

    if (error) {
      return new Response(
        JSON.stringify({
          error: "Error creating group",
          details: error,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ group_id: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
