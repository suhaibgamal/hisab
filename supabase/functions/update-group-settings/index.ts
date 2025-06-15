import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, name, password, member_limit, invite_code_visible } =
      await req.json();
    if (!group_id || !name) throw new Error("Group ID and name are required.");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    let password_hash = null;
    // Only hash password if it's a non-empty string
    if (password && password.length > 0) {
      password_hash = await bcrypt.hash(password);
    }

    const { error: rpcError } = await userClient.rpc("update_group_settings", {
      p_group_id: group_id,
      p_name: name,
      p_password_hash: password_hash,
      p_member_limit: member_limit,
      p_invite_code_visible: invite_code_visible,
    });

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
