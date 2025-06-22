/**
 * A collection of utility functions for the Group page.
 * This helps to keep the main page component cleaner and more focused on rendering.
 */

import { toast } from "sonner";

/**
 * Formats an amount with the given currency code, using symbol if available, otherwise code.
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export function formatCurrency(amount, currency = "USD") {
  if (!currency) currency = "USD";
  // Use Intl.NumberFormat for English numerals and currency code
  try {
    return `${new Intl.NumberFormat("en-US", {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} ${currency}`;
  } catch {
    // Fallback: show as 12.34 USD
    return `${parseFloat(amount).toFixed(2)} ${currency}`;
  }
}

/**
 * Formats an activity log entry into a human-readable string.
 * @param {object} log - The activity log object.
 * @param {string} [groupCurrency] - The default group currency to use if payload.currency is missing.
 * @returns {string} A formatted description of the activity.
 */
export const formatActivity = (log, groupCurrency) => {
  const userName = log.user?.display_name || log.user?.username || "مستخدم";
  const payload = log.payload || {};
  // Use payload.currency, then groupCurrency, then USD
  const currency = payload.currency || groupCurrency || "USD";
  const amount = formatCurrency(payload.amount || 0, currency);

  switch (log.action_type) {
    case "payment_added":
      return `${userName} أضاف دفعة بقيمة ${amount} لـ \"${payload.description}\"`;
    case "payment_deleted":
      return `${userName} حذف دفعة بقيمة ${amount} لـ \"${payload.description}\"`;
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
    case "update_settings":
      return `${userName} قام بتحديث إعدادات المجموعة`;
    case "promote_member":
      return `${userName} قام بترقية عضو إلى مدير`;
    case "demote_manager":
      return `${userName} قام بتنزيل مدير إلى عضو`;
    case "kick_member":
      return `${userName} قام بطرد عضو من المجموعة`;
    default:
      // Show a user-friendly Arabic message for unknown actions
      return `${userName} قام بإجراء غير معروف (${log.action_type})`;
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

// Add BOM for UTF-8
const BOM = "\uFEFF";

// Arabic label mapping for action types
const actionTypeLabels = {
  payment_added: "إضافة دفعة",
  payment_deleted: "حذف دفعة",
  group_created: "إنشاء مجموعة",
  settlement_propose: "اقتراح تسوية",
  settlement_proposed: "اقتراح تسوية",
  settlement_confirmed: "تأكيد تسوية",
  settlement_rejected: "رفض تسوية",
  member_joined: "انضمام عضو",
  member_left: "مغادرة عضو",
  group_settings_updated: "تحديث الإعدادات",
  update_settings: "تحديث الإعدادات",
  promote_member: "ترقية إلى مدير",
  demote_manager: "تنزيل إلى عضو",
  kick_member: "طرد عضو",
  // Add new action types here as needed
};

function getActionTypeLabel(type) {
  // Defensive: try direct, lower, and snake-case match
  if (["promote_member", "demote_manager", "kick_member"].includes(type)) {
    // console.log("DEBUG: Should map", type, "to", actionTypeLabels[type]);
  }
  if (actionTypeLabels[type]) return actionTypeLabels[type];
  const lower = type?.toLowerCase?.();
  if (lower && actionTypeLabels[lower]) return actionTypeLabels[lower];
  const snake = lower?.replace(/\s+/g, "_");
  if (snake && actionTypeLabels[snake]) return actionTypeLabels[snake];
  return "إجراء غير معروف";
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
  // Arabic headers
  const headers = ["الاسم", "اسم المستخدم", "الرصيد", "تاريخ الانضمام"];
  const rows = balances.map((b) => ({
    الاسم: b.display_name,
    "اسم المستخدم": b.username,
    الرصيد: b.balance,
    "تاريخ الانضمام": b.joined_at
      ? new Date(b.joined_at).toLocaleDateString()
      : "",
  }));
  const csv = toCSV(rows, headers);
  const blob = new Blob([BOM + csv], { type: "text/csv" });
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
 * @param {object} group - The group object.
 */
export const handleExportActivity = (activityLogs, groupId, group = {}) => {
  if (!activityLogs || activityLogs.length === 0) {
    return toast.error("لا يوجد سجل نشاط للتصدير");
  }
  // Arabic headers
  const headers = ["المستخدم", "نوع الإجراء", "الوصف", "تاريخ الإنشاء"];
  const rows = activityLogs.map((log) => {
    return {
      المستخدم: log.user?.display_name || log.user?.username || "مستخدم",
      "نوع الإجراء": getActionTypeLabel(log.action_type),
      الوصف: formatActivity(log, group.currency),
      "تاريخ الإنشاء": log.created_at
        ? new Date(log.created_at).toLocaleString()
        : "",
    };
  });
  const csv = toCSV(rows, headers);
  const blob = new Blob([BOM + csv], { type: "text/csv" });
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
