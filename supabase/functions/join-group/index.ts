import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  try {
    // 1. Parse + validate input
    const { group_identifier, password } = await req.json();
    if (!group_identifier) {
      return new Response(
        JSON.stringify({
          error: "Group identifier is required.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }
    // 2. Initialize a Supabase client with the user's JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization"),
          },
        },
      }
    );
    // 3. Verify authentication
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "User not authenticated.",
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }
    // 3.5. Map Supabase Auth user id to app user id
    const { data: userRow, error: userRowError } = await userClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();
    if (userRowError || !userRow) {
      return new Response(
        JSON.stringify({
          error: "User not found in application database.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }
    const appUserId = userRow.id;
    // 4. Call the DB function, ALWAYS including p_password (even if null)
    const { data, error: rpcError } = await userClient.rpc(
      "join_group_securely",
      {
        p_user_id: appUserId,
        p_group_identifier: group_identifier,
        p_password: password ?? null,
      }
    );
    if (rpcError) {
      // Return the function's error message
      return new Response(
        JSON.stringify({
          error: rpcError.message,
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }
    // 5. Return the payload from your DB function
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    // Catch parse errors, network issues, etc.
    return new Response(
      JSON.stringify({
        error: err.message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
