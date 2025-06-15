import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    const { group_code, group_id, password, check_only } = body;

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

    // Create admin client for operations that need elevated privileges
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get user's app ID
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return new Response(
        JSON.stringify({
          error: "Authentication error",
          details: userError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Get app user data
    const { data: appUser, error: appUserError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("supabase_auth_id", user.id)
      .maybeSingle();

    if (appUserError) {
      return new Response(
        JSON.stringify({
          error: "Database error",
          details: appUserError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
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
          redirect: true,
          group_id: groupData.id,
          message: "Already a member of this group",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // If this is just a check request, return group info
    if (check_only) {
      return new Response(
        JSON.stringify({
          group_id: groupData.id,
          group_name: groupData.name,
          requires_password: !!groupData.password,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // If it's a private group and no password provided
    if (groupData.password && !password) {
      return new Response(
        JSON.stringify({
          error: "Password required",
          details: "This is a private group. Please provide the password.",
          group_id: groupData.id,
          group_name: groupData.name,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    // If it's a private group, verify password
    if (groupData.password) {
      if (groupData.password !== password) {
        return new Response(
          JSON.stringify({
            error: "Invalid password",
            details: "The password you entered is incorrect",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
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

    // Log the join activity
    await supabaseAdmin.from("activity_logs").insert({
      group_id: groupData.id,
      user_id: appUser.id,
      action_type: "member_joined",
      payload: {
        user_name: appUser.display_name,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        group_id: groupData.id,
        message: "Successfully joined the group!",
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
