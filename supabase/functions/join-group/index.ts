import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function extractInviteCode(identifier: string): string | null {
  // Invite code: 8+ alphanumeric, case-insensitive
  if (/^[A-Z0-9]{8,}$/i.test(identifier)) {
    return identifier;
  }
  return null;
}

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
          error: "كود الدعوة مطلوب.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }
    const invite_code = extractInviteCode(group_identifier);
    if (!invite_code) {
      return new Response(
        JSON.stringify({
          error: "تنسيق كود الدعوة غير صحيح.",
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
          error: "المستخدم غير مصرح به.",
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
          error: "المستخدم غير موجود في قاعدة البيانات التطبيقية.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }
    const appUserId = userRow.id;

    // 4. Robust group lookup (accept group_id, invite_code, or share code)
    let groupQuery = userClient
      .from("groups")
      .select("id, name, password, privacy_level");
    groupQuery = groupQuery.ilike("invite_code", invite_code);
    const { data: group, error: groupError } = await groupQuery.maybeSingle();
    if (groupError || !group) {
      return new Response(
        JSON.stringify({
          error:
            "المجموعة غير موجودة أو غير متاحة. يرجى مراجعة كود الدعوة وإعادة المحاولة.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Call the DB function to handle all logic (membership, password, etc)
    const { data: joinResult, error: rpcError } = await userClient.rpc(
      "join_group_securely",
      {
        p_user_id: appUserId,
        p_group_identifier: group.id, // Always use the resolved group_id for DB call
        p_password: password ?? null,
      }
    );
    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If already a member or joined successfully, return success
    if (joinResult?.success) {
      return new Response(JSON.stringify(joinResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If password is required and not provided, prompt for password
    if (joinResult?.error === "كلمة المرور مطلوبة" || joinResult?.is_private) {
      return new Response(
        JSON.stringify({
          is_private: true,
          group_name: group.name,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If password is wrong or other error, return error
    if (joinResult?.error) {
      return new Response(JSON.stringify({ error: joinResult.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: return the raw result
    return new Response(JSON.stringify(joinResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
