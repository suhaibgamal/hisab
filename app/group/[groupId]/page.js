"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";

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

export default function GroupPage() {
  const { groupId } = useParams();
  const router = useRouter();

  // --- STATE MANAGEMENT ---
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fatalError, setFatalError] = useState(null);
  const [user, setUser] = useState(null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [debts, setDebts] = useState([]);
  const [currentUserDbId, setCurrentUserDbId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  // --- MODAL & LOADING STATES ---
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isConfirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    description: "",
    onConfirm: null,
  });
  const [loading, setLoading] = useState(false);
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

  // --- REALTIME CONNECTION STATUS ---
  const [connectionStatus, setConnectionStatus] = useState("connecting"); // 'connected', 'connecting', 'disconnected'
  const channelRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    if (group) {
      setSettings({
        name: group.name || "",
        description: group.description || "",
        password: "",
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

  // --- DATA FETCHING ---
  const fetchGroupData = useCallback(async () => {
    try {
      setIsLoading(true);
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session) {
        setError("Please log in to view this group");
        router.replace("/");
        return;
      }
      setUser(session.user);

      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();
      if (groupError || !groupData) {
        setFatalError("المجموعة غير موجودة أو الرابط غير صالح.");
        return;
      }
      setGroup(groupData);

      const [
        membersResult,
        transactionsResult,
        activityLogsResult,
        balancesResult,
        debtsResult,
      ] = await Promise.all([
        supabase
          .from("group_members")
          .select(
            "id, role, joined_at, users(id, username, display_name, supabase_auth_id)"
          )
          .eq("group_id", groupId),
        supabase
          .from("transactions")
          .select(
            "*, splits:transaction_splits(id, user_id, amount, user:users(id, username, display_name))"
          )
          .eq("group_id", groupId)
          .order("created_at", { ascending: false }),
        supabase
          .from("activity_logs")
          .select("*, user:users(id, username, display_name)")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.functions.invoke("get-group-balances", {
          body: { group_id: groupId },
        }),
        supabase.functions.invoke("get-simplified-debts", {
          body: { group_id: groupId },
        }),
      ]);

      const { data: membersData, error: membersError } = membersResult;
      if (membersError) throw new Error("Error loading group members");
      setMembers(membersData);

      const currentMember = membersData.find(
        (m) => m.users?.supabase_auth_id === session.user.id
      );
      if (currentMember) {
        setCurrentUserRole(currentMember.role);
        setCurrentUserDbId(currentMember.users?.id);
      } else {
        router.replace(`/join/${groupId}`);
        return;
      }

      const { data: balancesData, error: balancesError } = balancesResult;
      if (balancesError) setBalances([]);
      else {
        const parsedData =
          typeof balancesData === "string"
            ? JSON.parse(balancesData)
            : balancesData;
        const balancesArray =
          parsedData && Array.isArray(parsedData.balances)
            ? parsedData.balances
            : Array.isArray(parsedData)
            ? parsedData
            : [];
        setBalances(
          balancesArray
            .map((balance) => {
              const member = membersData.find(
                (m) => m.users?.id === balance.user_id
              );
              if (!member?.users) return null;
              return {
                ...balance,
                ...member.users,
                joined_at: member.joined_at,
              };
            })
            .filter(Boolean)
        );
      }

      const { data: transactionsData, error: transactionsError } =
        transactionsResult;
      if (transactionsError) throw new Error("Error loading transactions");
      const allTransactions = transactionsData || [];
      setPayments(
        allTransactions
          .filter((t) => t.type === "payment")
          .map((payment) => {
            const payerSplit = payment.splits.find((s) => s.amount > 0);
            return {
              ...payment,
              amount: payerSplit ? payerSplit.amount : 0,
              payer: payerSplit ? payerSplit.user : null,
            };
          })
      );
      setSettlements(allTransactions.filter((t) => t.type === "settlement"));

      const { data: activityLogsData, error: activityLogsError } =
        activityLogsResult;
      if (activityLogsError) throw new Error("Error loading activity logs");
      setActivityLogs(activityLogsData || []);

      const { data: debtsData, error: debtsError } = debtsResult;
      if (debtsError) setDebts([]);
      else if (debtsData && debtsData.debts) setDebts(debtsData.debts);
      else setDebts([]);
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [groupId, router]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  // --- REALTIME SUBSCRIPTIONS ---
  useEffect(() => {
    if (!groupId) return;
    setConnectionStatus("connecting");
    let reconnectTimeout = null;
    let lastStatus = "connecting";
    const onAllChanges = () => fetchGroupData();
    const subscribe = () => {
      const channel = supabase
        .channel(`group_${groupId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions" },
          onAllChanges
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "group_members" },
          onAllChanges
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "groups" },
          (payload) => {
            toast.info("تم تحديث إعدادات المجموعة بواسطة مدير.");
            setGroup(payload.new);
          }
        )
        .on("presence", {}, () => setConnectionStatus("connected"))
        .on("broadcast", {}, () => setConnectionStatus("connected"))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setConnectionStatus("connected");
        });
      channelRef.current = channel;
      // Fallback: ping every 10s to check connection
      const interval = setInterval(() => {
        if (channel.state === "joined") setConnectionStatus("connected");
        else if (channel.state === "joining") setConnectionStatus("connecting");
        else setConnectionStatus("disconnected");
      }, 10000);
      // Reconnect logic
      const handleDisconnect = () => {
        setConnectionStatus("disconnected");
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          subscribe();
        }, 3000);
      };
      channel.on("close", handleDisconnect);
      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      };
    };
    const unsub = subscribe();
    // Listen for online/offline events
    const handleOnline = () => {
      setConnectionStatus("connecting");
      toast.success("تم استعادة الاتصال. جارٍ إعادة الاتصال...");
      subscribe();
    };
    const handleOffline = () => {
      setConnectionStatus("disconnected");
      toast.error("تم فقد الاتصال بالإنترنت.");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      if (unsub) unsub();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [groupId, fetchGroupData]);

  useEffect(() => {
    if (connectionStatus !== lastStatus) {
      if (connectionStatus === "connected")
        toast.success("تم الاتصال بالخادم.");
      if (connectionStatus === "disconnected")
        toast.error("تم فقد الاتصال بالخادم.");
      if (connectionStatus === "connecting") toast("جاري الاتصال بالخادم...");
      lastStatus = connectionStatus;
    }
  }, [connectionStatus]);

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

  const canExportData = useMemo(() => {
    if (!group || !currentUserRole) return false;
    return group.export_control === "all" || currentUserRole === "manager";
  }, [group, currentUserRole]);

  const canViewActivityLogs = useMemo(() => {
    if (!group || !currentUserRole) return false;
    return (
      group.activity_log_privacy === "all" || currentUserRole === "manager"
    );
  }, [group, currentUserRole]);

  // --- HANDLER FUNCTIONS ---
  const getDisplayName = useCallback(
    (userObj) => {
      if (!userObj) return "مستخدم";
      return userObj.id === currentUserDbId
        ? "أنت"
        : userObj.display_name || userObj.username;
    },
    [currentUserDbId]
  );

  const handleAddPayment = async ({
    description,
    amount,
    selectedBeneficiaries,
  }) => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please fill all fields with valid values.");
      return;
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
      const { error } = await supabase.functions.invoke("add-payment", {
        body: {
          group_id: groupId,
          created_by: currentUserDbId,
          description: description.trim(),
          splits,
        },
      });
      if (error) throw error;
      toast.success("تمت إضافة الدفعة!");
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
        setLoading(true);
        try {
          const { error } = await supabase.functions.invoke("delete-payment", {
            body: { group_id: groupId, payment_id: paymentId },
          });
          if (error) throw error;
          toast.success("تم حذف الدفعة بنجاح.");
          setConfirmationModalOpen(false);
        } catch (err) {
          toast.error("فشل الحذف: " + err.message);
        } finally {
          setLoading(false);
        }
      },
    });
    setConfirmationModalOpen(true);
  };

  const handleInitiateSettlement = async (toUserId, amount) => {
    setSettlementLoading(true);
    try {
      const { error } = await supabase.functions.invoke("add-settlement", {
        body: {
          group_id: groupId,
          created_by: currentUserDbId,
          from_user_id: currentUserDbId,
          to_user_id: toUserId,
          amount,
        },
      });
      if (error) throw error;
      toast.success("تم تسجيل التسوية بنجاح!");
    } catch (err) {
      toast.error("فشل التسجيل: " + err.message);
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => {
      let next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "privacy_level") {
        if (value === "public") next.password = "";
        if (value === "private" && !prev.password) next.password = "";
      }
      return next;
    });
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      let payload = { group_id: groupId, ...settings };
      // Enforce privacy logic
      if (payload.privacy_level === "public") payload.password = "";
      if (payload.privacy_level === "private" && !payload.password)
        throw new Error("يجب تعيين كلمة مرور للمجموعة الخاصة");
      if (!payload.password) delete payload.password;
      // Only allow 'all' or 'managers' for privacy fields
      if (!["all", "managers"].includes(payload.activity_log_privacy))
        payload.activity_log_privacy = "managers";
      if (!["all", "managers"].includes(payload.export_control))
        payload.export_control = "managers";
      const { error } = await supabase.functions.invoke(
        "update-group-settings",
        { body: payload }
      );
      if (error) throw error;
      toast.success("تم تحديث الإعدادات!");
      setSettingsModalOpen(false);
      await fetchGroupData(); // Always refresh after update
    } catch (err) {
      toast.error("فشل التحديث: " + err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const formatActivity = useCallback((log) => {
    const userName = log.user?.display_name || log.user?.username || "مستخدم";
    const payload = log.payload || {};
    switch (log.action_type) {
      case "payment_added":
        return `${userName} أضاف دفعة بقيمة $${parseFloat(
          payload.amount || 0
        ).toFixed(2)} لـ "${payload.description}"`;
      case "payment_deleted":
        return `${userName} حذف دفعة بقيمة $${parseFloat(
          payload.amount || 0
        ).toFixed(2)} لـ "${payload.description}"`;
      case "group_created":
        return `${userName} أنشأ المجموعة '${
          payload.group_name || payload.groupName || ""
        }'`;
      case "settlement_initiated":
        return `${userName} سجل دفعة لـ ${
          payload.to_user_name || payload.toUserName || "مستخدم"
        }`;
      case "settlement_confirmed":
        return `${userName} أكد تسوية مع ${
          payload.to_user_name || payload.toUserName || "مستخدم"
        }`;
      case "settlement_cancelled":
        return `${userName} ألغى تسوية مع ${
          payload.to_user_name || payload.toUserName || "مستخدم"
        }`;
      case "member_joined":
        return `${userName} انضم للمجموعة`;
      case "member_left":
        return `${userName} غادر المجموعة`;
      case "update_settings":
      case "group_settings_updated":
        return `${userName} قام بتحديث إعدادات المجموعة`;
      case "role_promoted":
        return `${userName} رُقي إلى مدير`;
      case "role_demoted":
        return `${userName} تم تنزيله إلى عضو`;
      case "member_kicked":
        return `${userName} تم طرده من المجموعة`;
      default:
        return log.description || "نشاط غير معروف";
    }
  }, []);

  // --- EXPORT LOGIC ---
  function toCSV(rows, headers) {
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ].join("\n");
  }
  const handleExportBalances = () => {
    if (!balances.length) return toast.error("لا يوجد بيانات للتصدير");
    const headers = ["display_name", "username", "balance", "joined_at"];
    const rows = balances.map((b) => ({
      display_name: b.display_name,
      username: b.username,
      balance: b.balance,
      joined_at: b.joined_at ? new Date(b.joined_at).toLocaleDateString() : "",
    }));
    const csv = toCSV(rows, headers);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `group_balances_${groupId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleExportActivity = () => {
    if (!activityLogs.length) return toast.error("لا يوجد سجل نشاط للتصدير");
    const headers = ["user", "action_type", "description", "created_at"];
    const rows = activityLogs.map((log) => ({
      user: log.user?.display_name || log.user?.username || "مستخدم",
      action_type: log.action_type,
      description: formatActivity(log),
      created_at: log.created_at
        ? new Date(log.created_at).toLocaleString()
        : "",
    }));
    const csv = toCSV(rows, headers);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `group_activity_${groupId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- RENDER LOGIC ---
  if (isLoading) return <LoadingSpinner />;
  if (fatalError) return <GroupNotFound message={fatalError} />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <ErrorBoundary>
      <main className="flex flex-col items-center min-h-screen p-4 sm:p-8">
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
              <BalanceSummary
                balances={balances}
                currentUserDbId={currentUserDbId}
                paymentStats={paymentStats}
                canExportData={canExportData}
                onExport={handleExportBalances}
              />
              <DebtSummary
                debts={debts}
                members={members}
                user={user}
                settlementLoading={settlementLoading}
                onInitiateSettlement={handleInitiateSettlement}
                getDisplayName={getDisplayName}
              />
              <AddPaymentForm
                members={members}
                user={user}
                onAddPayment={handleAddPayment}
                paymentLoading={paymentLoading}
              />
            </div>

            <div className="space-y-8">
              <PaymentsList
                payments={payments}
                currentUserDbId={currentUserDbId}
                currentUserRole={currentUserRole}
                onDeletePayment={handleDeletePayment}
                loading={loading}
                getDisplayName={getDisplayName}
              />
              <ActivityLog
                activityLogs={activityLogs}
                canViewActivityLogs={canViewActivityLogs}
                canExportData={canExportData}
                onExport={handleExportActivity}
                formatActivity={formatActivity}
                user={user}
              />
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
        loading={loading}
      />
    </ErrorBoundary>
  );
}
