"use client";

import { useAuth } from "./auth/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [buttonLabel, setButtonLabel] = useState("تسجيل الدخول / إنشاء حساب");
  const [buttonAction, setButtonAction] = useState(
    () => () => router.push("/login")
  );

  useEffect(() => {
    if (user) {
      setButtonLabel("الذهاب إلى لوحة التحكم");
      setButtonAction(() => () => router.push("/dashboard"));
    } else {
      setButtonLabel("تسجيل الدخول / إنشاء حساب");
      setButtonAction(() => () => router.push("/login"));
    }
  }, [user, router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 drop-shadow-lg">
          حساب <span className="text-cyan-400">Hisab</span>
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-8 font-medium">
          منصة متقدمة لإدارة وتقسيم المصاريف المشتركة وتسوية الديون بين الأصدقاء
          والعائلة بسهولة وأمان.{" "}
          <span className="text-cyan-400 font-bold">
            الخدمة مجانية بالكامل!
          </span>
        </p>
        <div className="flex flex-col md:flex-row justify-center gap-4 mb-8">
          <button
            onClick={buttonAction}
            className="px-8 py-4 text-2xl font-bold rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg transition-colors duration-200"
          >
            {buttonLabel}
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-8">
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-xl p-6 w-64 shadow-lg border border-cyan-900/40">
            <h3 className="text-cyan-400 text-xl font-bold mb-2">
              تقسيم المصاريف الذكي
            </h3>
            <p className="text-gray-300">
              أضف مصاريفك بسهولة ودع النظام يحسب من يدين من!
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-xl p-6 w-64 shadow-lg border border-cyan-900/40">
            <h3 className="text-cyan-400 text-xl font-bold mb-2">
              تسوية الديون الفورية
            </h3>
            <p className="text-gray-300">
              سدد ديونك أو اطلب التسوية بضغطة زر، مع سجل كامل للمعاملات.
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-xl p-6 w-64 shadow-lg border border-cyan-900/40">
            <h3 className="text-cyan-400 text-xl font-bold mb-2">
              إدارة المجموعات
            </h3>
            <p className="text-gray-300">
              أنشئ مجموعات للأصدقاء أو العائلة وشاركهم بسهولة عبر رابط دعوة.
            </p>
          </div>
        </div>
      </div>
      <footer className="mt-auto text-gray-500 text-sm py-6">
        &copy; {new Date().getFullYear()} حساب Hisab. جميع الحقوق محفوظة.
      </footer>
    </main>
  );
}
