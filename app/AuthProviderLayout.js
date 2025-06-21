"use client";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { supabase } from "../lib/supabase";
import { AuthProvider } from "./auth/AuthContext";

export default function AuthProviderLayout({ children }) {
  return (
    <SessionContextProvider supabaseClient={supabase}>
      <AuthProvider>{children}</AuthProvider>
    </SessionContextProvider>
  );
}
