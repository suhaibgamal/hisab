import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, payment_id } = await req.json();

    if (!group_id || !payment_id) {
      return new Response(JSON.stringify({ error: "مدخلات غير صالحة" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // The RPC function `void_payment_securely` now handles all authorization
    // by using `get_current_user_app_id()` internally. We no longer need to
    // fetch the user or pass the user ID from the client-side.
    const { error: rpcError } = await userClient.rpc("void_payment_securely", {
      p_group_id: group_id,
      p_payment_id: payment_id,
    });

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
