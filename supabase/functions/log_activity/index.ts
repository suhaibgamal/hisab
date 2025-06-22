import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.js";
console.log("log_activity function initialized");
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  try {
    const { group_id, action_type, payload } = await req.json();
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );
    // Get auth user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization"),
          },
        },
      }
    );
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("حدث خطأ أثناء جلب بيانات المستخدم");
    }
    // Get user's database ID
    const { data: userData, error: userDataError } = await supabaseClient
      .from("users")
      .select("id")
      .eq("supabase_auth_id", user.id)
      .single();
    if (userDataError || !userData) {
      throw new Error("حدث خطأ أثناء جلب بيانات المستخدم");
    }
    // Create activity log
    const { error: logError } = await supabaseClient
      .from("activity_logs")
      .insert({
        group_id,
        user_id: userData.id,
        action_type,
        payload,
      });
    if (logError) {
      throw logError;
    }
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
    console.error("Error in log_activity function:", error.message);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 400,
      }
    );
  }
});
