"use client";
import { useAuth } from "../auth/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { FiUsers, FiCopy, FiShare2 } from "react-icons/fi";

export default function DashboardPage() {
  const { user, groups, loading, handleLogout } = useAuth();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");

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
    setLogoutMessage("تم تسجيل الخروج.");
  };

  const handleJoin = (e) => {
    e.preventDefault();
    setInviteError("");
    let code = inviteInput.trim();
    // Only accept valid invite codes (8+ alphanumeric)
    if (/^[A-Z0-9]{8,}$/i.test(code)) {
      router.push(`/join/${code}`);
    } else {
      setInviteError("يرجى إدخال رمز دعوة صالح (8 أحرف أو أرقام على الأقل).");
    }
  };

  const handleCreate = () => {
    router.push("/create");
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
      {logoutMessage && (
        <div className="mb-6 p-4 rounded bg-gray-800 text-cyan-200 text-center text-base font-medium shadow border border-cyan-900/40">
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
            className="px-4 py-2 font-semibold text-white bg-red-800 rounded-lg hover:bg-red-600 text-base shadow transition-all duration-150"
          >
            تسجيل الخروج
          </button>
        </div>
        {/* Invite/join and create group UI */}
        <div className="flex flex-col md:flex-row items-center gap-4 mb-8">
          <form
            onSubmit={handleJoin}
            className="flex flex-col md:flex-row gap-2 w-full md:w-auto"
          >
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="أدخل كود الدعوة أو رابط المجموعة"
              className="px-4 py-3 rounded-lg text-lg bg-gray-800 text-white border border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 w-full md:w-80"
              dir="ltr"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-base shadow transition-all duration-150"
            >
              انضم إلى مجموعة
            </button>
          </form>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-base shadow transition-all duration-150"
          >
            إنشاء مجموعة جديدة
          </button>
        </div>
        {inviteError && (
          <div className="mb-4 text-red-400 font-semibold text-center">
            {inviteError}
          </div>
        )}
        <div className="p-10 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
          <h2 className="mb-6 text-2xl font-semibold text-white">مجموعاتك</h2>
          {groups && groups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {groups.map((group) => (
                <div
                  key={group.group_id}
                  className="flex flex-col bg-gradient-to-br from-gray-700 via-gray-800 to-cyan-950 rounded-2xl shadow-lg border border-cyan-900/30 p-6 group-card transition-transform hover:scale-105 hover:shadow-2xl"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <FiUsers className="text-cyan-400 w-7 h-7" />
                    <a
                      href={`/group/${group.group_id}`}
                      className="text-xl font-bold text-cyan-400 hover:underline flex-1"
                    >
                      {group.group_name}
                    </a>
                  </div>
                  {group.invite_code && (
                    <div className="flex items-center gap-2 text-start sm:text-end bg-gray-800 p-3 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-400">رمز الدعوة</p>
                        <p className="font-mono text-lg">{group.invite_code}</p>
                      </div>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(group.invite_code)
                        }
                        className="p-2 text-gray-200 rounded-full hover:bg-gray-700"
                        aria-label="Copy invite code"
                      >
                        <FiCopy className="h-5 w-5" />
                      </button>
                      {typeof navigator !== "undefined" && navigator.share && (
                        <button
                          onClick={() =>
                            navigator.share({
                              title: `انضم إلى مجموعتي على حساب! رمز الدعوة: ${group.invite_code}`,
                              text: `انضم إلى مجموعتي على حساب! رمز الدعوة: ${group.invite_code}`,
                              url: `${window.location.origin}/join/${group.invite_code}`,
                            })
                          }
                          className="p-2 text-gray-200 rounded-full hover:bg-gray-700"
                          aria-label="Share group"
                        >
                          <FiShare2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex-1" />
                  <div className="flex gap-2 mt-4">
                    <a
                      href={`/group/${group.group_id}`}
                      className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-center shadow"
                    >
                      دخول المجموعة
                    </a>
                    {group.invite_code && (
                      <button
                        onClick={async () => {
                          const joinUrl = `${window.location.origin}/join/${group.invite_code}`;
                          if (navigator.share) {
                            await navigator.share({
                              title: `دعوة للانضمام إلى مجموعة ${group.group_name}`,
                              text: `انضم إلى مجموعتي على حساب! رمز الدعوة: ${group.invite_code}`,
                              url: joinUrl,
                            });
                          } else {
                            await navigator.clipboard.writeText(joinUrl);
                            window?.toast?.info?.(
                              "تم نسخ رابط الدعوة. الصقه لمشاركته."
                            );
                          }
                        }}
                        className="p-2 rounded-lg bg-gray-700 hover:bg-gray-800 text-cyan-300 shadow"
                        title="مشاركة المجموعة"
                      >
                        <FiShare2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
                className="px-6 py-2 rounded-lg text-white bg-red-800 hover:bg-red-600 text-base font-bold shadow transition-all duration-150"
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
