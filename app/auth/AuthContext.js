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

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true); // Start true for initial load check
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const lastUserIdRef = useRef(null); // Track last processed user ID
  const sessionSetupInProgress = useRef(false); // Prevent parallel setups

  // Debug logging for state changes
  useEffect(() => {
    console.log("[AuthContext] loading:", loading);
  }, [loading]);
  useEffect(() => {
    console.log("[AuthContext] user:", user);
  }, [user]);
  useEffect(() => {
    console.log("[AuthContext] authError:", authError);
  }, [authError]);
  useEffect(() => {
    console.log("[AuthContext] authLoading:", authLoading);
  }, [authLoading]);

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

  // Centralized function to fetch all necessary user data and set up the session.
  const setupUserSession = useCallback(
    async (sessionUser) => {
      if (sessionSetupInProgress.current) {
        console.log(
          "[Auth] setupUserSession: Setup already in progress, skipping."
        );
        return;
      }
      sessionSetupInProgress.current = true;
      let timeoutId;
      console.log("[Auth] setupUserSession: START for user", sessionUser?.id);
      try {
        // Idempotency: Only run if user is new/changed
        if (lastUserIdRef.current === sessionUser.id && user) {
          console.log(
            "[Auth] setupUserSession: User unchanged, skipping fetch."
          );
          return;
        }
        // Timeout logic
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            console.warn("[Auth] setupUserSession timed out after 10s");
            reject(new Error("Session setup timed out. Please try again."));
          }, 10000);
        });
        // Wait for session to be available (Supabase race condition workaround)
        let tries = 0;
        let currentSessionResult;
        while (tries < 20) {
          // try for up to 2 seconds
          currentSessionResult = await supabase.auth.getSession();
          if (currentSessionResult?.data?.session?.user?.id === sessionUser.id)
            break;
          await new Promise((res) => setTimeout(res, 100));
          tries++;
        }
        console.log(
          "[Auth] Current supabase.auth.getSession() before user profile fetch (after retry loop)",
          currentSessionResult
        );
        if (!currentSessionResult?.data?.session?.user?.id) {
          throw new Error(
            "Session not available after login. Please try again."
          );
        }
        // Log the current session before fetching user profile
        console.log("[Auth] Fetching user profile...");
        await Promise.race([
          (async () => {
            const { data: userProfile, error: profileError } = await supabase
              .from("users")
              .select("*")
              .eq("supabase_auth_id", sessionUser.id)
              .single();
            console.log("[Auth] userProfile fetch result", {
              userProfile,
              profileError,
            });
            if (profileError || !userProfile) {
              toast.error("Could not load your user profile.");
              console.error("User profile fetch error:", profileError);
              throw new Error("User profile fetch failed.");
            }
            console.log("[Auth] Fetching group data...");
            const { data: groupData, error: groupError } = await supabase.rpc(
              "get_groups_for_user",
              { p_user_id: userProfile.id }
            );
            console.log("[Auth] groupData fetch result", {
              groupData,
              groupError,
            });
            if (groupError) {
              toast.error(
                "Could not load your group data. Please try refreshing the page."
              );
              console.error("Error fetching groups:", groupError);
              setGroups([]);
            } else {
              setGroups(groupData || []);
            }
            setUser(userProfile);
            lastUserIdRef.current = sessionUser.id; // Update last processed user
            console.log("[Auth] User session set", userProfile);
          })(),
          timeoutPromise,
        ]);
      } catch (err) {
        console.error("[Auth] setupUserSession error:", err);
        setAuthError("تعذر تحميل بيانات المستخدم. يرجى المحاولة مرة أخرى.");
        setUser(null);
        setGroups([]);
        throw err;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        sessionSetupInProgress.current = false;
        console.log("[Auth] setupUserSession: END for user", sessionUser?.id);
      }
    },
    [user]
  );

  // Retry mechanism for session check
  const retrySessionCheck = useCallback(() => {
    setRetryCount((c) => c + 1);
    setAuthError(null);
    setLoading(true);
  }, []);

  // On mount and on retry, check session directly
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setAuthError(null);
    const start = Date.now();
    console.log("[Auth] Checking session on mount or retry...");
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!isMounted) return;
        try {
          if (session?.user) {
            await setupUserSession(session.user);
            if (isMounted) setAuthError(null);
          } else {
            setUser(null);
            setGroups([]);
            lastUserIdRef.current = null;
          }
        } catch (err) {
          if (isMounted) {
            setUser(null);
            setGroups([]);
            setAuthError("تعذر تحميل بيانات المستخدم. يرجى المحاولة مرة أخرى.");
            lastUserIdRef.current = null;
            console.error("[Auth] Error in setupUserSession:", err);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
            console.log(
              "[Auth] Initial session check complete. Loading:",
              false,
              "(duration:",
              Date.now() - start,
              "ms)"
            );
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setUser(null);
          setGroups([]);
          setAuthError("تعذر التحقق من الجلسة. يرجى المحاولة مرة أخرى.");
          lastUserIdRef.current = null;
          console.error("[Auth] Error in getSession:", err);
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [setupUserSession, retryCount]);

  // Single, authoritative useEffect for handling auth state.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setLoading(true);
      setAuthError(null);
      const start = Date.now();
      console.log("[Auth] onAuthStateChange event:", event, session);
      if (event === "SIGNED_OUT") {
        console.trace("[Auth] SIGNED_OUT event stack trace");
      }
      try {
        if (session?.user) {
          if (event === "SIGNED_IN") {
            // SAFETY: Always run setup on SIGNED_IN, even if user is unchanged
            console.log(
              "[Auth] onAuthStateChange: SIGNED_IN, always running setupUserSession for safety."
            );
            await setupUserSession(session.user);
            setAuthError(null);
          } else if (event === "INITIAL_SESSION") {
            // Only skip setup for INITIAL_SESSION if user is unchanged
            if (lastUserIdRef.current !== session.user.id) {
              console.log(
                "[Auth] onAuthStateChange: INITIAL_SESSION, user changed, running setupUserSession."
              );
              await setupUserSession(session.user);
              setAuthError(null);
            } else {
              console.log(
                "[Auth] onAuthStateChange: INITIAL_SESSION, user unchanged, skipping setup."
              );
            }
          } else {
            // For other events, default to running setup if user changed
            if (lastUserIdRef.current !== session.user.id) {
              console.log(
                `{[Auth]} onAuthStateChange: event ${event}, user changed, running setupUserSession.`
              );
              await setupUserSession(session.user);
              setAuthError(null);
            } else {
              console.log(
                `{[Auth]} onAuthStateChange: event ${event}, user unchanged, skipping setup.`
              );
            }
          }
        } else {
          setUser(null);
          setGroups([]);
          lastUserIdRef.current = null;
        }
      } catch (err) {
        console.error("Critical error during session setup:", err);
        await logout();
        setAuthError("حدث خطأ أثناء تحديث الجلسة. يرجى المحاولة مرة أخرى.");
        lastUserIdRef.current = null;
      } finally {
        setLoading(false);
        console.log(
          "[Auth] onAuthStateChange complete. Loading:",
          false,
          "(duration:",
          Date.now() - start,
          "ms)"
        );
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [setupUserSession, logout]);

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
        console.log("[Auth] setSession called with", data.session);
        const {
          data: { session: verifySession },
        } = await supabase.auth.getSession();
        console.log("[Auth] Session after setSession", verifySession);
        // Wait for Supabase to recognize the session
        let tries = 0;
        while (tries < 10) {
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();
          if (currentSession?.user?.id === data.user.supabase_auth_id) break;
          await new Promise((res) => setTimeout(res, 100)); // wait 100ms
          tries++;
        }
        // Force a session re-check to update UI immediately
        retrySessionCheck();
      } catch (err) {
        const defaultError = "An unexpected error occurred. Please try again.";
        toast.error(err.message || defaultError);
        console.error("[Auth] handleAuthAction error:", err);
      } finally {
        setAuthLoading(false);
      }
    },
    [retrySessionCheck]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        groups,
        loading,
        authLoading,
        handleAuthAction,
        handleLogout: logout,
        authError,
        retrySessionCheck,
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
