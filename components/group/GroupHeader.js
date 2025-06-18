import Link from "next/link";
import { FiSettings, FiCopy, FiShare2 } from "react-icons/fi";
import { toast } from "sonner";

export default function GroupHeader({
  group,
  members,
  user,
  currentUserRole,
  onSettingsClick,
  connectionStatus,
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
          console.error("Failed to copy invite code:", err);
          toast.error("فشل نسخ الرمز");
        }
      });
  };

  const handleShareGroup = async () => {
    const joinUrl = `${window.location.origin}/join/${group.id}`;
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
        console.error("Error sharing group:", err);
        toast.error("فشل في مشاركة المجموعة");
      }
    }
  };

  const currentUserMember = members.find(
    (m) => m.users?.supabase_auth_id === user?.id
  );

  return (
    <header className="w-full mb-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-8">
        {/* Left: Invite code and settings */}
        <div className="flex flex-row items-center gap-4 order-2 sm:order-1">
          {group?.invite_code_visible && (
            <div className="flex items-center gap-2 bg-gray-700 px-3 py-1 rounded-md text-sm text-indigo-300">
              <span>رمز الدعوة:</span>
              <span className="font-mono font-bold">{group.invite_code}</span>
            </div>
          )}
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="ml-2 p-2 rounded-full bg-indigo-700 hover:bg-indigo-800 text-white shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
              title="إعدادات المجموعة"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6l4 2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </button>
          )}
        </div>
        {/* Right: Group metadata */}
        <div className="flex flex-col items-start sm:items-end order-1 sm:order-2 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold">{group?.name}</h1>
            {connectionStatus && (
              <span
                title={
                  connectionStatus === "connected"
                    ? "متصل"
                    : connectionStatus === "connecting"
                    ? "جاري الاتصال"
                    : "غير متصل"
                }
                className={`inline-block w-3 h-3 rounded-full border ml-2
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
            )}
          </div>
          <div className="text-gray-400 text-sm flex flex-col gap-1">
            {group?.description && <span>{group.description}</span>}
            {group?.updated_at && (
              <span>
                آخر تحديث:{" "}
                {new Intl.DateTimeFormat("ar", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  calendar: "gregory",
                }).format(new Date(group.updated_at))}
              </span>
            )}
            {group?.creator_id && members && (
              <span>
                المدير:{" "}
                {members.find((m) => m.users?.id === group.creator_id)?.users
                  ?.display_name || "مستخدم"}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
