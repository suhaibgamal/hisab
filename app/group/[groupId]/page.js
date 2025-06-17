"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { hashPassword } from "../../../lib/passwordUtils";
import Link from "next/link";
import { toast } from "sonner";
import {
  FiSettings,
  FiTrash2,
  FiDollarSign,
  FiUser,
  FiUsers,
  FiCalendar,
} from "react-icons/fi";
import { useRealtimeSubscription } from "../../../hooks/useRealtimeSubscription";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorMessage from "../../../components/ErrorMessage";

export default function GroupPage() {
  const { groupId } = useParams();
  const router = useRouter();
  const mountCountRef = useRef(0);

  // State declarations
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  // Initialize settings with empty values
  const [settings, setSettings] = useState({
    name: "",
    description: "",
    password: "",
    member_limit: null,
    invite_code_visible: true,
    auto_approve_members: true,
    activity_log_privacy: "managers",
    export_control: "managers",
  });

  // Update settings when group data is fetched
  useEffect(() => {
    if (group) {
      setSettings({
        name: group.name || "",
        description: group.description || "",
        password: "",
        member_limit: group.member_limit || null,
        invite_code_visible: group.invite_code_visible ?? true,
        auto_approve_members: group.auto_approve_members ?? true,
        activity_log_privacy: group.activity_log_privacy || "managers",
        export_control: group.export_control || "managers",
      });
    }
  }, [group]);

  const [balances, setBalances] = useState([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState([]);

  // Get current user's database ID
  const currentUserDbId = useMemo(
    () =>
      members.find((m) => m.users?.supabase_auth_id === user?.id)?.users?.id,
    [members, user?.id]
  );

  // Calculate balances function
  const calculateAll = useCallback((payments, settlements, members) => {
    // Check if this is a single-member group
    const isSingleMemberGroup = members.length === 1;

    // For single-member groups, set balance to 0 and skip calculations
    if (isSingleMemberGroup) {
      const member = members[0];
      setBalances([{ ...member, balance: 0 }]);
      setSimplifiedDebts([]);
      return;
    }

    // Calculate Net Balances
    const memberBalances = members.reduce((acc, member) => {
      acc[member.users.id] = { ...member, balance: 0 };
      return acc;
    }, {});

    // Process payments with proper self-payment handling
    payments.forEach((payment) => {
      const amount = parseFloat(payment.amount);
      const beneficiaries = payment.payment_beneficiaries;
      const numBeneficiaries = beneficiaries.length;

      if (numBeneficiaries === 0) return;

      // Check if this is a self-payment (payer is the only beneficiary)
      const isSelfPayment =
        numBeneficiaries === 1 &&
        beneficiaries[0].beneficiary_user_id === payment.payer_id;

      // Skip balance updates for self-payments
      if (isSelfPayment) return;

      // Add the full amount to payer's balance
      if (memberBalances[payment.payer_id]) {
        memberBalances[payment.payer_id].balance += amount;
      }

      // Calculate share per beneficiary in cents to avoid floating point issues
      const amountInCents = Math.round(amount * 100);
      const shareInCents = Math.floor(amountInCents / numBeneficiaries);
      let remainderCents = amountInCents % numBeneficiaries;

      // Distribute shares to beneficiaries
      beneficiaries.forEach((beneficiary) => {
        // Skip if beneficiary is the payer in a self-payment
        if (
          beneficiary.beneficiary_user_id === payment.payer_id &&
          isSelfPayment
        ) {
          return;
        }

        let beneficiaryShareCents = shareInCents;
        if (remainderCents > 0) {
          beneficiaryShareCents++;
          remainderCents--;
        }

        if (memberBalances[beneficiary.beneficiary_user_id]) {
          memberBalances[beneficiary.beneficiary_user_id].balance -=
            beneficiaryShareCents / 100;
        }
      });
    });

    // Process settlements
    const confirmedSettlements = settlements.filter(
      (s) => s.status === "confirmed"
    );
    confirmedSettlements.forEach((settlement) => {
      const amount = parseFloat(settlement.amount);
      if (memberBalances[settlement.from_user_id]) {
        memberBalances[settlement.from_user_id].balance += amount;
      }
      if (memberBalances[settlement.to_user_id]) {
        memberBalances[settlement.to_user_id].balance -= amount;
      }
    });

    // Round all balances to 2 decimal places
    for (const memberId in memberBalances) {
      memberBalances[memberId].balance = parseFloat(
        memberBalances[memberId].balance.toFixed(2)
      );
    }

    setBalances(Object.values(memberBalances));

    // Calculate simplified debts with a higher threshold
    const DEBT_THRESHOLD = 0.01; // Ignore very small debts
    const debtorsInCents = Object.values(memberBalances)
      .filter((m) => m.balance < -DEBT_THRESHOLD)
      .map((d) => ({ ...d, balance: Math.round(d.balance * 100) }));

    const creditorsInCents = Object.values(memberBalances)
      .filter((m) => m.balance > DEBT_THRESHOLD)
      .map((c) => ({ ...c, balance: Math.round(c.balance * 100) }));

    const debts = [];
    debtorsInCents.sort((a, b) => a.balance - b.balance);
    creditorsInCents.sort((a, b) => b.balance - a.balance);

    let i = 0,
      j = 0;
    while (i < debtorsInCents.length && j < creditorsInCents.length) {
      const debtor = debtorsInCents[i];
      const creditor = creditorsInCents[j];
      const amountInCents = Math.min(-debtor.balance, creditor.balance);

      if (amountInCents > 0) {
        debts.push({
          from: debtor,
          to: creditor,
          amount: amountInCents / 100,
        });
      }

      debtor.balance += amountInCents;
      creditor.balance -= amountInCents;

      if (Math.abs(debtor.balance) < 1) i++; // Using 1 cent threshold
      if (Math.abs(creditor.balance) < 1) j++;
    }

    setSimplifiedDebts(debts);
  }, []);

  // Fetch group data function
  const fetchGroupData = useCallback(async () => {
    try {
      console.log("[Debug] Starting fetchGroupData");
      // Get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        console.log("[Debug] No session found");
        setError("Please log in to view this group");
        setIsLoading(false);
        return;
      }

      console.log("[Debug] Session found:", session);
      setUser(session.user);

      // Fetch group data
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();

      console.log("[Debug] Group data fetch result:", {
        groupData,
        groupError,
      });

      if (groupError) {
        console.error("[Debug] Error fetching group:", groupError);
        setError("Error loading group data");
        setIsLoading(false);
        return;
      }

      if (!groupData) {
        console.log("[Debug] No group data found");
        setError("Group not found");
        setIsLoading(false);
        return;
      }

      setGroup(groupData);

      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from("group_members")
        .select(
          `
            id,
            role,
            joined_at,
            users (
              id,
              username,
              display_name,
              supabase_auth_id
            )
          `
        )
        .eq("group_id", groupId);

      console.log("[Debug] Members fetch result:", {
        membersData,
        membersError,
      });

      if (membersError) {
        console.error("[Debug] Error fetching members:", membersError);
        setError("Error loading group members");
        setIsLoading(false);
        return;
      }

      console.log("[Debug] Members data with created_at:", membersData);
      setMembers(membersData);

      // Initialize selectedBeneficiaries if there's only one member
      if (membersData.length === 1) {
        setSelectedBeneficiaries([membersData[0].id]);
      }

      // Add detailed debug logging for IDs
      console.log("[Debug] Session user:", {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      });
      console.log("[Debug] First member data:", membersData[0]);
      console.log(
        "[Debug] Users object in first member:",
        membersData[0]?.users
      );

      // Find current user's role
      const currentMember = membersData.find(
        (m) => m.users?.supabase_auth_id === session.user.id
      );
      console.log("[Debug] Current member:", currentMember);
      if (currentMember) {
        setCurrentUserRole(currentMember.role);
      }

      // Fetch payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("payments")
        .select(
          `
            *,
            payer:users!payments_payer_id_fkey (
              id,
              username,
              display_name
            ),
            payment_beneficiaries (
              id,
              beneficiary:users!payment_beneficiaries_beneficiary_user_id_fkey (
                id,
                username,
                display_name
              )
            )
          `
        )
        .eq("group_id", groupId);

      console.log("[Debug] Payments fetch result:", {
        paymentsData,
        paymentsError,
      });

      if (paymentsError) {
        console.error("[Debug] Error fetching payments:", paymentsError);
        setError("Error loading payments");
        setIsLoading(false);
        return;
      }

      setPayments(paymentsData || []);

      // Fetch settlements
      const { data: settlementsData, error: settlementsError } = await supabase
        .from("settlements")
        .select(
          `
            *,
            from:users!settlements_from_user_id_fkey (
              id,
              username,
              display_name
            ),
            to:users!settlements_to_user_id_fkey (
              id,
              username,
              display_name
            )
          `
        )
        .eq("group_id", groupId);

      console.log("[Debug] Settlements fetch result:", {
        settlementsData,
        settlementsError,
      });

      if (settlementsError) {
        console.error("[Debug] Error fetching settlements:", settlementsError);
        setError("Error loading settlements");
        setIsLoading(false);
        return;
      }

      setSettlements(settlementsData || []);

      // Fetch activity logs
      const { data: logsData, error: logsError } = await supabase
        .from("activity_logs")
        .select(
          `
            *,
            user:users (
              id,
              username,
              display_name
            )
          `
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50);

      console.log("[Debug] Activity logs fetch result:", {
        logsData,
        logsError,
      });

      if (logsError) {
        console.error("[Debug] Error fetching activity logs:", logsError);
        setError("Error loading activity logs");
        setIsLoading(false);
        return;
      }

      setActivityLogs(logsData || []);

      // Calculate initial balances
      if (membersData && paymentsData && settlementsData) {
        console.log("[Debug] Calculating initial balances");
        calculateAll(paymentsData, settlementsData, membersData);
      }

      setIsLoading(false);
      console.log("[Debug] fetchGroupData completed successfully");
    } catch (err) {
      console.error("[Debug] Error in fetchGroupData:", err);
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  }, [groupId, calculateAll]);

  useEffect(() => {
    // Increment mount count
    mountCountRef.current++;
    const currentMount = mountCountRef.current;

    console.log("[Debug] Component mounted with groupId:", groupId);
    console.log("[Debug] Current state:", {
      group,
      members,
      payments,
      settlements,
      activityLogs,
      user,
    });

    fetchGroupData().catch((error) => {
      console.error("[Debug] Error in fetchGroupData:", error);
    });

    return () => {
      if (mountCountRef.current === currentMount) {
        console.log("[Debug] Component cleanup");
      }
    };
  }, [fetchGroupData]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    description: "",
    onConfirm: null,
  });
  const [subscriptionStatus, setSubscriptionStatus] = useState("JOINING");
  const [loading, setLoading] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState([]);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [paymentFilter, setPaymentFilter] = useState("all");
  const [paymentSort, setPaymentSort] = useState("newest");

  const filteredPayments = useMemo(() => {
    return payments
      .filter((payment) => {
        // Check if this is a self-payment
        const isSelfPayment =
          payment.payment_beneficiaries.length === 1 &&
          payment.payment_beneficiaries[0].beneficiary_user_id ===
            payment.payer_id;

        if (paymentFilter === "paid") {
          // Show in "paid" if user is the payer (using database ID)
          return payment.payer_id === currentUserDbId;
        }
        if (paymentFilter === "received") {
          // For "received", show if user is a beneficiary but not a self-payment
          return (
            payment.payment_beneficiaries.some(
              (b) => b.beneficiary_user_id === currentUserDbId
            ) && !isSelfPayment
          );
        }
        return true; // Show all payments for "all" filter
      })
      .sort((a, b) => {
        if (paymentSort === "oldest") {
          return new Date(a.payment_date) - new Date(b.payment_date);
        }
        if (paymentSort === "amount") {
          return parseFloat(b.amount) - parseFloat(a.amount);
        }
        // Default to newest first
        return new Date(b.payment_date) - new Date(a.payment_date);
      });
  }, [payments, paymentFilter, paymentSort, currentUserDbId]);

  const paymentStats = useMemo(() => {
    if (!user?.id || !payments.length)
      return {
        totalPaid: 0,
        totalReceived: 0,
        monthlyAverage: 0,
      };

    // Get the earliest date between first payment and group creation
    const firstActivityDate = Math.min(
      ...payments.map((p) => new Date(p.payment_date).getTime()),
      new Date(group?.created_at || Date.now()).getTime()
    );

    // Calculate total paid excluding self-payments
    const totalPaid = payments.reduce((sum, p) => {
      // Skip self-payments
      const isSelfPayment =
        p.payment_beneficiaries.length === 1 &&
        p.payment_beneficiaries[0].beneficiary_user_id === p.payer_id;

      if (isSelfPayment) return sum;

      return sum + (p.payer_id === user?.id ? parseFloat(p.amount) : 0);
    }, 0);

    // Calculate total received excluding self-payments
    const totalReceived = payments.reduce((sum, p) => {
      // Skip self-payments
      const isSelfPayment =
        p.payment_beneficiaries.length === 1 &&
        p.payment_beneficiaries[0].beneficiary_user_id === p.payer_id;

      if (isSelfPayment) return sum;

      return (
        sum +
        (p.payment_beneficiaries.some((b) => b.beneficiary_user_id === user?.id)
          ? parseFloat(p.amount) / p.payment_beneficiaries.length
          : 0)
      );
    }, 0);

    // Calculate monthly average excluding self-payments
    const totalGroupSpending = payments.reduce((sum, p) => {
      const isSelfPayment =
        p.payment_beneficiaries.length === 1 &&
        p.payment_beneficiaries[0].beneficiary_user_id === p.payer_id;

      return sum + (isSelfPayment ? 0 : parseFloat(p.amount));
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
  }, [payments, settlements, user?.id, group?.created_at]);

  const groupedActivities = useMemo(() => {
    return activityLogs.reduce((groups, log) => {
      const date = new Date(log.created_at).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
      return groups;
    }, {});
  }, [activityLogs]);

  const canExportData = useMemo(() => {
    if (!group || !currentUserRole) return false;

    const exportControl = group.export_control || "managers";

    if (exportControl === "all") return true;
    if (exportControl === "members") return true; // Since all users in the group are members
    if (exportControl === "managers") return currentUserRole === "manager";

    return false;
  }, [group, currentUserRole]);

  const canViewActivityLogs = useMemo(() => {
    if (!group || !currentUserRole) return false;

    const activityLogPrivacy = group.activity_log_privacy || "managers";

    if (activityLogPrivacy === "all") return true;
    if (activityLogPrivacy === "members") return true; // Since all users in the group are members
    if (activityLogPrivacy === "managers") return currentUserRole === "manager";

    return false;
  }, [group, currentUserRole]);

  const handleInitiateSettlement = async (toUserId, amount) => {
    const currentMemberUser = members.find(
      (m) => m.users?.supabase_auth_id === user?.id
    )?.users;

    if (!currentMemberUser) {
      throw new Error("User not found in group members");
    }

    setSettlementLoading(true);
    try {
      const { data: settlementData, error: settlementError } = await supabase
        .from("settlements")
        .insert({
          group_id: groupId,
          from_user_id: currentMemberUser.id,
          to_user_id: toUserId,
          amount: amount,
          status: "pending",
        })
        .select(
          "from_user_id, to_user_id, amount, from:users!settlements_from_user_id_fkey(display_name), to:users!settlements_to_user_id_fkey(display_name)"
        )
        .single();

      if (settlementError) throw settlementError;

      await supabase.functions.invoke("log_activity", {
        body: {
          group_id: groupId,
          action_type: "settlement_initiated",
          payload: {
            from_user_id: currentMemberUser.id,
            to_user_id: toUserId,
            amount: amount,
            from_name: settlementData.from.display_name,
            to_name: settlementData.to.display_name,
          },
        },
      });

      toast.success("تم إرسال طلب التسوية!");
    } catch (err) {
      console.error("Error initiating settlement:", err);
      toast.error("فشل إرسال طلب التسوية: " + err.message);
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleConfirmSettlement = async (settlementId) => {
    const onConfirm = async () => {
      setIsModalOpen(false);
      setLoading(true);
      try {
        const { data: settlementData, error: fetchError } = await supabase
          .from("settlements")
          .select(
            "from_user_id, to_user_id, amount, from:users!settlements_from_user_id_fkey(display_name), to:users!settlements_to_user_id_fkey(display_name)"
          )
          .eq("id", settlementId)
          .single();

        if (fetchError) throw fetchError;

        const { error } = await supabase
          .from("settlements")
          .update({ status: "confirmed" })
          .eq("id", settlementId);
        if (error) throw error;

        await supabase.functions.invoke("log-activity", {
          body: {
            group_id: groupId,
            action_type: "settlement_confirmed",
            payload: {
              from_user_id: settlementData.from_user_id,
              to_user_id: settlementData.to_user_id,
              from_user_name: settlementData.from.display_name,
              to_user_name: settlementData.to.display_name,
              amount: settlementData.amount,
            },
          },
        });

        toast.success("تم تأكيد التسوية!");
      } catch (err) {
        console.error("Error confirming settlement:", err);
        toast.error("فشل تأكيد التسوية: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    openConfirmationModal(
      "تأكيد التسوية",
      "هل أنت متأكد من استلام هذا المبلغ؟ لا يمكن التراجع عن هذا الإجراء.",
      onConfirm
    );
  };

  const handleBeneficiaryChange = (memberId) => {
    // If there's only one member (the current user), they are always selected
    if (members.length === 1) {
      return;
    }

    setSelectedBeneficiaries((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount)) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }
    if (parsedAmount <= 0) {
      toast.error("يجب أن يكون المبلغ أكبر من صفر");
      return;
    }
    if (parsedAmount > 1000000) {
      toast.error("المبلغ كبير جداً");
      return;
    }

    // Validate description
    if (!description.trim()) {
      toast.error("الرجاء إدخال وصف للدفعة");
      return;
    }

    // Validate beneficiaries
    if (selectedBeneficiaries.length === 0) {
      toast.error("الرجاء اختيار مستفيد واحد على الأقل");
      return;
    }

    // Validate payment date
    const paymentDateObj = new Date(paymentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (paymentDateObj > today) {
      toast.error("لا يمكن إضافة دفعات في المستقبل");
      return;
    }

    if (!user) {
      toast.error("يجب تسجيل الدخول أولاً");
      return;
    }

    // Add warning for self-payments
    const isSelfPayment =
      selectedBeneficiaries.length === 1 &&
      members.find((m) => m.id === selectedBeneficiaries[0])?.users
        ?.supabase_auth_id === user?.id;

    if (isSelfPayment) {
      toast.warning(
        "تنبيه: أنت تقوم بإضافة دفعة لنفسك. هذه الدفعة لن تؤثر على الرصيد الإجمالي."
      );
    }

    setError("");
    setPaymentLoading(true);

    try {
      const currentMemberUser = members.find(
        (m) => m.users?.supabase_auth_id === user?.id
      )?.users;

      if (!currentMemberUser) {
        throw new Error("User not found in group members");
      }

      const { data: paymentData, error: paymentError } = await supabase
        .from("payments")
        .insert({
          group_id: groupId,
          payer_id: currentMemberUser.id,
          amount: parsedAmount,
          description: description.trim(),
          payment_date: paymentDate,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const beneficiariesToInsert = selectedBeneficiaries.map(
        (beneficiaryId) => {
          const beneficiaryMember = members.find((m) => m.id === beneficiaryId);
          if (!beneficiaryMember?.users?.id) {
            throw new Error(`User not found for member ${beneficiaryId}`);
          }
          return {
            payment_id: paymentData.id,
            beneficiary_user_id: beneficiaryMember.users.id,
          };
        }
      );

      const { error: beneficiariesError } = await supabase
        .from("payment_beneficiaries")
        .insert(beneficiariesToInsert);

      if (beneficiariesError) throw beneficiariesError;

      const beneficiaryNames = members
        .filter((m) => selectedBeneficiaries.includes(m.id))
        .map((m) => m.users?.display_name || m.users?.username || "مستخدم");

      await supabase.functions.invoke("log_activity", {
        body: {
          group_id: groupId,
          action_type: "payment_added",
          payload: {
            payer_id: currentMemberUser.id,
            beneficiary_ids: beneficiariesToInsert.map(
              (b) => b.beneficiary_user_id
            ),
            amount: parsedAmount,
            description: description.trim(),
            payer_name:
              currentMemberUser.display_name ||
              currentMemberUser.username ||
              "مستخدم",
            beneficiary_names: beneficiaryNames,
          },
        },
      });

      setAmount("");
      setDescription("");
      toast.success("Payment added!");
    } catch (err) {
      console.error("Error adding payment:", err);
      toast.error("Failed to add payment. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const openConfirmationModal = (title, description, onConfirm) => {
    setModalContent({ title, description, onConfirm });
    setIsModalOpen(true);
  };

  const handleDeletePayment = async (paymentId) => {
    const onConfirm = async () => {
      setIsModalOpen(false);
      setLoading(true);
      try {
        const paymentToDelete = payments.find((p) => p.id === paymentId);
        if (!paymentToDelete) throw new Error("Payment not found");

        const { error } = await supabase.rpc("delete_payment", {
          payment_id_to_delete: paymentId,
        });
        if (error) throw error;

        // Immediately update local state
        setPayments((prev) => {
          const newPayments = prev.filter((p) => p.id !== paymentId);
          // Recalculate balances with the updated payments
          calculateAll(newPayments, settlements, members);
          return newPayments;
        });

        await supabase.functions.invoke("log_activity", {
          body: {
            group_id: groupId,
            action_type: "payment_deleted",
            payload: {
              description: paymentToDelete.description,
              amount: paymentToDelete.amount,
              payer_name: paymentToDelete.payer?.display_name || "مستخدم",
            },
          },
        });
        toast.success("تم حذف الدفعة بنجاح.");
      } catch (err) {
        console.error("Error deleting payment:", err);
        toast.error("فشل حذف الدفعة: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    openConfirmationModal(
      "تأكيد الحذف",
      "هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء.",
      onConfirm
    );
  };

  const handleCancelSettlement = async (settlementId) => {
    const onConfirm = async () => {
      setIsModalOpen(false);
      setLoading(true);
      try {
        const { error } = await supabase.rpc("cancel_settlement", {
          settlement_id_to_cancel: settlementId,
        });
        if (error) throw error;
        toast.success("تم إلغاء التسوية المعلقة.");
      } catch (err) {
        console.error("Error cancelling settlement:", err);
        toast.error("فشل إلغاء التسوية: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    openConfirmationModal(
      "إلغاء التسوية",
      "هل أنت متأكد من إلغاء هذه التسوية المعلقة؟",
      onConfirm
    );
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      // Validate settings before sending
      if (
        settings.name &&
        (settings.name.length < 3 || settings.name.length > 50)
      ) {
        throw new Error("اسم المجموعة يجب أن يكون بين 3 و 50 حرف");
      }

      if (settings.description && settings.description.length > 500) {
        throw new Error("وصف المجموعة يجب أن لا يتجاوز 500 حرف");
      }

      if (
        settings.member_limit &&
        (settings.member_limit < members.length || settings.member_limit > 100)
      ) {
        throw new Error(
          `الحد الأقصى للأعضاء يجب أن يكون بين ${members.length} و 100`
        );
      }

      // Sanitize and prepare settings payload
      const sanitizedSettings = {
        name: settings.name?.trim(),
        description: settings.description?.trim(),
        member_limit: settings.member_limit,
        invite_code_visible: settings.invite_code_visible,
        auto_approve_members: settings.auto_approve_members,
        activity_log_privacy: settings.activity_log_privacy,
        export_control: settings.export_control,
      };

      // Hash password if provided
      if (settings.password?.trim()) {
        sanitizedSettings.password = await hashPassword(
          settings.password.trim()
        );
      }

      // Critical settings change confirmation
      if (
        settings.password ||
        settings.member_limit < members.length ||
        settings.activity_log_privacy !== group.activity_log_privacy ||
        settings.export_control !== group.export_control
      ) {
        const confirmed = window.confirm(
          "هذه التغييرات قد تؤثر على أعضاء المجموعة. هل أنت متأكد؟"
        );
        if (!confirmed) {
          setSettingsLoading(false);
          return;
        }
      }

      const { error } = await supabase.functions.invoke(
        "update-group-settings",
        {
          body: {
            group_id: groupId,
            ...sanitizedSettings,
          },
        }
      );

      if (error) throw error;

      // Update local group data (excluding sensitive info)
      setGroup((prev) => ({
        ...prev,
        ...sanitizedSettings,
        password: undefined, // Never store password in state
      }));

      if (settings.password) {
        toast.success(
          "تم تحديث الإعدادات! تم إزالة جميع الأعضاء غير المديرين لأسباب أمنية."
        );
        // Refresh members list since non-managers were removed
        fetchGroupData();
      } else {
        toast.success("تم تحديث إعدادات المجموعة!");
      }

      // Clear sensitive data from state
      setSettings((prev) => ({
        ...prev,
        password: "", // Clear password after update
      }));

      setSettingsModalOpen(false);
    } catch (err) {
      console.error("Error updating settings:", err);
      toast.error(
        "فشل تحديث الإعدادات: " + (err.data?.error?.message || err.message)
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleKickMember = async (memberId) => {
    openConfirmationModal(
      "Confirm Kick",
      "Are you sure you want to kick this member from the group?",
      async () => {
        setIsModalOpen(false);
        setLoading(true);
        try {
          const { error } = await supabase.rpc("kick_group_member", {
            p_group_id: groupId,
            p_user_to_kick_id: memberId,
          });
          if (error) throw error;
          toast.success("Member kicked successfully.");
        } catch (err) {
          console.error("Error kicking member:", err);
          toast.error("Failed to kick member: " + err.message);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Convert data to CSV format
  const convertToCSV = (data) => {
    // Headers
    let csv = "نوع العملية,التاريخ,الوصف,المبلغ,الدافع,المستفيدون\n";

    // Add payments
    data.payments.forEach((payment) => {
      csv += `دفعة,${payment.date},"${payment.description}",${
        payment.amount
      },"${payment.payer}","${payment.beneficiaries.join(", ")}"\n`;
    });

    // Add settlements
    data.settlements.forEach((settlement) => {
      csv += `تسوية,${settlement.date},"تسوية مالية",${settlement.amount},"${settlement.from}","${settlement.to}"\n`;
    });

    return csv;
  };

  const handleExportData = () => {
    if (!canExportData) {
      toast.error("ليس لديك صلاحية لتصدير البيانات");
      return;
    }
    const data = {
      payments: payments.map((p) => ({
        date: new Date(p.payment_date).toLocaleDateString(),
        amount: p.amount,
        description: p.description,
        payer: p.payer.display_name,
        beneficiaries: p.payment_beneficiaries.map(
          (b) => b.beneficiary.display_name
        ),
      })),
      settlements: settlements.map((s) => ({
        date: new Date(s.initiated_at).toLocaleDateString(),
        amount: s.amount,
        from: s.from.display_name,
        to: s.to.display_name,
        status: s.status,
      })),
    };

    const csv = convertToCSV(data);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `مجموعة-${group.name}-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
  };

  // Convert activity logs to CSV
  const convertActivityLogsToCSV = (logs) => {
    // Escape function for CSV fields
    const escapeCSV = (str) => {
      if (!str) return "";
      // Replace quotes with double quotes and wrap in quotes if needed
      str = str.toString().replace(/"/g, '""');
      return /[,"\n]/.test(str) ? `"${str}"` : str;
    };

    let csv = "التاريخ,نوع العملية,التفاصيل\n";
    logs.forEach((log) => {
      const date = new Date(log.created_at).toLocaleDateString();
      const actionType = log.action_type;
      const details = formatActivity(log); // This function already uses action_type and payload
      csv += `${escapeCSV(date)},${escapeCSV(actionType)},${escapeCSV(
        details
      )}\n`;
    });
    return csv;
  };

  const handleExportActivityLogs = () => {
    if (!canExportData) {
      toast.error("ليس لديك صلاحية لتصدير البيانات");
      return;
    }
    const csv = convertActivityLogsToCSV(activityLogs);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `سجل-النشاط-${group.name}-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
  };

  // Move formatActivity inside the component
  const formatActivity = (log) => {
    const userName = log.user?.id === user?.id ? "أنت" : log.user?.display_name;
    const payload = log.payload || {};

    switch (log.action_type) {
      case "payment_added":
        return `${
          userName === "أنت" ? "قمت بإضافة" : "أضاف"
        } دفعة بقيمة $${parseFloat(payload.amount || 0).toFixed(2)}${
          payload.description ? ` لـ "${payload.description}"` : ""
        }`;
      case "payment_deleted":
        return `${
          userName === "أنت" ? "قمت بحذف" : "قام بحذف"
        } دفعة بقيمة $${parseFloat(payload.amount || 0).toFixed(2)}${
          payload.description ? ` لـ "${payload.description}"` : ""
        }`;
      case "group_created":
        return `${userName === "أنت" ? "قمت بإنشاء" : "أنشأ"} المجموعة${
          payload.group_name ? ` '${payload.group_name}'` : ""
        }`;
      case "settlement_initiated":
        return `${userName === "أنت" ? "قمت بتسجيل" : "قام بتسجيل"} دفعة لـ ${
          payload.to_user_name || "مستخدم"
        }`;
      case "settlement_confirmed":
        return `${userName === "أنت" ? "قمت بتأكيد" : "أكد"} استلام تسوية من ${
          payload.from_user_name || "مستخدم"
        }`;
      case "settlement_cancelled":
        return `${userName === "أنت" ? "قمت بإلغاء" : "ألغى"} تسوية مع ${
          payload.other_user_name || "مستخدم"
        }`;
      case "member_joined":
        return `${userName === "أنت" ? "انضممت" : "انضم"} للمجموعة`;
      case "member_left":
        return `${userName === "أنت" ? "غادرت" : "غادر"} المجموعة`;
      case "group_settings_updated":
      case "update_settings":
        return `${
          userName === "أنت" ? "قمت بتحديث" : "قام بتحديث"
        } إعدادات المجموعة`;
      default:
        return log.description || "نشاط غير معروف";
    }
  };

  // Realtime subscription handlers
  const handleRealtimeUpdates = useMemo(
    () => ({
      onPaymentChange: async (payload) => {
        console.log("[Debug] Payment change payload:", payload);
        if (payload.eventType === "INSERT") {
          const { data: newPayment, error } = await supabase
            .from("payments")
            .select(
              `
                *,
                payer:users!payments_payer_id_fkey (
                  id,
                  username,
                  display_name
                ),
                payment_beneficiaries (
                  id,
                  beneficiary:users!payment_beneficiaries_beneficiary_user_id_fkey (
                    id,
                    username,
                    display_name
                  )
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && newPayment) {
            setPayments((prev) => {
              const newPayments = [...prev, newPayment];
              calculateAll(newPayments, settlements, members);
              return newPayments;
            });
          }
        } else if (payload.eventType === "DELETE") {
          console.log("[Debug] Handling payment deletion:", payload.old.id);
          setPayments((prev) => {
            console.log("[Debug] Current payments:", prev.length);
            const newPayments = prev.filter((p) => p.id !== payload.old.id);
            console.log("[Debug] Filtered payments:", newPayments.length);
            // Ensure we recalculate balances after removing the payment
            calculateAll(newPayments, settlements, members);
            return newPayments;
          });
        } else if (payload.eventType === "UPDATE") {
          const { data: updatedPayment, error } = await supabase
            .from("payments")
            .select(
              `
                *,
                payer:users!payments_payer_id_fkey (
                  id,
                  username,
                  display_name
                ),
                payment_beneficiaries (
                  id,
                  beneficiary:users!payment_beneficiaries_beneficiary_user_id_fkey (
                    id,
                    username,
                    display_name
                  )
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && updatedPayment) {
            setPayments((prev) => {
              const newPayments = prev.map((p) =>
                p.id === updatedPayment.id ? updatedPayment : p
              );
              calculateAll(newPayments, settlements, members);
              return newPayments;
            });
          }
        }
      },

      onSettlementChange: async (payload) => {
        console.log("[Debug] Settlement change payload:", payload);
        if (payload.eventType === "INSERT") {
          const { data: settlement, error } = await supabase
            .from("settlements")
            .select(
              `
                *,
                from:users!settlements_from_user_id_fkey (
                  id,
                  username,
                  display_name
                ),
                to:users!settlements_to_user_id_fkey (
                  id,
                  username,
                  display_name
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && settlement) {
            setSettlements((prev) => {
              const newSettlements = [...prev, settlement];
              calculateAll(payments, newSettlements, members);
              return newSettlements;
            });
          }
        } else if (payload.eventType === "DELETE") {
          setSettlements((prev) => {
            const newSettlements = prev.filter((s) => s.id !== payload.old.id);
            calculateAll(payments, newSettlements, members);
            return newSettlements;
          });
        } else if (payload.eventType === "UPDATE") {
          const { data: settlement, error } = await supabase
            .from("settlements")
            .select(
              `
                *,
                from:users!settlements_from_user_id_fkey (
                  id,
                  username,
                  display_name
                ),
                to:users!settlements_to_user_id_fkey (
                  id,
                  username,
                  display_name
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && settlement) {
            setSettlements((prev) => {
              const newSettlements = prev.map((s) =>
                s.id === settlement.id ? settlement : s
              );
              calculateAll(payments, newSettlements, members);
              return newSettlements;
            });
          }
        }
      },

      onMemberChange: async (payload) => {
        console.log("[Debug] Member change payload:", payload);
        if (payload.eventType === "INSERT") {
          const { data: newMember, error } = await supabase
            .from("group_members")
            .select(
              `
                id,
                role,
                joined_at,
                users (
                  id,
                  username,
                  display_name,
                  supabase_auth_id
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && newMember) {
            setMembers((prev) => {
              const newMembers = [...prev, newMember];
              calculateAll(payments, settlements, newMembers);
              return newMembers;
            });
          }
        } else if (payload.eventType === "DELETE") {
          setMembers((prev) => {
            const newMembers = prev.filter((m) => m.id !== payload.old.id);
            calculateAll(payments, settlements, newMembers);
            return newMembers;
          });
        } else if (payload.eventType === "UPDATE") {
          const { data: updatedMember, error } = await supabase
            .from("group_members")
            .select(
              `
                id,
                role,
                joined_at,
                users (
                  id,
                  username,
                  display_name,
                  supabase_auth_id
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && updatedMember) {
            setMembers((prev) => {
              const newMembers = prev.map((m) =>
                m.id === updatedMember.id ? updatedMember : m
              );
              calculateAll(payments, settlements, newMembers);
              return newMembers;
            });
          }
        }
      },

      onActivityLogChange: async (payload) => {
        console.log("[Debug] Activity log change payload:", payload);
        if (payload.eventType === "INSERT") {
          const { data: log, error } = await supabase
            .from("activity_logs")
            .select(
              `
                *,
                user:users (
                  id,
                  username,
                  display_name
                )
              `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && log) {
            setActivityLogs((prev) => [log, ...prev]);
          }
        } else if (payload.eventType === "DELETE") {
          setActivityLogs((prev) =>
            prev.filter((l) => l.id !== payload.old.id)
          );
        }
      },

      onGroupChange: (payload) => {
        console.log("[Debug] Group change payload:", payload);
        if (payload.eventType === "UPDATE" && payload.new) {
          setGroup(payload.new);
          setSettings((prev) => ({
            ...prev,
            name: payload.new.name || prev.name,
            description: payload.new.description || prev.description,
            member_limit: payload.new.member_limit || prev.member_limit,
            invite_code_visible:
              payload.new.invite_code_visible ?? prev.invite_code_visible,
            auto_approve_members:
              payload.new.auto_approve_members ?? prev.auto_approve_members,
            activity_log_privacy:
              payload.new.activity_log_privacy || prev.activity_log_privacy,
            export_control: payload.new.export_control || prev.export_control,
          }));
        }
      },
    }),
    [groupId, payments, settlements, members, calculateAll]
  );

  // Set up realtime subscription
  useEffect(() => {
    if (!groupId) return;

    const subscription = supabase
      .channel(`group_${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `group_id=eq.${groupId}`,
        },
        handleRealtimeUpdates.onPaymentChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "settlements",
          filter: `group_id=eq.${groupId}`,
        },
        handleRealtimeUpdates.onSettlementChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        handleRealtimeUpdates.onMemberChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_logs",
          filter: `group_id=eq.${groupId}`,
        },
        handleRealtimeUpdates.onActivityLogChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "groups",
          filter: `id=eq.${groupId}`,
        },
        handleRealtimeUpdates.onGroupChange
      );

    subscription.subscribe((status, err) => {
      console.log("[Debug] Subscription status:", status, err);
      setSubscriptionStatus(status);
    });

    return () => {
      console.log("[Debug] Cleaning up subscription");
      subscription.unsubscribe();
    };
  }, [groupId, handleRealtimeUpdates]);

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Show error state
  if (error) {
    return <ErrorMessage message={error} />;
  }

  // Show realtime connection status
  const showRealtimeStatus = () => {
    if (subscriptionStatus === "SUBSCRIBED") return null;

    let message = "";
    let type = "info";

    switch (subscriptionStatus) {
      case "DISCONNECTED":
        message = "جاري إعادة الاتصال...";
        type = "warning";
        break;
      case "CHANNEL_ERROR":
        message = "حدث خطأ في الاتصال. جاري المحاولة مرة أخرى...";
        type = "error";
        break;
      case "CLOSED":
        message = "تم قطع الاتصال. جاري إعادة الاتصال...";
        type = "warning";
        break;
      case "TIMED_OUT":
        message = "انتهت مهلة الاتصال. جاري المحاولة مرة أخرى...";
        type = "warning";
        break;
      case "joining":
      case "JOINING":
        message = "جاري الاتصال...";
        type = "info";
        break;
      default:
        return null;
    }

    const bgColor = {
      info: "bg-blue-100 border-blue-500 text-blue-700",
      warning: "bg-yellow-100 border-yellow-500 text-yellow-700",
      error: "bg-red-100 border-red-500 text-red-700",
    }[type];

    return (
      <div
        className={`fixed bottom-4 right-4 border-l-4 p-4 ${bgColor}`}
        role="alert"
      >
        <p className="font-bold">تنبيه</p>
        <p>{message}</p>
      </div>
    );
  };

  return (
    <main className="flex flex-col items-center min-h-screen p-4 sm:p-8">
      {showRealtimeStatus()}
      <div className="w-full max-w-7xl">
        <header className="mb-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-center">
              <div>
                <Link
                  href="/"
                  className="text-indigo-400 hover:underline mb-4 inline-block"
                >
                  &rarr; العودة للوحة التحكم
                </Link>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <h1 className="text-3xl font-bold">{group?.name}</h1>
                  <div className="text-gray-400 text-center sm:text-right">
                    <p className="text-lg">
                      مرحباً{" "}
                      <span className="text-indigo-400 font-semibold">
                        {members.find(
                          (m) => m.users?.supabase_auth_id === user?.id
                        )?.users?.display_name || user?.email}
                      </span>
                    </p>
                    {members.find((m) => m.users?.supabase_auth_id === user?.id)
                      ?.joined_at && (
                      <p className="text-sm mt-1 text-gray-400">
                        عضو منذ{" "}
                        {new Intl.DateTimeFormat("ar", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          calendar: "gregory",
                        }).format(
                          new Date(
                            members.find(
                              (m) => m.users?.supabase_auth_id === user?.id
                            ).joined_at
                          )
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                {currentUserRole === "manager" && (
                  <button
                    onClick={() => setSettingsModalOpen(true)}
                    className="p-2 bg-gray-700 text-gray-200 rounded-full hover:bg-gray-600"
                    aria-label="Group Settings"
                  >
                    <FiSettings className="h-6 w-6" />
                  </button>
                )}
                {group && group.invite_code && (
                  <div className="text-start sm:text-end bg-gray-800 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">رمز الدعوة</p>
                    <p className="font-mono text-lg select-all">
                      {group.invite_code}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Balance Summary Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">ملخص الحسابات</h2>
                {canExportData && (
                  <button
                    onClick={handleExportData}
                    className="px-3 py-1 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                  >
                    تصدير البيانات
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {balances.map((member) => (
                  <div
                    key={member.id}
                    className={`p-4 rounded-lg ${
                      member.users?.supabase_auth_id === user?.id
                        ? "border-2 border-indigo-500 "
                        : ""
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
                        {member.users?.supabase_auth_id === user?.id
                          ? "أنت"
                          : member.users?.display_name}
                      </p>
                      {member.users?.supabase_auth_id === user?.id && (
                        <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-full">
                          أنت
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
                      {member.balance.toFixed(2)} $
                    </p>
                    {member.users?.supabase_auth_id === user?.id &&
                      member.balance !== 0 && (
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
                  </div>
                ))}
              </div>
              {user && (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-gray-400">إجمالي ما دفعت</p>
                    <p className="text-lg font-semibold">
                      ${paymentStats.totalPaid.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      (شامل المدفوعات والتسويات)
                    </p>
                  </div>
                  <div className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-gray-400">إجمالي ما استلمت</p>
                    <p className="text-lg font-semibold">
                      ${paymentStats.totalReceived.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      (شامل المستحقات والتسويات)
                    </p>
                  </div>
                  <div className="p-3 bg-gray-700 rounded-lg sm:col-span-1 col-span-2">
                    <p className="text-gray-400">
                      متوسط مصاريف المجموعة الشهرية
                    </p>
                    <p className="text-lg font-semibold">
                      ${paymentStats.monthlyAverage.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      (منذ إنشاء المجموعة)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Owed Debts Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-semibold mb-4">المستحقات</h2>
              {simplifiedDebts.length > 0 ? (
                <ul className="space-y-3">
                  {simplifiedDebts.map((debt, index) => {
                    const isPending = settlements.some(
                      (s) =>
                        s.status === "pending" &&
                        s.from_user_id === debt.from.id &&
                        s.to_user_id === debt.to.id
                    );
                    return (
                      <li
                        key={`${debt.from.id}-${debt.to.id}-${index}`}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-700 rounded-md gap-2"
                      >
                        <div>
                          <span className="font-bold">
                            {debt.from.display_name}
                          </span>{" "}
                          مدين لـ{" "}
                          <span className="font-bold">
                            {debt.to.display_name}
                          </span>
                          <span className="font-semibold text-lg block sm:inline sm:ms-4">
                            ${debt.amount.toFixed(2)}
                          </span>
                        </div>
                        {user &&
                          members.find(
                            (m) => m.users?.supabase_auth_id === user?.id
                          )?.users?.id === debt.from.id && (
                            <button
                              onClick={() =>
                                handleInitiateSettlement(
                                  debt.to.id,
                                  debt.amount
                                )
                              }
                              disabled={settlementLoading || isPending}
                              className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed self-end sm:self-center"
                            >
                              {isPending
                                ? "بانتظار التأكيد"
                                : settlementLoading
                                ? "جاري..."
                                : "سجلت كمدفوع"}
                            </button>
                          )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-gray-400">جميع الحسابات مسواة!</p>
              )}
            </div>

            {/* Pending Settlements Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-semibold mb-4">تسويات معلقة</h2>
              {settlements.filter((s) => s.status === "pending").length > 0 ? (
                <ul className="space-y-3">
                  {settlements
                    .filter((s) => s.status === "pending")
                    .map((settlement, index) => (
                      <li
                        key={`${settlement.id}-${index}`}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-yellow-900/50 rounded-md gap-2"
                      >
                        <div>
                          <span className="font-bold">
                            {settlement.from.display_name}
                          </span>{" "}
                          دفع لـ{" "}
                          <span className="font-bold">
                            {settlement.to.display_name}
                          </span>
                          <span className="text-gray-400 block sm:inline sm:ms-2">
                            (${parseFloat(settlement.amount).toFixed(2)}) -
                            بانتظار التأكيد
                          </span>
                        </div>
                        {user &&
                          members.find(
                            (m) => m.users?.supabase_auth_id === user?.id
                          )?.users?.id === settlement.to_user_id && (
                            <button
                              onClick={() =>
                                handleConfirmSettlement(settlement.id)
                              }
                              disabled={loading}
                              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 self-end sm:self-center"
                            >
                              تأكيد الاستلام
                            </button>
                          )}
                        {user &&
                          members.find(
                            (m) => m.users?.supabase_auth_id === user?.id
                          )?.users?.id === settlement.from_user_id && (
                            <button
                              onClick={() =>
                                handleCancelSettlement(settlement.id)
                              }
                              disabled={loading}
                              className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 self-end sm:self-center"
                            >
                              إلغاء
                            </button>
                          )}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-gray-400">لا توجد تسويات معلقة.</p>
              )}
            </div>

            {/* Add Payment Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-semibold mb-4">إضافة دفعة جديدة</h2>
              <form onSubmit={handleAddPayment} className="space-y-4">
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    الوصف
                  </label>
                  <input
                    type="text"
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-gray-700 text-gray-200"
                    required
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="amount"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      المبلغ
                    </label>
                    <input
                      type="number"
                      id="amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-gray-700 text-gray-200"
                      required
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="paymentDate"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      التاريخ
                    </label>
                    <input
                      type="date"
                      id="paymentDate"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full bg-gray-700 text-gray-200"
                      required
                    />
                  </div>
                </div>
                <div>
                  <p className="block text-sm font-medium text-gray-300">
                    المدفوع بواسطة
                  </p>
                  <p className="mt-1 text-gray-100">
                    {user ? user.display_name : "..."}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="block text-sm font-medium text-gray-300">
                      المستفيدون
                    </p>
                    {members.length > 1 && (
                      <div className="flex items-center">
                        <input
                          id="select-all-beneficiaries"
                          type="checkbox"
                          checked={
                            selectedBeneficiaries.length === members.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBeneficiaries(
                                members.map((m) => m.id)
                              );
                            } else {
                              setSelectedBeneficiaries([]);
                            }
                          }}
                          className="h-4 w-4 text-indigo-500 bg-gray-600 border-gray-500 rounded focus:ring-indigo-600"
                        />
                        <label
                          htmlFor="select-all-beneficiaries"
                          className="ms-2 text-sm text-gray-200"
                        >
                          {selectedBeneficiaries.length === members.length
                            ? "إلغاء تحديد الكل"
                            : "تحديد الكل"}
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                    {members
                      .sort((a, b) => {
                        // Current user should be first (rightmost in RTL)
                        if (a.users?.supabase_auth_id === user?.id) return -1;
                        if (b.users?.supabase_auth_id === user?.id) return 1;
                        return 0;
                      })
                      .map((member) => (
                        <div key={member.id} className="flex items-center">
                          <input
                            id={`beneficiary-${member.id}`}
                            type="checkbox"
                            checked={
                              members.length === 1
                                ? true
                                : selectedBeneficiaries.includes(member.id)
                            }
                            onChange={() => handleBeneficiaryChange(member.id)}
                            disabled={members.length === 1}
                            className={`h-4 w-4 text-indigo-500 bg-gray-600 border-gray-500 rounded focus:ring-indigo-600 ${
                              members.length === 1 ? "opacity-50" : ""
                            }`}
                          />
                          <label
                            htmlFor={`beneficiary-${member.id}`}
                            className={`ms-3 block text-sm ${
                              members.length === 1
                                ? "text-gray-400"
                                : "text-gray-200"
                            }`}
                          >
                            {member.users?.display_name}
                            {member.users?.supabase_auth_id === user?.id &&
                              " (أنت - المدفوع بواسطتك)"}
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={paymentLoading}
                  className="w-full px-4 py-3 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                  {paymentLoading ? "جاري الإضافة..." : "إضافة دفعة"}
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-8">
            {/* Payments List Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-md">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <h2 className="text-2xl font-semibold">الدفعات</h2>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="bg-gray-700 text-sm rounded-md border-gray-600"
                  >
                    <option value="all">كل الدفعات ({payments.length})</option>
                    <option value="paid">
                      ما دفعته (
                      {
                        payments.filter((p) => p.payer_id === currentUserDbId)
                          .length
                      }
                      )
                    </option>
                    <option value="received">
                      ما علي (
                      {
                        payments.filter(
                          (p) =>
                            p.payment_beneficiaries.some(
                              (b) => b.beneficiary_user_id === currentUserDbId
                            ) &&
                            !(
                              p.payment_beneficiaries.length === 1 &&
                              p.payment_beneficiaries[0].beneficiary_user_id ===
                                p.payer_id
                            )
                        ).length
                      }
                      )
                    </option>
                  </select>
                  <select
                    value={paymentSort}
                    onChange={(e) => setPaymentSort(e.target.value)}
                    className="bg-gray-700 text-sm rounded-md border-gray-600"
                  >
                    <option value="newest">الأحدث</option>
                    <option value="oldest">الأقدم</option>
                    <option value="amount">حسب المبلغ</option>
                  </select>
                </div>
              </div>
              {filteredPayments.length > 0 ? (
                <>
                  <div className="text-sm text-gray-400 mb-4">
                    {paymentFilter !== "all" && (
                      <p>
                        إجمالي{" "}
                        {paymentFilter === "paid" ? "ما دفعته" : "ما عليك"}: $
                        {paymentFilter === "paid"
                          ? filteredPayments
                              .reduce((sum, p) => sum + parseFloat(p.amount), 0)
                              .toFixed(2)
                          : filteredPayments
                              .reduce(
                                (sum, p) =>
                                  sum +
                                  parseFloat(p.amount) /
                                    p.payment_beneficiaries.length,
                                0
                              )
                              .toFixed(2)}
                      </p>
                    )}
                    <p>عدد الدفعات: {filteredPayments.length}</p>
                  </div>
                  <ul className="mt-4 space-y-4">
                    {(showAllPayments
                      ? filteredPayments
                      : filteredPayments.slice(0, 3)
                    ).map((payment, index) => (
                      <li
                        key={`${payment.id}-${index}`}
                        className="p-4 bg-gray-900/50 rounded-md space-y-3"
                      >
                        <div className="flex justify-between items-center gap-3">
                          <div className="flex flex-col gap-1">
                            <p className="font-bold text-lg">
                              {payment.description}
                            </p>
                            {payment.payment_beneficiaries.length === 1 &&
                              payment.payment_beneficiaries[0]
                                .beneficiary_user_id === payment.payer_id && (
                                <span className="text-xs bg-yellow-600/50 text-yellow-200 px-2 py-1 rounded-full w-fit">
                                  دفعة ذاتية
                                </span>
                              )}
                          </div>
                          {user &&
                            (payment.payer?.supabase_auth_id === user?.id ||
                              currentUserRole === "manager") && (
                              <button
                                onClick={() => handleDeletePayment(payment.id)}
                                disabled={loading}
                                className="text-red-500 hover:text-red-400 disabled:text-gray-500"
                                aria-label="Delete payment"
                              >
                                <FiTrash2 className="h-5 w-5" />
                              </button>
                            )}
                        </div>

                        <div className="space-y-2 text-gray-300">
                          <div className="flex items-center gap-2">
                            <FiDollarSign className="h-5 w-5 text-indigo-400" />
                            <span className="font-semibold text-white">
                              ${parseFloat(payment.amount).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiUser className="h-5 w-5 text-indigo-400" />
                            <span>
                              {payment.payer?.display_name || "مستخدم"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiCalendar className="h-5 w-5 text-indigo-400" />
                            <span>
                              {new Date(
                                payment.payment_date
                              ).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <FiUsers className="h-5 w-5 mt-0.5 text-indigo-400" />
                            <span className="flex-1">
                              المستفيدون:{" "}
                              {payment.payment_beneficiaries
                                .map((b) => {
                                  const name =
                                    b.beneficiary?.display_name ||
                                    b.beneficiary?.username ||
                                    "مستخدم";
                                  return b.beneficiary_user_id ===
                                    payment.payer_id
                                    ? `${name} (الدافع)`
                                    : name;
                                })
                                .join(", ")}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {filteredPayments.length > 3 && (
                    <button
                      onClick={() => setShowAllPayments(!showAllPayments)}
                      className="mt-4 w-full text-center text-indigo-400 hover:underline"
                    >
                      {showAllPayments ? "إظهار أقل" : "إظهار الكل"}
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-4 text-gray-400">
                  لم تتم إضافة أي دفعات لهذه المجموعة بعد.
                </p>
              )}
            </div>

            {/* Activity Logs Section */}
            {canViewActivityLogs && (
              <div className="bg-gray-800 p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold">سجل النشاط</h2>
                  {canExportData && (
                    <button
                      onClick={handleExportActivityLogs}
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
                            className={`p-4 bg-gray-800 rounded-lg ${
                              index === 0 ? "border-2 border-indigo-500" : ""
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">
                                  {log.user?.id === user?.id ? (
                                    <span className="text-indigo-400">أنت</span>
                                  ) : (
                                    log.user?.display_name
                                  )}{" "}
                                  {formatActivity(log)}
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
                                className={`px-2 py-1 text-xs rounded-full ${
                                  log.action_type === "payment_added"
                                    ? "bg-green-900/50 text-green-400"
                                    : log.action_type === "payment_deleted"
                                    ? "bg-red-900/50 text-red-400"
                                    : log.action_type === "settlement_initiated"
                                    ? "bg-yellow-900/50 text-yellow-400"
                                    : log.action_type === "settlement_confirmed"
                                    ? "bg-blue-900/50 text-blue-400"
                                    : log.action_type === "settlement_cancelled"
                                    ? "bg-red-900/50 text-red-400"
                                    : log.action_type === "group_created"
                                    ? "bg-indigo-900/50 text-indigo-400"
                                    : log.action_type === "member_joined"
                                    ? "bg-green-900/50 text-green-400"
                                    : log.action_type === "member_left"
                                    ? "bg-red-900/50 text-red-400"
                                    : log.action_type ===
                                        "group_settings_updated" ||
                                      log.action_type === "update_settings"
                                    ? "bg-blue-900/50 text-blue-400"
                                    : "bg-gray-700 text-gray-400"
                                }`}
                              >
                                {log.action_type === "payment_added"
                                  ? "دفعة جديدة"
                                  : log.action_type === "payment_deleted"
                                  ? "حذف دفعة"
                                  : log.action_type === "group_created"
                                  ? "إنشاء مجموعة"
                                  : log.action_type === "settlement_initiated"
                                  ? "تسوية معلقة"
                                  : log.action_type === "settlement_confirmed"
                                  ? "تسوية مؤكدة"
                                  : log.action_type === "settlement_cancelled"
                                  ? "تسوية ملغاة"
                                  : log.action_type === "member_joined"
                                  ? "عضو جديد"
                                  : log.action_type === "member_left"
                                  ? "مغادرة عضو"
                                  : log.action_type ===
                                      "group_settings_updated" ||
                                    log.action_type === "update_settings"
                                  ? "تحديث الإعدادات"
                                  : log.action_type}
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
                        {showAllLogs
                          ? "عرض أقل"
                          : `عرض الكل (${activityLogs.length})`}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-center text-gray-400 py-4">
                    لا يوجد نشاط حتى الآن
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-4">
              {modalContent.title}
            </h3>
            <p className="text-gray-300 mb-6">{modalContent.description}</p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
                disabled={loading}
              >
                تراجع
              </button>
              <button
                onClick={modalContent.onConfirm}
                className="px-4 py-2 rounded-md text-white bg-red-700 hover:bg-red-600"
                disabled={loading}
              >
                {loading ? "جاري..." : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-2xl font-bold text-white">
                إعدادات المجموعة
              </h3>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <form
                id="settingsForm"
                onSubmit={handleUpdateSettings}
                className="space-y-8"
              >
                {/* Basic Settings Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4>الإعدادات الأساسية</h4>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        اسم المجموعة
                      </label>
                      <input
                        type="text"
                        value={settings.name}
                        onChange={(e) =>
                          setSettings({ ...settings, name: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        required
                        minLength={3}
                        maxLength={50}
                        pattern="[^<>]*" // Prevent XSS basic characters
                      />
                      <p className="mt-1 text-sm text-gray-400">
                        بين 3 و 50 حرف
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        وصف المجموعة
                      </label>
                      <textarea
                        value={settings.description}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            description: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        rows={3}
                        maxLength={500}
                        placeholder="اكتب وصفاً مختصراً للمجموعة..."
                      />
                      <p className="mt-1 text-sm text-gray-400">
                        {500 - (settings.description?.length || 0)} حرف متبقي
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        كلمة المرور (اتركها فارغة إذا لم ترغب في تغييرها)
                      </label>
                      <input
                        type="password"
                        value={settings.password}
                        onChange={(e) =>
                          setSettings({ ...settings, password: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="••••••••"
                        minLength={6}
                        maxLength={50}
                        pattern="[^<>]*" // Prevent XSS basic characters
                      />
                      {settings.password && (
                        <p className="mt-2 text-sm text-yellow-500">
                          تحذير: تغيير كلمة المرور سيؤدي إلى إزالة جميع الأعضاء
                          غير المديرين
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Member Management Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                    </svg>
                    <h4>إدارة الأعضاء</h4>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        الحد الأقصى لعدد الأعضاء
                      </label>
                      <input
                        type="number"
                        min={members.length}
                        value={settings.member_limit ?? ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            member_limit: Math.max(
                              parseInt(e.target.value) || settings.member_limit,
                              members.length
                            ),
                          })
                        }
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <p className="text-sm text-gray-400 mt-1">
                        الحد الأدنى هو {members.length} (عدد الأعضاء الحاليين)
                      </p>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <label className="text-sm font-medium text-gray-300">
                        إظهار رمز الدعوة للأعضاء
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            invite_code_visible: !settings.invite_code_visible,
                          })
                        }
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                          settings.invite_code_visible
                            ? "bg-indigo-600"
                            : "bg-gray-600"
                        }`}
                      >
                        <span
                          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                            settings.invite_code_visible
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <label className="text-sm font-medium text-gray-300">
                        قبول الأعضاء الجدد تلقائياً
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            auto_approve_members:
                              !settings.auto_approve_members,
                          })
                        }
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                          settings.auto_approve_members
                            ? "bg-indigo-600"
                            : "bg-gray-600"
                        }`}
                      >
                        <span
                          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                            settings.auto_approve_members
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Privacy & Security Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4>الخصوصية والأمان</h4>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        خصوصية سجل النشاط
                      </label>
                      <select
                        value={settings.activity_log_privacy}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            activity_log_privacy: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="all">الكل</option>
                        <option value="managers">المديرون فقط</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        التحكم في تصدير البيانات
                      </label>
                      <select
                        value={settings.export_control}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            export_control: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="all">الكل</option>
                        <option value="managers">المديرون فقط</option>
                      </select>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
                disabled={settingsLoading}
              >
                إلغاء
              </button>
              <button
                type="submit"
                form="settingsForm"
                className="px-6 py-2 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                disabled={settingsLoading}
              >
                {settingsLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
