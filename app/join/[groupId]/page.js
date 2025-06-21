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

function isValidInviteCode(code) {
  return /^[A-Z0-9]{8,}$/i.test(code);
}

export default function JoinGroupPage({ params }) {
  const router = useRouter();
  const { groupId } = usePromise(params);
  const { user: authUser, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [passwordHash, setPasswordHash] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fatalError, setFatalError] = useState(null);

  // Wait for auth context
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setFatalError("يجب تسجيل الدخول أولاً.");
      setLoading(false);
      router.replace("/dashboard");
      return;
    }
    // Try to join group
    if (!isValidInviteCode(groupId)) {
      setFatalError(
        "رمز الدعوة غير صالح. يجب أن يكون 8 أحرف أو أرقام على الأقل."
      );
      setLoading(false);
      router.replace("/dashboard");
      return;
    }
    joinGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, authLoading]);

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
              group_identifier: groupId,
              ...(passwordAttempt ? { password: passwordAttempt } : {}),
            },
          }
        );
        // Handle network or function invocation errors
        if (fnError) {
          throw new Error(fnError.message || "Network error");
        }
        // Handle group not found or invalid
        if (data?.error) {
          setFatalError("رمز الدعوة غير صالح أو المجموعة غير متاحة.");
          setLoading(false);
          return;
        }
        // Already a member
        if (data?.success && data?.message?.includes("Already a member")) {
          toast.success("أنت بالفعل عضو في هذه المجموعة.");
          router.replace(`/group/${data.group_id || groupId}`);
          return;
        }
        // Private group, needs password
        if (data?.is_private && data?.password_hash) {
          setNeedsPassword(true);
          setGroupName(data.group_name || "");
          setPasswordHash(data.password_hash);
          setLoading(false);
          return;
        }
        // Member limit reached or other join error
        if (data?.error || data?.details) {
          setError(data.error || data.details);
          toast.error(data.error || data.details);
          setLoading(false);
          return;
        }
        // Successful join
        if (data?.success) {
          toast.success(data.message || "تم الانضمام للمجموعة بنجاح!");
          router.replace(`/group/${data.group_id || groupId}`);
          return;
        }
        // Fallback: unknown response
        throw new Error("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
      } catch (err) {
        setError(err.message || "فشل الانضمام للمجموعة.");
        toast.error(err.message || "فشل الانضمام للمجموعة.");
        setFatalError(err.message || "فشل الانضمام للمجموعة.");
        setLoading(false);
      }
    },
    [groupId, router]
  );

  // Handle password submit for private group
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      // Local verification first
      const isValid = await verifyPassword(password.trim(), passwordHash);
      if (!isValid) {
        setError("كلمة المرور غير صحيحة");
        toast.error("كلمة المرور غير صحيحة");
        setSubmitting(false);
        return;
      }
      // Try to join with password
      await joinGroup(password.trim());
    } catch (err) {
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

  // Password prompt for private group
  if (needsPassword) {
    return (
      <ErrorBoundary>
        <main className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-lg shadow-lg">
            <h1 className="text-2xl font-bold text-center mb-4">
              أدخل كلمة مرور مجموعة {groupName ? `"${groupName}"` : ""}
            </h1>
            {error && <ErrorMessage message={error} />}
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
                minLength={8}
                maxLength={50}
                autoFocus
              />
              <button
                type="submit"
                className="w-full px-4 py-3 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
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
    // Always redirect to dashboard after showing error
    setTimeout(() => router.replace("/dashboard"), 2000);
    return <JoinGroupNotFound message={fatalError} />;
  }

  // Fallback (should not reach here)
  return null;
}
