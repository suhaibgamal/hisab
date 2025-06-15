import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.js";

console.log("log_activity function initialized");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, action_type, payload } = await req.json();
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );

    // 1. Create a client scoped to the user to validate their identity.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("User not found");

    // 2. Create a separate, privileged admin client to perform database operations.
    //    This client does NOT have the user's auth header and uses the service role key.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Look up the internal user ID from the public.users table using the admin client.
    const { data: appUser, error: appUserError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();

    if (appUserError) throw appUserError;
    if (!appUser) throw new Error("Application user profile not found");

    // Insert the log into the activity_logs table using the admin client.
    const { error: logError } = await supabaseAdmin
      .from("activity_logs")
      .insert({
        group_id,
        user_id: appUser.id, // Use the internal profile ID
        action_type,
        payload,
      });

    if (logError) throw logError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in log_activity function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
