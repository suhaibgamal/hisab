import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// PBKDF2 parameters for password hashing
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

const decode = (base64url: string): Uint8Array => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
};

// Verify a password against a stored hash
const verifyPassword = async (
  password: string,
  storedHash: string
): Promise<boolean> => {
  try {
    // Parse hash components
    const parts = storedHash.split(":");
    let saltB64, keyB64;

    // Handle versioned and unversioned hashes
    if (parts.length === 3 && parts[0] === "v1") {
      [, saltB64, keyB64] = parts;
    } else if (parts.length === 2) {
      [saltB64, keyB64] = parts;
    } else {
      console.log("[Debug] Invalid hash format");
      return false;
    }

    if (!saltB64 || !keyB64) {
      console.log("[Debug] Missing salt or key");
      return false;
    }

    const salt = decode(saltB64);
    const storedKey = decode(keyB64);

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get request body
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: "Request body must be valid JSON",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const { group_code, group_id, password } = body;

    // Validate input
    if (!group_code && !group_id) {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          details: "Either group code or group ID must be provided",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: "No authorization header",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Create Supabase client with user's auth token for initial checks
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Create admin client with service role key for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Get auth user
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !authUser) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: "Invalid or expired session",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Get app user with retry logic
    let appUser = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (!appUser && retryCount < maxRetries) {
      const { data: userData, error: appUserError } = await supabase
        .from("users")
        .select("id, display_name, username")
        .eq("supabase_auth_id", authUser.id)
        .single();

      if (!appUserError && userData) {
        appUser = userData;
        break;
      }

      // If error is not a not-found error, break immediately
      if (appUserError && !appUserError.message.includes("not found")) {
        return new Response(
          JSON.stringify({
            error: "Failed to fetch user data",
            details: appUserError.message,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      // Wait before retry
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (retryCount + 1))
      );
      retryCount++;
    }

    if (!appUser) {
      return new Response(
        JSON.stringify({
          error: "User not found",
          details: "Please ensure you have completed the registration process",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Get group data using admin client
    let groupQuery = supabaseAdmin.from("groups").select("*");
    if (group_code) {
      groupQuery = groupQuery.eq("invite_code", group_code);
    } else {
      groupQuery = groupQuery.eq("id", group_id);
    }

    const { data: groupData, error: groupError } =
      await groupQuery.maybeSingle();

    if (groupError) {
      return new Response(
        JSON.stringify({
          error: "Database error",
          details: groupError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (!groupData) {
      return new Response(
        JSON.stringify({
          error: "Group not found",
          details: group_code
            ? "The invite code is invalid or has expired"
            : "The group does not exist",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Check if already a member using admin client
    const { data: memberData, error: memberError } = await supabaseAdmin
      .from("group_members")
      .select("*")
      .eq("group_id", groupData.id)
      .eq("user_id", appUser.id)
      .maybeSingle();

    if (memberError) {
      return new Response(
        JSON.stringify({
          error: "Database error",
          details: memberError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (memberData) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Already a member of this group",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // If using invite code, check if it's visible
    if (group_code && !groupData.invite_code_visible) {
      return new Response(
        JSON.stringify({
          error: "Invalid invite code",
          details: "This invite code is no longer valid",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // If it's a private group and no password provided
    if (groupData.password && !password) {
      return new Response(
        JSON.stringify({
          is_private: true,
          group_id: groupData.id,
          group_name: groupData.name,
          password_hash: groupData.password,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // If it's a private group, verify password
    if (groupData.password) {
      const isValidPassword = await verifyPassword(
        password,
        groupData.password
      );
      if (!isValidPassword) {
        return new Response(
          JSON.stringify({
            error: "Invalid password",
            details: "The password you entered is incorrect",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          }
        );
      }
    }

    // Add user to group using admin client
    const { error: joinError } = await supabaseAdmin
      .from("group_members")
      .insert({
        group_id: groupData.id,
        user_id: appUser.id,
        role: "member",
      });

    if (joinError) {
      return new Response(
        JSON.stringify({
          error: "Failed to join group",
          details: joinError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Log activity using admin client
    await supabaseAdmin.functions.invoke("log_activity", {
      body: {
        group_id: groupData.id,
        action_type: "member_joined",
        payload: {
          memberName: appUser.display_name || appUser.username || "مستخدم",
        },
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Successfully joined the group",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
