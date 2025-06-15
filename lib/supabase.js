import { createClient } from "@supabase/supabase-js";

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "hisab_supabase_auth",
    flowType: "pkce",
    debug: process.env.NODE_ENV === "development",
  },
  global: {
    headers: {
      "x-client-info": "@supabase/supabase-js/2.50.0",
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Helper function to get auth token
export const getAuthToken = async () => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("Error getting auth token:", error);
      return null;
    }

    if (!session?.access_token) {
      console.warn("No active session found");
      return null;
    }

    return session.access_token;
  } catch (err) {
    console.error("Unexpected error getting auth token:", err);
    return null;
  }
};
