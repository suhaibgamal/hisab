"use client";
import { AuthProvider } from "./auth/AuthContext";

export default function AuthProviderLayout({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
