import {
  FiDollarSign,
  FiArrowUp,
  FiArrowDown,
  FiUserX,
  FiLogOut,
} from "react-icons/fi";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import ConfirmationModal from "./ConfirmationModal";
import { formatCurrency } from "../../app/group/[groupId]/utils";

function StatCard({ title, value, subtext, isCurrency = true, currency }) {
  return (
    <div className="p-3 bg-gray-700 rounded-lg">
      <p className="text-gray-400">{title}</p>
      <p className="text-lg font-semibold">
        {isCurrency ? formatCurrency(value, currency) : value}
      </p>
      {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
    </div>
  );
}

export default function BalanceSummary(props) {
  const {
    balances,
    currentUserDbId,
    paymentStats,
    canExportData,
    onExport,
    currentUserRole,
    group,
    refetchGroupData,
    user,
  } = props;

  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: null,
    loading: false,
  });

  // Guard: show loading if group is not loaded yet
  if (!group) {
    return <div>جاري تحميل بيانات المجموعة...</div>;
  }

  // Helper: is current user the creator?
  const isCreator = group?.creator_id === currentUserDbId;

  // Handler: Promote/Demote/Kick/Leave
  const handleRoleChange = async (targetUserId, newRole) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "update-member-role",
        {
          body: {
            group_id: group.id,
            target_user_id: targetUserId,
            new_role: newRole,
          },
        }
      );
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast.success(data?.message || "تم تحديث الدور بنجاح");
      refetchGroupData();
    } catch (err) {
      toast.error(err.message || "فشل تحديث الدور");
    } finally {
      setActionLoading(false);
    }
  };

  const handleKick = async (targetUserId) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("kick-group-member", {
        body: {
          group_id: group.id,
          user_to_kick_id: targetUserId,
        },
      });
      if (error) throw new Error(error.message);
      toast.success("تم طرد العضو بنجاح");
      refetchGroupData();
    } catch (err) {
      toast.error(err.message || "فشل طرد العضو");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("leave-group", {
        body: { group_id: group.id },
      });
      if (error || data?.error) {
        // Special message for creator
        if ((data?.error || error?.message)?.includes("creator cannot leave")) {
          toast.error(
            "لا يمكن للمنشئ مغادرة مجموعته. يجب حذف المجموعة أو نقل الملكية أولاً."
          );
        } else {
          toast.error(data?.error || error?.message || "فشل مغادرة المجموعة");
        }
        return;
      }
      toast.success(data?.message || "لقد غادرت المجموعة بنجاح");
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err.message || "فشل مغادرة المجموعة");
    } finally {
      setActionLoading(false);
    }
  };

  const openConfirm = (title, description, onConfirm) => {
    setConfirmModal({
      open: true,
      title,
      description,
      onConfirm,
      loading: false,
    });
  };
  const closeConfirm = () => setConfirmModal((m) => ({ ...m, open: false }));
  const handleModalConfirm = async () => {
    setConfirmModal((m) => ({ ...m, loading: true }));
    try {
      await confirmModal.onConfirm();
      closeConfirm();
    } catch (e) {
      closeConfirm();
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">ملخص الحسابات</h2>
        {canExportData && (
          <button
            onClick={onExport}
            className="px-3 py-1 text-sm font-medium text-white bg-cyan-700 rounded-lg hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 shadow"
          >
            تصدير البيانات
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {balances.map((member) => {
          const isCurrentUser = member.user_id === currentUserDbId;
          const isTargetManager = member.role === "manager";
          const isTargetMember = member.role === "member";
          // Always use isCreator for creator privileges
          const canPromote =
            (isCreator && isTargetMember) ||
            (!isCreator &&
              currentUserRole === "manager" &&
              isTargetMember &&
              !isCurrentUser);
          const canDemote =
            isCreator &&
            isTargetManager &&
            !isCurrentUser &&
            member.user_id !== group.creator_id;
          const canKick =
            (isCreator &&
              !isCurrentUser &&
              member.user_id !== group.creator_id) ||
            (!isCreator &&
              currentUserRole === "manager" &&
              isTargetMember &&
              !isCurrentUser);
          const canLeave = isCurrentUser && !isCreator;
          // Determine badge label and color
          let roleLabel = null;
          if (member.role === "manager") roleLabel = "مدير";
          else if (member.role === "member") roleLabel = "عضو";

          return (
            <div
              key={member.user_id}
              className={`p-4 rounded-lg ${
                isCurrentUser ? "border-2 border-cyan-500 " : ""
              }${
                member.balance > 0
                  ? "bg-green-900/50"
                  : member.balance < 0
                  ? "bg-red-900/50"
                  : "bg-gray-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">
                  {isCurrentUser
                    ? "أنت"
                    : member.display_name || member.username || "مستخدم"}
                </p>
                {roleLabel && (
                  <span className="text-xs bg-cyan-700 text-white px-2 py-1 rounded-full">
                    {roleLabel}
                  </span>
                )}
              </div>
              <p
                className={`text-lg ${
                  member.balance > 0
                    ? "text-green-400"
                    : member.balance < 0
                    ? "text-red-400"
                    : "text-gray-400"
                }`}
              >
                {member.balance > 0 ? "+" : ""}
                {formatCurrency(member.balance, group.currency)}
              </p>
              {isCurrentUser && member.balance !== 0 && (
                <p className="text-sm mt-2 text-gray-400">
                  {member.balance > 0
                    ? "مستحق لك من المجموعة"
                    : "عليك للمجموعة"}
                </p>
              )}
              {member.joined_at && (
                <p className="text-sm mt-1 text-gray-400">
                  عضو منذ{" "}
                  {new Intl.DateTimeFormat("ar", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(member.joined_at))}
                </p>
              )}
              {/* Action buttons */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {canPromote && (
                  <button
                    disabled={actionLoading}
                    onClick={() =>
                      openConfirm(
                        "تأكيد ترقية العضو إلى مدير",
                        `هل أنت متأكد أنك تريد ترقية ${
                          member.display_name || member.username || "هذا العضو"
                        } إلى مدير؟`,
                        () => handleRoleChange(member.user_id, "manager")
                      )
                    }
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-800"
                  >
                    <FiArrowUp /> ترقية
                  </button>
                )}
                {canDemote && (
                  <button
                    disabled={actionLoading}
                    onClick={() =>
                      openConfirm(
                        "تأكيد تنزيل المدير إلى عضو",
                        `هل أنت متأكد أنك تريد تنزيل ${
                          member.display_name || member.username || "هذا المدير"
                        } إلى عضو؟`,
                        () => handleRoleChange(member.user_id, "member")
                      )
                    }
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-700 text-white rounded hover:bg-yellow-800"
                  >
                    <FiArrowDown /> تنزيل
                  </button>
                )}
                {canKick && (
                  <button
                    disabled={actionLoading}
                    onClick={() =>
                      openConfirm(
                        "تأكيد طرد العضو",
                        `هل أنت متأكد أنك تريد طرد ${
                          member.display_name || member.username || "هذا العضو"
                        } من المجموعة؟`,
                        () => handleKick(member.user_id)
                      )
                    }
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-800"
                  >
                    <FiUserX /> طرد
                  </button>
                )}
                {canLeave && (
                  <button
                    disabled={actionLoading}
                    onClick={() =>
                      openConfirm(
                        "تأكيد مغادرة المجموعة",
                        "هل أنت متأكد أنك تريد مغادرة هذه المجموعة؟ لن تتمكن من العودة إلا بدعوة جديدة.",
                        () => handleLeave()
                      )
                    }
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-800"
                  >
                    <FiLogOut /> مغادرة
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <StatCard
          title="إجمالي ما دفعت"
          value={paymentStats.totalPaid.toFixed(2)}
          subtext="(شامل المدفوعات والتسويات)"
          currency={group.currency}
        />
        <StatCard
          title="إجمالي ما استلمت"
          value={paymentStats.totalReceived.toFixed(2)}
          subtext="(شامل المستحقات والتسويات)"
          currency={group.currency}
        />
        <div className="sm:col-span-1 col-span-2">
          <StatCard
            title="متوسط مصاريف المجموعة الشهرية"
            value={paymentStats.monthlyAverage.toFixed(2)}
            subtext="(منذ إنشاء المجموعة)"
            currency={group.currency}
          />
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmModal.open}
        onClose={closeConfirm}
        onConfirm={handleModalConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        loading={confirmModal.loading}
      />
    </div>
  );
}
