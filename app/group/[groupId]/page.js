"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  // All hooks at the top
  const { groupId } = useParams();
  const router = useRouter();

  // --- DATA & STATE MANAGEMENT (now in hooks) ---
  const {
    loading: isDataLoading,
    error,
    fatalError,
    user: groupUser,
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
    fetchPaymentsAndSettlements,
    fetchMembers,
  } = useGroupData(groupId);

  // --- REALTIME HOOK ---
  const handleRealtimeEvent = useCallback(
    (payload) => {
      if (payload.table === "groups" && payload.eventType === "UPDATE") {
        toast.info("تم تحديث إعدادات المجموعة بواسطة مدير.");
        setGroup(payload.new);
      } else if (payload.table === "transactions") {
        toast.info("تم تحديث الدفعات أو التسويات.");
        fetchPaymentsAndSettlements();
      } else if (payload.table === "group_members") {
        toast.info("تم تحديث الأعضاء.");
        fetchMembers();
      } else {
        toast.info("يتم تحديث البيانات...");
        fetchGroupData(false);
      }
    },
    [setGroup, fetchPaymentsAndSettlements, fetchMembers, fetchGroupData]
  );
  const { connectionStatus, reconnect } = useRealtime(
    groupId,
    handleRealtimeEvent
  );
  const [reconnecting, setReconnecting] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [reconnectTimeout, setReconnectTimeout] = useState(null);
  const [lastDisconnect, setLastDisconnect] = useState(null);

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

  // --- END OF HOOKS ---

  // Refetch on focus/visibilitychange
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchGroupData(false);
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [fetchGroupData]);

  useEffect(() => {
    let reconnectTimeout = null;
    let isUnmounted = false;

    const tryReconnect = () => {
      if (isUnmounted) return;
      if (navigator.onLine) {
        toast.info("محاولة إعادة الاتصال تلقائيًا...");
        reconnect();
        setRetryAttempts((prev) => prev + 1);
      } else {
        // If offline, schedule a retry in 7 seconds (fixed interval)
        reconnectTimeout = setTimeout(tryReconnect, 7000);
      }
    };

    const handleOnline = () => {
      // Immediately try to reconnect when back online
      if (connectionStatus === "disconnected") {
        tryReconnect();
      }
    };

    const handleOffline = () => {
      toast.error(
        "تم فقد الاتصال بالإنترنت. سيتم إعادة المحاولة تلقائيًا عند استعادة الاتصال."
      );
    };

    if (connectionStatus === "disconnected") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      // Exponential backoff when online, fixed interval when offline
      const delay = navigator.onLine
        ? Math.min(1000 * Math.pow(2, retryAttempts), 30000)
        : 7000;
      reconnectTimeout = setTimeout(tryReconnect, delay);
      toast.info(
        `إعادة الاتصال تلقائيًا خلال ${Math.round(delay / 1000)} ثانية...`
      );
    }

    return () => {
      isUnmounted = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [connectionStatus, retryAttempts, reconnect]);

  // Manual reconnect handler
  const handleReconnect = async () => {
    if (!navigator.onLine) {
      toast.error("تحقق من اتصال الإنترنت أولاً");
      return;
    }
    if (lastDisconnect && Date.now() - lastDisconnect < 7000) {
      toast.info("يرجى الانتظار قليلاً قبل إعادة المحاولة");
      return;
    }
    if (connectionStatus === "disconnected" && reconnectTimeout) {
      toast.info("هناك محاولة تلقائية جارية لإعادة الاتصال. يرجى الانتظار.");
      return;
    }
    setReconnecting(true);
    try {
      reconnect();
      setTimeout(() => setReconnecting(false), 1500);
    } catch {
      setReconnecting(false);
      toast.error("فشل الاتصال. حاول مجددًا بعد قليل.");
    }
  };

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
    // Only include active settlements in stats
    const activeSettlements = settlements.filter((s) => s.status === "active");
    const totalPaid =
      payments.reduce((sum, p) => {
        const payerSplit = p.splits.find((s) => s.amount > 0);
        return payerSplit && payerSplit.user_id === currentUserDbId
          ? sum + payerSplit.amount
          : sum;
      }, 0) +
      activeSettlements.reduce(
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
      activeSettlements.reduce(
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
    paymentDate,
    onSuccess,
  }) => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      return toast.error("يرجى ملء جميع الحقول بقيم صحيحة.");
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
      if (onSuccess) onSuccess();
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
      if (payload.privacy_level === "public") {
        payload.password = ""; // Explicitly clear password for public
      } else if (payload.privacy_level === "private" && !payload.password) {
        // Block submission if making private and no password entered
        toast.error("يجب تعيين كلمة مرور عند جعل المجموعة خاصة");
        setSettingsLoading(false);
        return;
      }
      // Always include password key
      if (!payload.password) payload.password = null;

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

  useEffect(() => {
    if (connectionStatus === "connected") {
      toast.success("تم الاتصال بالخادم بنجاح!");
    }
  }, [connectionStatus]);

  // --- RENDER LOGIC ---
  if (isDataLoading) return <LoadingSpinner />;
  if (fatalError) return <GroupNotFound message={fatalError} />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <ErrorBoundary>
      <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
        <div className="w-full max-w-7xl mx-auto">
          <GroupHeader
            group={group}
            members={members}
            user={groupUser}
            currentUserRole={currentUserRole}
            onSettingsClick={
              currentUserRole === "manager"
                ? () => setSettingsModalOpen(true)
                : undefined
            }
            connectionStatus={connectionStatus}
            reconnect={
              connectionStatus === "disconnected" ? handleReconnect : undefined
            }
            reconnecting={reconnecting}
          />

          <div className="flex flex-col lg:flex-row gap-8 mt-8">
            {/* Left column: Balance, Debts, Add Payment */}
            <div className="flex flex-col gap-8 lg:w-1/2 w-full">
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 w-full">
                <BalanceSummary
                  balances={balances}
                  currentUserDbId={currentUserDbId}
                  paymentStats={paymentStats}
                  canExportData={canExportData}
                  onExport={() => handleExportBalances(balances, groupId)}
                  group={group}
                  refetchGroupData={fetchGroupData}
                  currentUserRole={currentUserRole}
                  user={groupUser}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 w-full">
                <DebtSummary
                  debts={debts}
                  settlements={settlements}
                  members={members}
                  user={groupUser}
                  currentUserDbId={currentUserDbId}
                  settlementLoading={settlementLoading}
                  actionLoading={actionLoading}
                  onInitiateSettlement={handleInitiateSettlement}
                  onConfirmSettlement={handleConfirmSettlement}
                  onRejectSettlement={handleRejectSettlement}
                  getDisplayName={(userObj) =>
                    getDisplayName(userObj, currentUserDbId)
                  }
                  buttonClassName="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold shadow focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base"
                  iconClassName="w-5 h-5 text-cyan-400"
                  group={group}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 w-full">
                <AddPaymentForm
                  members={members}
                  user={groupUser}
                  onAddPayment={handleAddPayment}
                  paymentLoading={paymentLoading}
                  buttonClassName="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold shadow focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base"
                  iconClassName="w-5 h-5 text-cyan-400"
                  group={group}
                />
              </div>
            </div>
            {/* Right column: Payments List, Activity Log */}
            <div className="flex flex-col gap-8 lg:w-1/2 w-full">
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 w-full">
                <PaymentsList
                  payments={payments}
                  currentUserDbId={currentUserDbId}
                  currentUserRole={currentUserRole}
                  onDeletePayment={handleDeletePayment}
                  loading={actionLoading}
                  getDisplayName={(userObj) =>
                    getDisplayName(userObj, currentUserDbId)
                  }
                  buttonClassName="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold shadow focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base"
                  iconClassName="w-5 h-5 text-cyan-400"
                  group={group}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 w-full">
                <ActivityLog
                  activityLogs={activityLogs}
                  canViewActivityLogs={canViewActivityLogs}
                  canExportData={canExportData}
                  onExport={() => handleExportActivity(activityLogs, groupId)}
                  formatActivity={formatActivity}
                  user={groupUser}
                  buttonClassName="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold shadow focus:outline-none focus:ring-2 focus:ring-cyan-400 text-base"
                  iconClassName="w-5 h-5 text-cyan-400"
                  group={group}
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
        group={group}
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
