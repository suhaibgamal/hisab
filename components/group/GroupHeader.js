import Link from "next/link";
import {
  FiSettings,
  FiCopy,
  FiShare2,
  FiUser,
  FiCalendar,
  FiInfo,
  FiDollarSign,
  FiUserCheck,
  FiRefreshCw,
} from "react-icons/fi";
import { toast } from "sonner";
import { formatCurrency } from "../../app/group/[groupId]/utils";
import { useEffect } from "react";

export default function GroupHeader({
  group,
  members,
  user,
  currentUserRole,
  onSettingsClick,
  connectionStatus,
  reconnect,
  reconnecting,
}) {
  const handleCopyInviteCode = () => {
    if (!group?.invite_code) return;
    navigator.clipboard
      .writeText(group.invite_code)
      .then(() => {
        toast.success("تم نسخ رمز الدعوة!");
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          toast.error("فشل نسخ الرمز");
        }
      });
  };

  const handleShareGroup = async () => {
    const joinUrl = `${window.location.origin}/join/${group.invite_code}`;
    const shareData = {
      title: `الانضمام إلى مجموعة ${group.name}`,
      text: `لقد تمت دعوتك للانضمام إلى مجموعة "${group.name}" على حساب. استخدم رمز الدعوة: ${group.invite_code} أو انقر على الرابط.`,
      url: joinUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(joinUrl);
        toast.info("تم نسخ رابط الدعوة. الصقه لمشاركته.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        toast.error("فشل في مشاركة المجموعة");
      }
    }
  };

  const currentUserMember = members.find(
    (m) => m.users?.supabase_auth_id === user?.id
  );

  const shouldShowInviteCode =
    group?.invite_code_visible || currentUserRole === "manager";

  const handleReconnectClick = () => {
    if (reconnect) reconnect();
  };

  return (
    <header className="w-full mb-8">
      {/* Top row: Back to dashboard (left), Invite code/share/copy (right) */}
      <div className="flex justify-between items-center mb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-3 py-1.5 border border-cyan-400 text-cyan-300 rounded-lg hover:bg-cyan-900/30 transition text-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          العودة للوحة التحكم
        </Link>
        {group?.invite_code &&
          (currentUserRole === "manager" || group.invite_code_visible) && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-400 bg-gray-900/60 shadow-sm">
              <span className="font-mono text-base text-sky-400 select-all">
                {group.invite_code}
              </span>
              <button
                onClick={handleCopyInviteCode}
                className="p-1.5 text-cyan-100 rounded-full hover:bg-cyan-800"
                aria-label="Copy invite code"
              >
                <FiCopy className="h-4 w-4" />
              </button>
              <button
                onClick={handleShareGroup}
                className="p-1.5 text-cyan-100 rounded-full hover:bg-cyan-800"
                aria-label="Share group"
              >
                <FiShare2 className="h-4 w-4" />
              </button>
            </div>
          )}
      </div>
      {/* Main row: Group metadata (left), Settings (right) in the same row */}
      <div className="flex flex-row justify-between items-center gap-4 sm:gap-8">
        {/* Group metadata - unified card */}
        <div className="flex flex-col items-start sm:items-start flex-1 bg-gray-900/60 rounded-2xl p-6 border border-cyan-900/40 shadow-lg">
          <div className="flex items-center gap-3 mb-4 w-full">
            <FiInfo className="text-cyan-400 h-6 w-6" />
            <h1 className="text-3xl font-bold text-white flex-1 truncate">
              {group?.name}
            </h1>
            {connectionStatus && (
              <div className="flex items-center gap-2 ml-2">
                <span
                  title={
                    connectionStatus === "connected"
                      ? "متصل"
                      : connectionStatus === "connecting"
                      ? "جاري الاتصال"
                      : "غير متصل"
                  }
                  className={`inline-block w-3 h-3 rounded-full border
                    ${
                      connectionStatus === "connected"
                        ? "bg-green-500 border-green-700"
                        : ""
                    }
                    ${
                      connectionStatus === "connecting"
                        ? "bg-yellow-400 border-yellow-600 animate-pulse"
                        : ""
                    }
                    ${
                      connectionStatus === "disconnected"
                        ? "bg-red-500 border-red-700"
                        : ""
                    }
                  `}
                />
                {connectionStatus === "disconnected" && reconnect && (
                  <button
                    onClick={handleReconnectClick}
                    disabled={reconnecting}
                    className="ml-1 px-2 py-0.5 bg-white text-red-600 rounded border border-red-400 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed text-xs"
                    style={{ fontSize: "0.9em" }}
                  >
                    {reconnecting ? (
                      <span className="animate-spin inline-block mr-1">⏳</span>
                    ) : (
                      "إعادة الاتصال"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 w-full">
            <div className="flex items-center gap-2 text-cyan-300 text-sm">
              <FiDollarSign className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold">العملة:</span>
              <span className="bg-cyan-800/30 px-2 py-0.5 rounded text-cyan-200 font-mono tracking-wider text-base">
                {group?.currency}
              </span>
            </div>
            {group?.creator_id && members && (
              <div className="flex items-center gap-2 text-cyan-300 text-sm">
                <FiUserCheck className="h-4 w-4 text-cyan-400" />
                <span className="font-semibold">المنشئ:</span>
                <span>
                  {members.find((m) => m.users?.id === group.creator_id)?.users
                    ?.display_name || "مستخدم"}
                </span>
              </div>
            )}
            {group?.description && (
              <div className="flex items-center gap-2 text-cyan-300 text-sm col-span-2">
                <FiInfo className="h-4 w-4 text-cyan-400" />
                <span className="font-semibold">الوصف:</span>
                <span className="text-cyan-100">{group.description}</span>
              </div>
            )}
            {group?.updated_at && (
              <div className="flex items-center gap-2 text-cyan-300 text-sm col-span-2">
                <FiRefreshCw className="h-4 w-4 text-cyan-400" />
                <span className="font-semibold">آخر تحديث:</span>
                <span>
                  {new Intl.DateTimeFormat("ar", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    calendar: "gregory",
                  }).format(new Date(group.updated_at))}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Settings button (right, same row as group metadata) */}
        <div className="flex items-center">
          {currentUserRole === "manager" && (
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-full bg-gray-800 hover:bg-cyan-900 border border-cyan-700 shadow"
              aria-label="Group Settings"
            >
              <FiSettings className="h-6 w-6 text-sky-400" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
