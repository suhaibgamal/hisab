"use client";

import { useEffect, useState, useCallback } from "react";
import { use as usePromise } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";
import { verifyPassword } from "../../../lib/passwordUtils";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorMessage from "../../../components/ErrorMessage";
import ErrorBoundary from "../../../components/ErrorBoundary";
import JoinGroupNotFound from "../../../components/JoinGroupNotFound";
import { useAuth } from "../../auth/AuthContext";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { FiEye, FiEyeOff } from "react-icons/fi";

function isValidInviteCode(code) {
  return /^[A-Z0-9]{8,}$/i.test(code);
}

// Helper to map backend errors to user-friendly toast messages
function getFriendlyToastMessage(error) {
  return error || "حدث خطأ. يرجى المحاولة مرة أخرى.";
}

export default function JoinGroupPage({ params }) {
  const router = useRouter();
  const { inviteCode } = usePromise(params);
  const { user: authUser, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fatalError, setFatalError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Helper: redirect to login/register with return URL
  const goToAuth = (mode) => {
    // mode: 'login' or 'register'
    const returnUrl = `/join/${inviteCode}`;
    router.push(
      `/login?mode=${mode}&redirect=${encodeURIComponent(returnUrl)}`
    );
  };

  // Wait for auth context and handle join logic only if authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setLoading(false);
      return;
    }
    if (!isValidInviteCode(inviteCode)) {
      setFatalError(
        "رمز الدعوة غير صالح. يجب أن يكون 8 أحرف أو أرقام على الأقل."
      );
      setLoading(false);
      router.replace("/dashboard");
      return;
    }
    // Only call joinGroup if we are not already waiting for a password
    if (!needsPassword) {
      joinGroup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, authLoading, needsPassword]);

  // Show toast for fatal errors as a side effect
  useEffect(() => {
    if (fatalError) {
      toast.error(getFriendlyToastMessage(fatalError));
    }
  }, [fatalError]);

  // Show toast for inline errors (e.g., wrong password)
  useEffect(() => {
    if (error) {
      toast.error(getFriendlyToastMessage(error));
    }
  }, [error]);

  // Main join logic
  const joinGroup = useCallback(
    async (passwordAttempt) => {
      setLoading(true);
      setError("");
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "join-group",
          {
            body: {
              group_identifier: inviteCode,
              ...(passwordAttempt ? { password: passwordAttempt } : {}),
            },
          }
        );
        let responseData = data;
        if (typeof data === "string") {
          try {
            responseData = JSON.parse(data);
          } catch (e) {
            responseData = {};
          }
        }
        // Handle backend errors that are user-facing (e.g., wrong password)
        if (fnError) {
          // If it's a FunctionsHttpError, extract the real error from the response body
          if (fnError instanceof FunctionsHttpError && fnError.context) {
            const errorBody = await fnError.context.json();
            setError(errorBody.error || "Unknown error");
            setLoading(false);
            return;
          }
          if (
            needsPassword &&
            fnError.message?.includes("كلمة المرور غير صحيحة")
          ) {
            setError(fnError.message);
            setPassword("");
            setLoading(false);
            return;
          }
          // For other errors, treat as fatal
          setFatalError(fnError.message || "Network error");
          setLoading(false);
          return;
        }
        if (responseData?.error) {
          if (
            needsPassword &&
            responseData.error.includes("كلمة المرور غير صحيحة")
          ) {
            setError(responseData.error);
            setPassword("");
            setLoading(false);
            return;
          }
          // Handle other user-facing errors (e.g., already a member, group not found)
          if (responseData.error.includes("عضو بالفعل")) {
            toast.success(getFriendlyToastMessage(responseData.error));
            router.replace(`/group/${responseData.group_id || inviteCode}`);
            return;
          }
          // For all other errors, treat as fatal
          setFatalError(responseData.error);
          setLoading(false);
          return;
        }
        if (
          responseData?.success &&
          responseData?.message?.includes("Already a member")
        ) {
          toast.success(getFriendlyToastMessage(responseData.message));
          router.replace(`/group/${responseData.group_id || inviteCode}`);
          return;
        }
        if (responseData?.is_private) {
          setNeedsPassword(true);
          setGroupName(responseData.group_name || "");
          setLoading(false);
          return;
        }
        if (responseData?.error || responseData?.details) {
          setError(responseData.error || responseData.details);
          setLoading(false);
          return;
        }
        if (responseData?.success) {
          toast.success(responseData.message || "تم الانضمام للمجموعة بنجاح!");
          router.replace(`/group/${responseData.group_id || inviteCode}`);
          return;
        }
        // Unexpected fallback
        setFatalError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
        setLoading(false);
      } catch (err) {
        // Only set fatalError for truly fatal errors
        setFatalError(err.message || "فشل الانضمام للمجموعة.");
        setLoading(false);
      }
    },
    [inviteCode, router, needsPassword]
  );

  // Handle password submit for private group
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      // Just send the password to the backend for verification
      await joinGroup(password.trim());
    } catch (err) {
      // This catch is only for unexpected errors, not wrong password
      setError("فشل التحقق من كلمة المرور.");
      toast.error("فشل التحقق من كلمة المرور.");
      setFatalError(err.message || "فشل التحقق من كلمة المرور.");
      setLoading(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // If not authenticated, show login/register options
  if (!authUser) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
        <div className="w-full max-w-md p-8 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 text-center">
          <h1 className="text-3xl font-bold text-white mb-6">
            الانضمام إلى مجموعة
          </h1>
          <p className="mb-6 text-lg text-gray-200">
            يجب تسجيل الدخول أو إنشاء حساب للانضمام إلى المجموعة
          </p>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => goToAuth("login")}
              className="w-full py-3 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-lg shadow"
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => goToAuth("register")}
              className="w-full py-3 rounded-lg bg-gray-700 hover:bg-gray-800 text-white font-bold text-lg shadow"
            >
              إنشاء حساب
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Password prompt for private group
  if (needsPassword) {
    return (
      <ErrorBoundary>
        <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
          <div className="w-full max-w-md p-8 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
            <h1 className="text-3xl font-bold text-white mb-6 text-center">
              أدخل كلمة مرور مجموعة {groupName ? `"${groupName}"` : ""}
            </h1>
            {error && <ErrorMessage message={error} />}
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="كلمة المرور"
                  className="w-full px-4 py-3 rounded-lg text-lg bg-gray-800 text-white border border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 pr-12 shadow"
                  required
                  minLength={8}
                  maxLength={50}
                  autoFocus
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-cyan-400 hover:text-cyan-300 focus:outline-none bg-transparent p-1 rounded-full"
                  aria-label={
                    showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                  }
                >
                  {showPassword ? (
                    <FiEyeOff className="h-5 w-5" />
                  ) : (
                    <FiEye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-lg shadow mt-2"
                disabled={submitting}
              >
                {submitting ? "جاري التحقق..." : "انضمام"}
              </button>
            </form>
          </div>
        </main>
      </ErrorBoundary>
    );
  }

  // Error state (if not already redirected)
  if (fatalError) {
    // Only redirect for fatal errors that are not password-related
    if (
      fatalError.includes("تسجيل الدخول") ||
      fatalError.includes("غير صالح") ||
      fatalError.includes("غير متاحة")
    ) {
      setTimeout(() => router.replace("/dashboard"), 2000);
    }
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-center mb-4">
            تعذر الانضمام للمجموعة
          </h1>
          <ErrorMessage message={fatalError} />
          <button
            onClick={() => {
              setFatalError(null);
              setError("");
              setNeedsPassword(false);
              setPassword("");
              setLoading(false);
            }}
            className="mt-4 w-full px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600"
          >
            إعادة المحاولة
          </button>
        </div>
      </main>
    );
  }

  // Fallback (should not reach here)
  return null;
}
