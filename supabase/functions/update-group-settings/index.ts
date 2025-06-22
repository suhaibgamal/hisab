import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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
      privacy_level,
    } = await req.json();

    // Extract user_id from JWT
    function parseJwt(token) {
      if (!token) return {};
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(jsonPayload);
    }
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "");
    const { sub: user_id } = parseJwt(jwt);

    // Basic input validation
    if (!group_id || !name) {
      throw new Error("معرّف المجموعة والاسم مطلوبان.");
    }

    let parsed_member_limit = member_limit;
    if (parsed_member_limit !== undefined && parsed_member_limit !== null) {
      parsed_member_limit = parseInt(parsed_member_limit, 10);
      if (isNaN(parsed_member_limit) || parsed_member_limit < 2) {
        throw new Error(
          "يجب أن يكون الحد الأقصى للأعضاء رقمًا صحيحًا أكبر من أو يساوي 2."
        );
      }
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
          },
        },
      }
    );

    // All authorization is now handled inside the `update_group_settings_securely` RPC.
    const { error: rpcError } = await userClient.rpc(
      "update_group_settings_securely",
      {
        p_group_id: group_id,
        p_user_id: user_id,
        p_name: name,
        p_description: description,
        p_password: password, // Pass the password directly; logic is handled in SQL.
        p_member_limit: parsed_member_limit ?? null,
        p_invite_code_visible: invite_code_visible ?? true,
        p_activity_log_privacy: activity_log_privacy ?? "managers",
        p_export_control: export_control ?? "managers",
        p_privacy_level: privacy_level,
      }
    );

    if (rpcError)
      throw new Error(
        rpcError.message || "حدث خطأ غير متوقع أثناء تحديث إعدادات المجموعة."
      );

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
    return new Response(
      JSON.stringify({
        error:
          error.message || "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقًا.",
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
