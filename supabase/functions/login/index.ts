// Enable Supabase Edge-runtime types
// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { username, password } = await req.json();

    // --- Input Validation ---
    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    // --- End Input Validation ---

    const email = `${username}@hisab.local`;

    // 1. Sign in the user with their credentials
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (signInError) {
      if (signInError.message.includes("Invalid login credentials")) {
        return new Response(
          JSON.stringify({ error: "Invalid username or password." }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw new Error(signInError.message);
    }

    // 2. Fetch the user's public profile
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("id, username, display_name, supabase_auth_id")
      .eq("supabase_auth_id", signInData.session.user.id)
      .single();

    if (profileError || !userProfile) {
      console.error(
        "Auth user exists but profile is missing:",
        profileError?.message
      );
      throw new Error(
        "Login succeeded, but we couldn't load your user profile. Please contact support."
      );
    }

    return new Response(
      JSON.stringify({ user: userProfile, session: signInData.session }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Critical error in login:", error.message);
    const message =
      error.message || "An unexpected server error occurred during login.";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
