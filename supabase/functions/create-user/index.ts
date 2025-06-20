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

    const { username, password, displayName } = await req.json();

    // --- Input Validation ---
    if (!username || !password || !displayName) {
      return new Response(
        JSON.stringify({
          error: "Username, password, and display name are required.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return new Response(
        JSON.stringify({
          error:
            "Username must be 3-30 characters (lowercase letters, numbers, underscores).",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (displayName.length < 1 || displayName.length > 50) {
      return new Response(
        JSON.stringify({
          error: "Display name must be between 1 and 50 characters.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    // --- End Input Validation ---

    const email = `${username}@hisab.local`;

    // 1. Create the auth user in Supabase Auth
    const {
      data: { user: authUser },
      error: signUpError,
    } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm user
    });

    if (signUpError) {
      console.error("Sign-up error:", signUpError.message);
      if (signUpError.message.includes("User already registered")) {
        return new Response(
          JSON.stringify({
            error: "A user with this username already exists.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw new Error("Failed to create authentication profile.");
    }

    // 2. Create the public user profile in our `users` table
    const { data: newUserProfile, error: createProfileError } =
      await supabaseAdmin.rpc("create_user_profile", {
        p_username: username,
        p_display_name: displayName,
        p_supabase_auth_id: authUser.id,
      });

    if (createProfileError) {
      console.error(
        "Failed to create user profile, rolling back auth user:",
        createProfileError.message
      );
      // Critical: If profile creation fails, delete the orphaned auth user.
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      throw new Error(
        "We couldn't create your user profile after registration. Please try again."
      );
    }

    // 3. Sign in the newly created user to get a session
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.session) {
      console.error(
        "Failed to sign in new user after creation:",
        signInError?.message
      );
      throw new Error(
        "Your account was created, but we failed to sign you in. Please try logging in manually."
      );
    }

    return new Response(
      JSON.stringify({ user: newUserProfile, session: signInData.session }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Critical error in create-user:", error.message);
    const message =
      error.message ||
      "An unexpected server error occurred during registration.";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
