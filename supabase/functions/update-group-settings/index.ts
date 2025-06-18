import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { hashPassword } from "../_shared/password.ts";
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  try {
    const {
      group_id,
      name,
      description,
      password,
      member_limit,
      invite_code_visible,
      activity_log_privacy,
      export_control,
    } = await req.json();
    // Validate required fields
    if (!group_id || !name) {
      throw new Error("Group ID and name are required.");
    }
    // --- START OF FIX ---
    let parsed_member_limit = member_limit; // Use original value by default
    // Validate and parse member limit if it was provided
    if (parsed_member_limit !== undefined && parsed_member_limit !== null) {
      // First, convert the value from a string to a number
      parsed_member_limit = parseInt(parsed_member_limit, 10);
      // Now, check if the conversion failed (e.g., for "abc") or if the number is invalid
      if (isNaN(parsed_member_limit) || parsed_member_limit < 2) {
        throw new Error(
          "Member limit must be a valid integer of 2 or greater."
        );
      }
    }
    // --- END OF FIX ---
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization"),
          },
        },
      }
    );
    let password_hash = null;
    if (password) {
      password_hash = await hashPassword(password);
    }
    const { error: rpcError } = await userClient.rpc("update_group_settings", {
      p_group_id: group_id,
      p_name: name,
      p_description: description,
      p_password_hash: password_hash,
      p_member_limit: parsed_member_limit ?? null,
      p_invite_code_visible: invite_code_visible ?? null,
      p_activity_log_privacy: activity_log_privacy ?? null,
      p_export_control: export_control ?? null,
    });
    if (rpcError) throw rpcError;
    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in update-group-settings:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
