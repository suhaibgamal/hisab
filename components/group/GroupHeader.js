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
            <div className="flex items-center gap-2 text-end px-3 py-1.5 rounded-lg border border-cyan-400">
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
        {/* Group metadata */}
        <div className="flex flex-col items-start sm:items-start flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold text-white">{group?.name}</h1>
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
          <div className="text-cyan-200 text-sm flex flex-col gap-1">
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
                المنشئ:{" "}
                {members.find((m) => m.users?.id === group.creator_id)?.users
                  ?.display_name || "مستخدم"}
              </span>
            )}
          </div>
        </div>
        {/* Settings button (right, same row as group metadata) */}
        <div className="flex items-center">
          {currentUserRole === "manager" && (
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-full"
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
