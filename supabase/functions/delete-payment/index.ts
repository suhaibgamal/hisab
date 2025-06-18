import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, payment_id } = await req.json();

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
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: payment, error: paymentFetchError } = await userClient
      .from("transactions")
      .select("id, group_id, description, splits")
      .eq("id", payment_id)
      .single();
    if (paymentFetchError || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const { error: rpcError } = await userClient.rpc("void_payment_securely", {
      p_group_id: group_id,
      p_payment_id: payment_id,
      p_user_id: user.id,
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
