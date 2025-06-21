import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";

// Create a single supabase client for interacting with your database
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createPagesBrowserClient();

// Helper function to get auth token
export const getAuthToken = async () => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      return null;
    }

    if (!session?.access_token) {
      return null;
    }

    return session.access_token;
  } catch (err) {
    return null;
  }
};
