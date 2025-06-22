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
    const { group_id, user_to_kick_id } = await req.json();
    if (!group_id || !user_to_kick_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
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
    const { error } = await userClient.rpc("kick_group_member", {
      p_group_id: group_id,
      p_user_to_kick_id: user_to_kick_id,
    });
    if (error) {
      return new Response(JSON.stringify({ error: "الأعضاء غير مصرح به" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    return new Response(
      JSON.stringify({ success: true, message: "Member kicked" }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "حدث خطأ أثناء العملية" }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
