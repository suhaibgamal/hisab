"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { useSessionContext, useUser } from "@supabase/auth-helpers-react";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const { isLoading: sessionLoading } = useSessionContext();
  const userObj = useUser();
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Fetch user profile and groups when userObj changes
  useEffect(() => {
    setLoading(true);
    setAuthError(null);
    if (!userObj) {
      setUser(null);
      setGroups([]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: userProfile, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("supabase_auth_id", userObj.id)
          .single();
        if (profileError || !userProfile) {
          setAuthError("تعذر تحميل بيانات المستخدم. يرجى المحاولة مرة أخرى.");
          setUser(null);
          setGroups([]);
          setLoading(false);
          return;
        }
        const { data: groupData, error: groupError } = await supabase.rpc(
          "get_groups_for_user",
          { p_user_id: userProfile.id }
        );
        setUser(userProfile);
        setGroups(groupError ? [] : groupData || []);
        setLoading(false);
      } catch (err) {
        setAuthError("تعذر تحميل بيانات المستخدم. يرجى المحاولة مرة أخرى.");
        setUser(null);
        setGroups([]);
        setLoading(false);
      }
    })();
  }, [userObj]);

  // Centralized logout function
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      toast.success("تم تسجيل الخروج بنجاح");
    } catch (err) {
      console.error("Logout error:", err);
      toast.error("فشل تسجيل الخروج");
    }
  }, []);

  // Handle login or register
  const handleAuthAction = useCallback(
    async ({ username, password, displayName, isNewUser }) => {
      setAuthLoading(true);
      try {
        const functionName = isNewUser ? "create-user" : "login";
        const { data, error } = await supabase.functions.invoke(functionName, {
          body: {
            username: username.trim(),
            password,
            displayName: isNewUser ? displayName?.trim() : undefined,
          },
        });

        if (error) {
          if (error.context && typeof error.context.json === "function") {
            const errorBody = await error.context.json();
            if (errorBody.error) {
              throw new Error(errorBody.error);
            }
          }
          throw new Error(
            error.message ||
              "An unexpected error occurred during authentication."
          );
        }

        if (data.error) {
          throw new Error(data.error);
        }

        if (!data.user || !data.session) {
          throw new Error("Invalid authentication response from the server.");
        }

        await supabase.auth.setSession(data.session);
        // No need to manually poll session; the helpers will update context
      } catch (err) {
        const defaultError = "An unexpected error occurred. Please try again.";
        toast.error(err.message || defaultError);
        setAuthError(err.message || defaultError);
      } finally {
        setAuthLoading(false);
      }
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        groups,
        loading: loading || sessionLoading,
        authLoading,
        handleAuthAction,
        handleLogout: logout,
        authError,
        retrySessionCheck: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
