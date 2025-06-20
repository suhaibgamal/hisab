"use client";
import { useAuth } from "../auth/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function DashboardPage() {
  const { user, groups, loading, handleLogout } = useAuth();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (logoutMessage) {
      const timer = setTimeout(() => setLogoutMessage(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [logoutMessage]);

  if (loading || !user)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );

  const handleLogoutWithMessage = async () => {
    setShowLogoutConfirm(false);
    await handleLogout();
    setLogoutMessage("تم تسجيل الخروج بنجاح. نراك قريباً!");
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
      {logoutMessage && (
        <div className="mb-6 p-4 rounded bg-green-700 text-white text-center text-lg font-semibold shadow">
          {logoutMessage}
        </div>
      )}
      <div className="w-full max-w-4xl p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">
            أهلاً بك، {user.display_name || user.username}
          </h1>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="px-6 py-3 font-semibold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 text-lg shadow"
          >
            تسجيل الخروج
          </button>
        </div>
        <div className="p-10 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
          <h2 className="mb-6 text-2xl font-semibold text-white">مجموعاتك</h2>
          {groups && groups.length > 0 ? (
            <ul className="space-y-4">
              {groups.map((group) => (
                <li
                  key={group.group_id}
                  className="p-4 bg-gradient-to-br from-gray-700 via-gray-800 to-cyan-950 rounded-xl hover:bg-cyan-900/40 shadow border border-cyan-900/30"
                >
                  <a
                    href={`/group/${group.group_id}`}
                    className="text-xl font-bold text-cyan-400 hover:underline"
                  >
                    {group.group_name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">أنت لست عضوا في أي مجموعة حتى الآن.</p>
          )}
        </div>
      </div>
      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-xl shadow-xl p-8 w-full max-w-sm text-center border border-cyan-900/40">
            <h3 className="text-2xl font-bold text-white mb-4">
              تأكيد تسجيل الخروج
            </h3>
            <p className="text-gray-300 mb-6">
              هل أنت متأكد أنك تريد تسجيل الخروج؟
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-6 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-500 text-lg"
              >
                إلغاء
              </button>
              <button
                onClick={handleLogoutWithMessage}
                className="px-6 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 text-lg font-bold shadow"
              >
                نعم، تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
