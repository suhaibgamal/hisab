import { useState } from "react";
import { formatCurrency } from "../../app/group/[groupId]/utils";

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
      case "settlement_propose":
      case "settlement_proposed":
        return "bg-yellow-900/50 text-yellow-400";
      case "settlement_confirmed":
        return "bg-blue-900/50 text-blue-400";
      case "settlement_rejected":
      case "settlement_cancelled":
        return "bg-red-900/50 text-red-400";
      case "group_created":
        return "bg-cyan-900/50 text-cyan-400";
      case "member_joined":
        return "bg-green-900/50 text-green-400";
      case "member_left":
        return "bg-red-900/50 text-red-400";
      case "group_settings_updated":
      case "update_settings":
        return "bg-cyan-900/50 text-cyan-400";
      case "promote_member":
        return "bg-blue-900/50 text-blue-400";
      case "demote_manager":
        return "bg-red-900/50 text-red-400";
      case "kick_member":
        return "bg-red-900/50 text-red-400";
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
      case "settlement_propose":
      case "settlement_proposed":
        return "تسوية مقترحة";
      case "settlement_confirmed":
        return "تسوية مؤكدة";
      case "settlement_rejected":
      case "settlement_cancelled":
        return "تسوية مرفوضة";
      case "member_joined":
        return "عضو جديد";
      case "member_left":
        return "مغادرة عضو";
      case "group_settings_updated":
      case "update_settings":
        return "تحديث الإعدادات";
      case "promote_member":
        return "ترقية عضو";
      case "demote_manager":
        return "تنزيل عضو";
      case "kick_member":
        return "طرد عضو";
      default:
        return "إجراء غير معروف";
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">سجل النشاط</h2>
        {canExportData && (
          <button
            onClick={onExport}
            className="px-3 py-1 text-sm bg-cyan-700 hover:bg-cyan-800 rounded-lg flex items-center gap-2 text-white"
          >
            <span>تصدير السجل</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-cyan-400"
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
              .map((log, index) => {
                const activity = formatActivity(log);
                const hasLabel = typeof activity === "object" && activity.label;
                return (
                  <div
                    key={log.id}
                    className={`p-4 bg-gray-900/50 rounded-lg ${
                      index === 0 ? "border-2 border-cyan-400" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {hasLabel ? activity.message : activity}
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
                      {hasLabel ? (
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            activity.labelType === "promote"
                              ? "bg-blue-700 text-white"
                              : activity.labelType === "demote"
                              ? "bg-red-700 text-white"
                              : activity.labelType === "kick"
                              ? "bg-red-700 text-white"
                              : "bg-gray-600 text-white"
                          }`}
                        >
                          {activity.label}
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${getActionTypeStyle(
                            log.action_type
                          )}`}
                        >
                          {getActionTypeText(log.action_type)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          {activityLogs.length > 5 && (
            <button
              onClick={() => setShowAllLogs(!showAllLogs)}
              className="mt-4 w-full py-2 text-center text-cyan-400 hover:text-cyan-300"
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
