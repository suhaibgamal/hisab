import { useState } from "react";

export default function ActivityLog({
  activityLogs,
  canViewActivityLogs,
  canExportData,
  onExport,
  formatActivity,
  user,
}) {
  const [showAllLogs, setShowAllLogs] = useState(false);

  if (!canViewActivityLogs) {
    return null;
  }

  const getActionTypeStyle = (actionType) => {
    switch (actionType) {
      case "payment_added":
        return "bg-green-900/50 text-green-400";
      case "payment_deleted":
        return "bg-red-900/50 text-red-400";
      case "settlement_initiated":
        return "bg-yellow-900/50 text-yellow-400";
      case "settlement_confirmed":
        return "bg-blue-900/50 text-blue-400";
      case "settlement_cancelled":
        return "bg-red-900/50 text-red-400";
      case "group_created":
        return "bg-indigo-900/50 text-indigo-400";
      case "member_joined":
        return "bg-green-900/50 text-green-400";
      case "member_left":
        return "bg-red-900/50 text-red-400";
      case "group_settings_updated":
      case "update_settings":
        return "bg-blue-900/50 text-blue-400";
      default:
        return "bg-gray-700 text-gray-400";
    }
  };

  const sanitize = (str) => {
    if (!str) return "";
    return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  const getActionTypeText = (actionType) => {
    switch (actionType) {
      case "payment_added":
        return "دفعة جديدة";
      case "payment_deleted":
        return "حذف دفعة";
      case "group_created":
        return "إنشاء مجموعة";
      case "settlement_initiated":
        return "تسوية معلقة";
      case "settlement_confirmed":
        return "تسوية مؤكدة";
      case "settlement_cancelled":
        return "تسوية ملغاة";
      case "member_joined":
        return "عضو جديد";
      case "member_left":
        return "مغادرة عضو";
      case "group_settings_updated":
      case "update_settings":
        return "تحديث الإعدادات";
      case "role_promoted":
        return "ترقية عضو";
      case "role_demoted":
        return "تنزيل عضو";
      case "member_kicked":
        return "طرد عضو";
      default:
        return sanitize(actionType);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">سجل النشاط</h2>
        {canExportData && (
          <button
            onClick={onExport}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-md flex items-center gap-2"
          >
            <span>تصدير السجل</span>
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
        )}
      </div>

      {activityLogs.length > 0 ? (
        <>
          <div className="space-y-4">
            {activityLogs
              .slice(0, showAllLogs ? undefined : 5)
              .map((log, index) => (
                <div
                  key={log.id}
                  className={`p-4 bg-gray-900/50 rounded-lg ${
                    index === 0 ? "border-2 border-indigo-500" : ""
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        <span className="text-indigo-400">
                          {log.user?.id === user?.id
                            ? "أنت"
                            : sanitize(log.user?.display_name)}
                        </span>{" "}
                        {sanitize(formatActivity(log))}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Intl.DateTimeFormat("ar", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          calendar: "gregory",
                        }).format(new Date(log.created_at))}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getActionTypeStyle(
                        log.action_type
                      )}`}
                    >
                      {getActionTypeText(log.action_type)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
          {activityLogs.length > 5 && (
            <button
              onClick={() => setShowAllLogs(!showAllLogs)}
              className="mt-4 w-full py-2 text-center text-indigo-400 hover:text-indigo-300"
            >
              {showAllLogs ? "عرض أقل" : `عرض الكل (${activityLogs.length})`}
            </button>
          )}
        </>
      ) : (
        <p className="text-center text-gray-400 py-4">لا يوجد نشاط حتى الآن</p>
      )}
    </div>
  );
}
