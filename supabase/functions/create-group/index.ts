/// <reference types="https://deno.land/x/super_deno@4.8.0/src/deno.d.ts" />

// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      name,
      description,
      password,
      member_limit,
      privacy_level,
      activity_log_privacy,
      export_control,
      currency,
    } = await req.json();

    // Create a Supabase client with the user's auth token
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 1. Get the authenticated user's database ID
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "المستخدم غير مصرح به" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userDataError } = await supabaseClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();

    if (userDataError || !userData) {
      return new Response(
        JSON.stringify({ error: "User not found in database" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine context-aware defaults
    const isPrivate =
      privacy_level === "private" || (password && password.length > 0);
    const final_activity_log_privacy =
      activity_log_privacy ?? (isPrivate ? "managers" : "all");
    const final_export_control =
      export_control ?? (isPrivate ? "managers" : "all");
    const final_member_limit = member_limit ?? 10;

    // 2. Call the new database function to handle creation
    const { data: newGroup, error: rpcError } = await supabaseClient
      .rpc("create_new_group", {
        p_user_id: userData.id,
        p_name: name,
        p_description: description ?? null,
        p_privacy_level: privacy_level ?? null,
        p_password: password ?? null,
        p_member_limit: final_member_limit,
        p_activity_log_privacy: final_activity_log_privacy,
        p_export_control: final_export_control,
        p_currency: currency,
      })
      .select()
      .single();

    if (rpcError) {
      // The database function will raise a specific exception on validation failure
      throw new Error(rpcError.message);
    }

    return new Response(JSON.stringify(newGroup), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400, // Use 400 for client-side errors (e.g., validation)
    });
  }
});

function generateInviteCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
