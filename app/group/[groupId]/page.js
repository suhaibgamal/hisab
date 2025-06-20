"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";

// Import Hooks
import { useGroupData } from "./hooks/useGroupData";
import { useRealtime } from "./hooks/useRealtime";

// Import Components
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorMessage from "../../../components/ErrorMessage";
import ErrorBoundary from "../../../components/ErrorBoundary";
import GroupNotFound from "../../../components/GroupNotFound";
import GroupHeader from "../../../components/group/GroupHeader";
import BalanceSummary from "../../../components/group/BalanceSummary";
import DebtSummary from "../../../components/group/DebtSummary";
import AddPaymentForm from "../../../components/group/AddPaymentForm";
import PaymentsList from "../../../components/group/PaymentsList";
import ActivityLog from "../../../components/group/ActivityLog";
import SettingsModal from "../../../components/group/SettingsModal";
import ConfirmationModal from "../../../components/group/ConfirmationModal";

// Import Utilities
import {
  formatActivity,
  handleExportBalances,
  handleExportActivity,
  getDisplayName,
} from "./utils";

export default function GroupPage() {
  const { groupId } = useParams();

  // --- DATA & STATE MANAGEMENT (now in hooks) ---
  const {
    loading: isDataLoading,
    error,
    fatalError,
    user,
    group,
    members,
    payments,
    settlements,
    activityLogs,
    balances,
    debts,
    currentUserDbId,
    currentUserRole,
    setGroup,
    fetchGroupData,
  } = useGroupData(groupId);

  const handleRealtimeEvent = useCallback(
    (payload) => {
      console.log("Realtime event received:", payload);
      // If the group settings change, update the group state directly.
      if (payload.table === "groups" && payload.eventType === "UPDATE") {
        toast.info("تم تحديث إعدادات المجموعة بواسطة مدير.");
        setGroup(payload.new);
      } else {
        // For any other event (new payments, deleted payments, new members, etc.),
        // the safest and most reliable action is to refetch all data.
        toast.info("يتم تحديث البيانات...");
        fetchGroupData(false);
      }
    },
    [fetchGroupData, setGroup]
  );

  const connectionStatus = useRealtime(groupId, handleRealtimeEvent);

  // --- MODAL & LOADING STATES ---
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isConfirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    description: "",
    onConfirm: null,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // --- SETTINGS FORM STATE ---
  const [settings, setSettings] = useState({
    name: "",
    description: "",
    password: "",
    member_limit: null,
    invite_code_visible: true,
    activity_log_privacy: "managers",
    export_control: "managers",
    privacy_level: "public",
    updated_at: null,
  });

  useEffect(() => {
    if (group) {
      setSettings({
        name: group.name || "",
        description: group.description || "",
        password: "", // Always clear password field on open
        member_limit: group.member_limit || null,
        invite_code_visible: group.invite_code_visible ?? true,
        activity_log_privacy: group.activity_log_privacy || "managers",
        export_control: group.export_control || "managers",
        privacy_level:
          group.privacy_level ||
          (group.password && group.password.length > 0 ? "private" : "public"),
        updated_at: group.updated_at,
      });
    }
  }, [group]);

  // --- DERIVED STATE & MEMOS ---
  const paymentStats = useMemo(() => {
    if (!currentUserDbId || !payments.length)
      return { totalPaid: 0, totalReceived: 0, monthlyAverage: 0 };
    const firstActivityDate = Math.min(
      ...payments.map((p) => new Date(p.created_at).getTime()),
      new Date(group?.created_at || Date.now()).getTime()
    );
    const totalPaid =
      payments.reduce((sum, p) => {
        const payerSplit = p.splits.find((s) => s.amount > 0);
        return payerSplit && payerSplit.user_id === currentUserDbId
          ? sum + payerSplit.amount
          : sum;
      }, 0) +
      settlements.reduce(
        (sum, s) => (s.from_user_id === currentUserDbId ? sum + s.amount : sum),
        0
      );
    const totalReceived =
      payments.reduce((sum, p) => {
        const userSplit = p.splits.find(
          (s) => s.user_id === currentUserDbId && s.amount < 0
        );
        return userSplit ? sum + Math.abs(userSplit.amount) : sum;
      }, 0) +
      settlements.reduce(
        (sum, s) => (s.to_user_id === currentUserDbId ? sum + s.amount : sum),
        0
      );
    const totalGroupSpending = payments.reduce((sum, p) => {
      const payerSplit = p.splits.find((s) => s.amount > 0);
      return sum + (payerSplit ? payerSplit.amount : 0);
    }, 0);
    const monthsSinceStart = Math.max(
      Math.ceil((Date.now() - firstActivityDate) / (30 * 24 * 60 * 60 * 1000)),
      1
    );
    return {
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalReceived: parseFloat(totalReceived.toFixed(2)),
      monthlyAverage: parseFloat(
        (totalGroupSpending / monthsSinceStart).toFixed(2)
      ),
    };
  }, [payments, settlements, currentUserDbId, group?.created_at]);

  const canExportData = useMemo(
    () => currentUserRole === "manager" || group?.export_control === "all",
    [group, currentUserRole]
  );
  const canViewActivityLogs = useMemo(
    () =>
      currentUserRole === "manager" || group?.activity_log_privacy === "all",
    [group, currentUserRole]
  );

  // --- HANDLER FUNCTIONS ---
  const handleAddPayment = async ({
    description,
    amount,
    selectedBeneficiaries,
  }) => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      return toast.error("Please fill all fields with valid values.");
    }
    setPaymentLoading(true);
    try {
      const share = parseFloat(
        (parsedAmount / selectedBeneficiaries.length).toFixed(2)
      );
      const splits = [
        { user_id: currentUserDbId, amount: parsedAmount },
        ...selectedBeneficiaries.map((id) => ({
          user_id: members.find((m) => m.id === id).users.id,
          amount: -share,
        })),
      ];
      // Use the new secure RPC
      const { error } = await supabase.functions.invoke("add-payment", {
        body: { group_id: groupId, description: description.trim(), splits },
      });
      if (error) throw error;
      toast.success("تمت إضافة الدفعة!");
      fetchGroupData(false);
    } catch (err) {
      toast.error("فشل الإضافة: " + err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDeletePayment = (paymentId) => {
    setModalContent({
      title: "حذف الدفعة",
      description: "هل أنت متأكد؟ لا يمكن التراجع عن هذا.",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          // Use the new secure RPC
          const { error } = await supabase.functions.invoke("delete-payment", {
            body: { group_id: groupId, payment_id: paymentId },
          });
          if (error) throw error;
          toast.success("تم حذف الدفعة بنجاح.");
          setConfirmationModalOpen(false);
          fetchGroupData(false);
        } catch (err) {
          toast.error("فشل الحذف: " + err.message);
        } finally {
          setActionLoading(false);
        }
      },
    });
    setConfirmationModalOpen(true);
  };

  const handleInitiateSettlement = async (toUserId, amount) => {
    if (settlementLoading) return;
    setSettlementLoading(true);
    try {
      const toUser = members.find((m) => m.users.id === toUserId)?.users;
      const description = `Settlement to ${
        toUser?.display_name || toUser?.username || "user"
      }`;
      // Use the new secure RPC
      const { error } = await supabase.functions.invoke("add-settlement", {
        body: {
          group_id: groupId,
          to_user_id: toUserId,
          amount,
          description,
        },
      });
      if (error) throw error;
      toast.success("تم إرسال عرض التسوية!");
      fetchGroupData(false);
    } catch (err) {
      toast.error("فشل إرسال العرض: " + err.message);
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleConfirmSettlement = async (transactionId) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("confirm_settlement", {
        p_transaction_id: transactionId,
      });
      if (error) throw error;
      toast.success("تم تأكيد التسوية!");
      fetchGroupData(false);
    } catch (err) {
      toast.error("فشل تأكيد التسوية: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSettlement = async (transactionId) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("reject_settlement", {
        p_transaction_id: transactionId,
      });
      if (error) throw error;
      toast.success("تم رفض التسوية.");
      fetchGroupData(false);
    } catch (err) {
      toast.error("فشل رفض التسوية: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => {
      let next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "privacy_level" && value === "public") next.password = "";
      return next;
    });
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      const payload = { ...settings, group_id: groupId };
      if (payload.privacy_level === "public") payload.password = "";
      if (payload.privacy_level === "private" && !payload.password) {
        throw new Error("يجب تعيين كلمة مرور للمجموعة الخاصة");
      }

      const { error } = await supabase.functions.invoke(
        "update-group-settings",
        { body: payload }
      );
      if (error) throw error;

      toast.success("تم تحديث الإعدادات!");
      setSettingsModalOpen(false);
    } catch (err) {
      toast.error("فشل التحديث: " + err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  // --- RENDER LOGIC ---
  if (isDataLoading) return <LoadingSpinner />;
  if (fatalError) return <GroupNotFound message={fatalError} />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <ErrorBoundary>
      <main className="flex flex-col items-center min-h-screen p-4 sm:p-8 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
        <div className="w-full max-w-7xl">
          <GroupHeader
            group={group}
            members={members}
            user={user}
            currentUserRole={currentUserRole}
            onSettingsClick={
              currentUserRole === "manager"
                ? () => setSettingsModalOpen(true)
                : undefined
            }
            connectionStatus={connectionStatus}
          />

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
                <BalanceSummary
                  balances={balances}
                  currentUserDbId={currentUserDbId}
                  paymentStats={paymentStats}
                  canExportData={canExportData}
                  onExport={() => handleExportBalances(balances, groupId)}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
                <DebtSummary
                  debts={debts}
                  settlements={settlements}
                  members={members}
                  user={user}
                  currentUserDbId={currentUserDbId}
                  settlementLoading={settlementLoading}
                  actionLoading={actionLoading}
                  onInitiateSettlement={handleInitiateSettlement}
                  onConfirmSettlement={handleConfirmSettlement}
                  onRejectSettlement={handleRejectSettlement}
                  getDisplayName={(userObj) =>
                    getDisplayName(userObj, currentUserDbId)
                  }
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
                <AddPaymentForm
                  members={members}
                  user={user}
                  onAddPayment={handleAddPayment}
                  paymentLoading={paymentLoading}
                />
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
                <PaymentsList
                  payments={payments}
                  currentUserDbId={currentUserDbId}
                  currentUserRole={currentUserRole}
                  onDeletePayment={handleDeletePayment}
                  loading={actionLoading}
                  getDisplayName={(userObj) =>
                    getDisplayName(userObj, currentUserDbId)
                  }
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
                <ActivityLog
                  activityLogs={activityLogs}
                  canViewActivityLogs={canViewActivityLogs}
                  canExportData={canExportData}
                  onExport={() => handleExportActivity(activityLogs, groupId)}
                  formatActivity={formatActivity}
                  user={user}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onSubmit={handleUpdateSettings}
        members={members}
        loading={settingsLoading}
      />
      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setConfirmationModalOpen(false)}
        onConfirm={modalContent.onConfirm}
        title={modalContent.title}
        description={modalContent.description}
        loading={actionLoading}
      />
    </ErrorBoundary>
  );
}
