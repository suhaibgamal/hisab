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

    const { username, password, displayName, email } = await req.json();

    // --- Input Validation ---
    if (!username || !password || !displayName || !email) {
      return new Response(
        JSON.stringify({
          error: "Username, password, display name, and email are required.",
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
    // Email format validation (simple regex)
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    // --- End Input Validation ---

    // Check for duplicate email in users table
    const { data: existingUser, error: userQueryError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (userQueryError) {
      return new Response(
        JSON.stringify({ error: "Server error. Please try again later." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Email is already in use." }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
      if (signUpError.message.includes("User already registered")) {
        return new Response(
          JSON.stringify({ error: "A user with this email already exists." }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to create authentication profile." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Create the public user profile in our `users` table
    const { data: newUserProfile, error: createProfileError } =
      await supabaseAdmin
        .from("users")
        .insert({
          username,
          display_name: displayName,
          email,
          supabase_auth_id: authUser.id,
        })
        .select()
        .maybeSingle();

    if (createProfileError) {
      // Critical: If profile creation fails, delete the orphaned auth user.
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return new Response(
        JSON.stringify({
          error: "Failed to create user profile. Please try again.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Sign in the newly created user to get a session
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.session) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      await supabaseAdmin.from("users").delete().eq("id", newUserProfile.id);
      return new Response(
        JSON.stringify({
          error:
            "Your account was created, but we failed to sign you in. Please try logging in manually.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
    const message =
      error?.message ||
      "An unexpected server error occurred during registration.";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
