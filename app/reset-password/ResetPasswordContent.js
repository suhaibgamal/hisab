"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function ResetPasswordContent() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  // State to check if the session is verified
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  // On component mount, check for the password recovery event.
  // Supabase automatically handles the access_token from the URL hash.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // This event fires when the user lands on the page after clicking the recovery link.
      // If a session exists, it means the token was valid.
      if (event === "PASSWORD_RECOVERY") {
        setIsSessionVerified(true);
      } else if (session) {
        // Also handle if a session is simply active
        setIsSessionVerified(true);
      }
    });

    // It might take a moment for the auth state to change. If after a short delay
    // there's still no session, the link is likely invalid.
    setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          setError("رابط الاستعادة غير صالح أو منتهي الصلاحية.");
          // We mark as "verified" to stop the loading spinner and show the error.
          setIsSessionVerified(true);
        }
      });
    }, 1500); // 1.5 second delay to allow Supabase to process the hash

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!password || !confirmPassword) {
      setError("يرجى إدخال كلمة المرور الجديدة وتأكيدها.");
      return;
    }
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setLoading(true);
    try {
      // The user's session is already authenticated by Supabase JS client.
      // We just need to call updateUser with the new password.
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError("فشل تحديث كلمة المرور. ربما انتهت صلاحية الرابط أو حدث خطأ.");
        setLoading(false);
        return;
      }
      setSuccess("تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.");
      setTimeout(() => {
        router.replace("/login");
      }, 2500);
    } catch (err) {
      setError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (!isSessionVerified) {
      return (
        <div className="flex items-center justify-center min-h-[300px]">
          <LoadingSpinner />
        </div>
      );
    }

    if (error && !success) {
      return (
        <div className="text-red-400 font-semibold text-center min-h-[300px] flex items-center justify-center text-lg">
          {error}
        </div>
      );
    }

    if (success) {
      return (
        <div className="text-green-400 font-semibold text-center min-h-[300px] flex items-center justify-center text-lg">
          {success}
        </div>
      );
    }

    return (
      <form className="space-y-6 text-right" onSubmit={handleSubmit}>
        {/* ... The rest of your form JSX remains the same ... */}
        <div className="mb-2">
          <label
            htmlFor="password"
            className="block mb-1 text-gray-300 text-lg font-semibold"
          >
            كلمة المرور الجديدة
          </label>
          <input
            name="password"
            id="password"
            type="password"
            required
            className="block w-full px-4 py-3 text-white bg-gray-900 border-2 border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-lg shadow"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
          />
          <span className="text-xs text-gray-400 mt-1 block">
            كلمة المرور يجب أن تكون 8 أحرف على الأقل.
          </span>
        </div>
        <div className="mb-2">
          <label
            htmlFor="confirmPassword"
            className="block mb-1 text-gray-300 text-lg font-semibold"
          >
            تأكيد كلمة المرور
          </label>
          <input
            name="confirmPassword"
            id="confirmPassword"
            type="password"
            required
            className="block w-full px-4 py-3 text-white bg-gray-900 border-2 border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-lg shadow"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        {error && (
          <p className="text-red-400 text-base font-semibold text-center mt-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-3 font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:bg-gray-500 text-lg shadow"
        >
          {loading ? <LoadingSpinner /> : "تحديث كلمة المرور"}
        </button>
      </form>
    );
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
      <div className="w-full max-w-lg mx-auto p-10 space-y-8 text-center bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-2xl border border-cyan-900/40">
        <h2 className="text-3xl font-extrabold text-white mb-2">
          استعادة كلمة المرور
        </h2>
        <p className="text-lg text-gray-300 mb-6">
          أدخل كلمة مرور جديدة لحسابك.
        </p>
        {renderContent()}
      </div>
    </main>
  );
}
