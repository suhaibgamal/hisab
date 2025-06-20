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

  const shouldShowInviteCode =
    group?.invite_code_visible || currentUserRole === "manager";

  return (
    <header className="w-full mb-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-8">
        {/* Right: Invite code and settings */}
        <div className="flex flex-row items-center gap-4 order-1 sm:order-2">
          {shouldShowInviteCode && (
            <div className="flex items-center gap-1 bg-gray-800 px-2 py-0.5 rounded text-xs text-indigo-200">
              <span>رمز الدعوة:</span>
              <span className="font-mono font-bold text-base">
                {group.invite_code}
              </span>
              <button
                onClick={handleCopyInviteCode}
                className="p-1 rounded hover:bg-indigo-900 focus:outline-none"
                title="نسخ رمز الدعوة"
              >
                <FiCopy className="w-3 h-3" />
              </button>
              <button
                onClick={handleShareGroup}
                className="p-1 rounded hover:bg-indigo-900 focus:outline-none"
                title="مشاركة المجموعة"
              >
                <FiShare2 className="w-3 h-3" />
              </button>
            </div>
          )}
          {onSettingsClick && currentUserRole === "manager" && (
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-full bg-indigo-800 hover:bg-indigo-900 text-white shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
              title="إعدادات المجموعة"
            >
              <FiSettings className="w-5 h-5" />
            </button>
          )}
        </div>
        {/* Left: Group metadata */}
        <div className="flex flex-col items-start sm:items-start order-2 sm:order-1 flex-1">
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
