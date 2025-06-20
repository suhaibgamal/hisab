/**
 * A collection of utility functions for the Group page.
 * This helps to keep the main page component cleaner and more focused on rendering.
 */

import { toast } from "sonner";

/**
 * Formats an activity log entry into a human-readable string.
 * @param {object} log - The activity log object.
 * @returns {string} A formatted description of the activity.
 */
export const formatActivity = (log) => {
  const userName = log.user?.display_name || log.user?.username || "مستخدم";
  const payload = log.payload || {};
  const amount = `$${parseFloat(payload.amount || 0).toFixed(2)}`;

  switch (log.action_type) {
    case "payment_added":
      return `${userName} أضاف دفعة بقيمة ${amount} لـ "${payload.description}"`;
    case "payment_deleted":
      return `${userName} حذف دفعة بقيمة ${amount} لـ "${payload.description}"`;
    case "group_created":
      return `${userName} أنشأ المجموعة '${payload.group_name || ""}'`;
    case "settlement_propose":
    case "settlement_proposed":
      return `${userName} بدأ تسوية مع ${
        payload.to_user_name || "مستخدم"
      } بقيمة ${amount}`;
    case "settlement_confirmed":
      return `${userName} أكد التسوية من ${
        payload.from_user_name || "مستخدم"
      } بقيمة ${amount}`;
    case "settlement_rejected":
      return `${userName} رفض التسوية من ${
        payload.from_user_name || "مستخدم"
      } بقيمة ${amount}`;
    case "member_joined":
      return `${userName} انضم للمجموعة`;
    case "member_left":
      return `${userName} غادر المجموعة`;
    case "group_settings_updated":
      return `${userName} قام بتحديث إعدادات المجموعة`;
    default:
      return (
        log.description || `${userName} قام بنشاط غير معروف: ${log.action_type}`
      );
  }
};

/**
 * Generates a CSV file from an array of objects and triggers a download.
 * @param {Array<object>} rows - The data rows.
 * @param {Array<string>} headers - The CSV headers.
 * @param {string} filename - The name of the file to download.
 */
function toCSV(rows, headers) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

/**
 * Handles the logic for exporting group balances to a CSV file.
 * @param {Array<object>} balances - The group balance data.
 * @param {string} groupId - The ID of the current group.
 */
export const handleExportBalances = (balances, groupId) => {
  if (!balances || balances.length === 0) {
    return toast.error("لا يوجد بيانات للتصدير");
  }
  const headers = ["display_name", "username", "balance", "joined_at"];
  const rows = balances.map((b) => ({
    display_name: b.display_name,
    username: b.username,
    balance: b.balance,
    joined_at: b.joined_at ? new Date(b.joined_at).toLocaleDateString() : "",
  }));
  const csv = toCSV(rows, headers);
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `group_balances_${groupId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

/**
 * Handles the logic for exporting group activity to a CSV file.
 * @param {Array<object>} activityLogs - The group activity data.
 * @param {string} groupId - The ID of the current group.
 */
export const handleExportActivity = (activityLogs, groupId) => {
  if (!activityLogs || activityLogs.length === 0) {
    return toast.error("لا يوجد سجل نشاط للتصدير");
  }
  const headers = ["user", "action_type", "description", "created_at"];
  const rows = activityLogs.map((log) => ({
    user: log.user?.display_name || log.user?.username || "مستخدم",
    action_type: log.action_type,
    description: formatActivity(log),
    created_at: log.created_at ? new Date(log.created_at).toLocaleString() : "",
  }));
  const csv = toCSV(rows, headers);
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `group_activity_${groupId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

/**
 * Returns the display name for a user object. If it's the current user, returns "You".
 * @param {object} userObj - The user object from the database.
 * @param {string} currentUserDbId - The database ID of the currently logged-in user.
 * @returns {string} The name to display.
 */
export const getDisplayName = (userObj, currentUserDbId) => {
  if (!userObj) return "مستخدم";
  return userObj.id === currentUserDbId
    ? "أنت"
    : userObj.display_name || userObj.username;
};
