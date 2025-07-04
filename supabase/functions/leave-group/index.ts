// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { group_id } = await req.json();
    if (!group_id) {
      return new Response(JSON.stringify({ error: "معرّف المجموعة مفقود" }), {
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
    const { data, error } = await userClient.rpc("leave_group", {
      p_group_id: group_id,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (data?.error) {
      return new Response(JSON.stringify({ error: data.error }), {
        status: 403,
        headers: corsHeaders,
      });
    }
    return new Response(
      JSON.stringify({ success: true, message: data.message }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
