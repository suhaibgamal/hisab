import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { group_id, description, splits, payment_date } = await req.json();

    // Input validation
    if (
      !group_id ||
      !description ||
      !splits ||
      !Array.isArray(splits) ||
      splits.length === 0
    ) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a client with the user's access token to call the DB function.
    // The RLS and function security are handled within the database.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // No need to get user here, as the DB function `get_current_user_app_id` will do it.

    const { data, error } = await userClient.rpc("create_payment", {
      p_group_id: group_id,
      p_description: description,
      p_splits: splits,
      p_payment_date: payment_date,
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
