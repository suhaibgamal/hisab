import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, to_user_id, amount, description } = await req.json();

    // Input validation
    if (!group_id || !to_user_id || !amount) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
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

    // The `from_user_id` is now inferred inside the RPC from the authenticated user.
    const { data, error } = await userClient.rpc("add_settlement", {
      p_group_id: group_id,
      p_to_user_id: to_user_id,
      p_amount: amount,
      p_description: description,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, transaction_id: data }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
