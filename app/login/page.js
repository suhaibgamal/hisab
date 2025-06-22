"use client";
import { Suspense } from "react";
import { useAuth } from "../auth/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const { user, loading, handleAuthAction, authLoading, authError } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: "",
  });
  const [formError, setFormError] = useState("");
  const [redirectPath, setRedirectPath] = useState(null);

  useEffect(() => {
    const urlMode = searchParams.get("mode");
    const urlRedirect = searchParams.get("redirect");
    if (urlMode === "register" || urlMode === "login") {
      setMode(urlMode);
    }
    if (urlRedirect) {
      setRedirectPath(urlRedirect);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      if (redirectPath) {
        router.replace(redirectPath);
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, router, redirectPath]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }
  if (user) {
    return null;
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (
      !form.username.trim() ||
      !form.password.trim() ||
      (mode === "register" && !form.displayName.trim())
    ) {
      setFormError("يرجى ملء جميع الحقول المطلوبة.");
      return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(form.username)) {
      setFormError(
        "اسم المستخدم يجب أن يكون بحروف صغيرة (a-z)، أرقام، أو شرطة سفلية فقط، وطوله بين 3 و30 حرف."
      );
      return;
    }
    if (form.password.length < 8) {
      setFormError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    setFormError("");
    await handleAuthAction({
      username: form.username,
      password: form.password,
      displayName: form.displayName,
      isNewUser: mode === "register",
    });
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
      <div className="w-full max-w-lg mx-auto p-10 space-y-8 text-center bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-2xl border border-cyan-900/40">
        <h2 className="text-4xl font-extrabold text-white mb-2">
          {mode === "login"
            ? "مرحباً بعودتك إلى حساب!"
            : "إنشاء حساب جديد في حساب"}
        </h2>
        <p className="text-lg text-gray-300 mb-6">
          {mode === "login"
            ? "أدخل بياناتك لتسجيل الدخول إلى نظام إدارة النفقات المشتركة. إذا لم يكن لديك حساب، يمكنك إنشاء واحد جديد بسهولة!"
            : "يرجى ملء البيانات التالية لإنشاء حساب جديد والاستفادة من جميع ميزات تتبع المصاريف وتسوية الديون مع أصدقائك."}
        </p>
        <div className="flex justify-center mb-8 gap-0.5">
          <button
            className={`px-6 py-3 font-bold rounded-l-lg text-lg transition-colors duration-200 ${
              mode === "login"
                ? "bg-cyan-600 text-white shadow"
                : "bg-gray-700 text-gray-300"
            }`}
            onClick={() => setMode("login")}
            disabled={mode === "login"}
          >
            تسجيل الدخول
          </button>
          <button
            className={`px-6 py-3 font-bold rounded-r-lg text-lg transition-colors duration-200 ${
              mode === "register"
                ? "bg-cyan-600 text-white shadow"
                : "bg-gray-700 text-gray-300"
            }`}
            onClick={() => setMode("register")}
            disabled={mode === "register"}
          >
            إنشاء حساب
          </button>
        </div>
        <form className="space-y-6 text-right" onSubmit={handleSubmit}>
          <div className="mb-2">
            <label
              htmlFor="username"
              className="block mb-1 text-gray-300 text-lg font-semibold"
            >
              اسم المستخدم
            </label>
            <input
              name="username"
              id="username"
              type="text"
              required
              className="block w-full px-4 py-3 text-white bg-gray-900 border-2 border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-lg shadow"
              placeholder="مثال: ahmed_123"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
              pattern="^[a-z0-9_]{3,30}$"
              title="اسم المستخدم يجب أن يكون بحروف صغيرة (a-z)، أرقام، أو شرطة سفلية فقط."
            />
            <span className="text-xs text-gray-400 mt-1 block">
              اسم المستخدم يجب أن يكون بحروف صغيرة (a-z)، أرقام، أو شرطة سفلية
              فقط، وطوله بين 3 و30 حرف.
            </span>
          </div>
          {mode === "register" && (
            <div className="mb-2">
              <label
                htmlFor="displayName"
                className="block mb-1 text-gray-300 text-lg font-semibold"
              >
                الاسم المعروض
              </label>
              <input
                name="displayName"
                id="displayName"
                type="text"
                required
                className="block w-full px-4 py-3 text-white bg-gray-900 border-2 border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-lg shadow"
                placeholder="اسمك الكامل أو اسم الشهرة"
                value={form.displayName}
                onChange={handleChange}
                autoComplete="name"
              />
            </div>
          )}
          <div className="mb-2">
            <label
              htmlFor="password"
              className="block mb-1 text-gray-300 text-lg font-semibold"
            >
              كلمة المرور
            </label>
            <input
              name="password"
              id="password"
              type="password"
              required
              className="block w-full px-4 py-3 text-white bg-gray-900 border-2 border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-lg shadow"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            <span className="text-xs text-gray-400 mt-1 block">
              كلمة المرور يجب أن تكون 8 أحرف على الأقل.
            </span>
          </div>
          {formError && (
            <p className="text-red-400 text-base font-semibold text-center mt-2">
              {formError}
            </p>
          )}
          {authError && (
            <p className="text-red-400 text-base font-semibold text-center mt-2">
              {authError}
            </p>
          )}
          <button
            type="submit"
            disabled={authLoading}
            className="w-full px-4 py-3 font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:bg-gray-500 text-lg shadow"
          >
            {authLoading ? (
              <LoadingSpinner />
            ) : mode === "login" ? (
              "تسجيل الدخول"
            ) : (
              "إنشاء حساب"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
