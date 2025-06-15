"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
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

export default function GroupPage() {
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settings, setSettings] = useState({ name: "", password: "" });
  const [payments, setPayments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState([]);

  // Auto-select the user as beneficiary if they're the only member
  useEffect(() => {
    if (members.length === 1 && user?.id) {
      setSelectedBeneficiaries([user.id]);
    }
  }, [members.length, user?.id]);
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId;

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    description: "",
    onConfirm: null,
  });

  // UI States
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [balances, setBalances] = useState([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState([]);

  const calculateAll = useCallback((payments, settlements, members) => {
    // Calculate Net Balances
    const memberBalances = members.reduce((acc, member) => {
      acc[member.id] = { ...member, balance: 0 };
      return acc;
    }, {});

    payments.forEach((payment) => {
      const amount = parseFloat(payment.amount);
      const beneficiaries = payment.payment_beneficiaries;
      const numBeneficiaries = beneficiaries.length;
      if (numBeneficiaries === 0) return;

      if (memberBalances[payment.payer_id]) {
        memberBalances[payment.payer_id].balance += amount;
      }

      const amountInCents = Math.round(amount * 100);
      const shareInCents = Math.floor(amountInCents / numBeneficiaries);
      let remainderInCents = amountInCents % numBeneficiaries;

      beneficiaries.forEach((beneficiary) => {
        let individualShareInCents = shareInCents;
        if (remainderInCents > 0) {
          individualShareInCents++;
          remainderInCents--;
        }
        if (memberBalances[beneficiary.beneficiary_user_id]) {
          memberBalances[beneficiary.beneficiary_user_id].balance -=
            individualShareInCents / 100;
        }
      });
    });

    const confirmedSettlements = settlements.filter(
      (s) => s.status === "confirmed"
    );
    confirmedSettlements.forEach((settlement) => {
      const amount = parseFloat(settlement.amount);
      if (memberBalances[settlement.from_user_id])
        memberBalances[settlement.from_user_id].balance += amount;
      if (memberBalances[settlement.to_user_id])
        memberBalances[settlement.to_user_id].balance -= amount;
    });

    // Round all balances to 2 decimal places to avoid floating point inaccuracies
    for (const memberId in memberBalances) {
      memberBalances[memberId].balance =
        Math.round(memberBalances[memberId].balance * 100) / 100;
    }

    setBalances(Object.values(memberBalances));

    // Simplify Debts
    const debtorsInCents = Object.values(memberBalances)
      .filter((m) => m.balance < -0.005) // Stricter check for debtors
      .map((d) => ({ ...d, balance: Math.round(d.balance * 100) }));
    const creditorsInCents = Object.values(memberBalances)
      .filter((m) => m.balance > 0.005) // Stricter check for creditors
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

      if (debtor.balance === 0) i++;
      if (creditor.balance === 0) j++;
    }
    setSimplifiedDebts(debts);
  }, []);

  useEffect(() => {
    const currentUser = localStorage.getItem("hisab_user");
    console.log("Debug - Initial user check:", { currentUser, groupId });
    if (currentUser) {
      try {
        const parsedUser = JSON.parse(currentUser);
        console.log("Debug - Setting user:", parsedUser);
        setUser(parsedUser);
      } catch (err) {
        console.error("Invalid user data in localStorage:", err);
        localStorage.removeItem("hisab_user");
        router.push("/");
      }
    } else {
      console.log("Debug - No user found, redirecting to home");
      router.push("/");
    }
  }, [router, groupId]);

  const fetchGroupData = useCallback(async () => {
    console.log("Debug - fetchGroupData called:", {
      user,
      loading,
      groupId,
      supabaseUrl: supabase.supabaseUrl,
    });

    setError("");
    if (!user?.id) {
      console.log("Debug - No user ID, skipping fetch");
      return;
    }

    try {
      // First check if user is authenticated
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      console.log("Debug - Current session:", { session, sessionError });

      if (sessionError || !session) {
        console.error("Authentication error:", sessionError);
        toast.error("Session expired. Please log in again.");
        router.push("/");
        return;
      }

      // First check if the group exists
      console.log("Debug - Fetching group:", groupId);
      const { data: initialGroupData, error: groupError } = await supabase
        .rpc("get_group_details", {
          p_group_id: groupId,
          p_user_id: user.id,
        })
        .maybeSingle();

      console.log("Debug - Group fetch result:", {
        initialGroupData,
        groupError,
        requestHeaders: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabase.supabaseKey,
        },
      });

      // Check if there was an error fetching the group
      if (groupError) {
        console.error("Error fetching group:", groupError);
        if (groupError.code === "PGRST301") {
          toast.error("Session expired. Please log in again.");
          router.push("/");
        } else {
          setError(`Failed to fetch group: ${groupError.message}`);
        }
        setLoading(false);
        return;
      }

      // If group doesn't exist
      if (!initialGroupData) {
        console.error("Group not found in database");
        setError("This group does not exist");
        toast.error("This group does not exist. Redirecting to dashboard...");
        router.push("/");
        return;
      }

      let groupData = initialGroupData;

      // Check if we're already a member
      console.log("Debug - Checking membership");
      let currentMemberData;
      const { data: initialMemberData, error: memberError } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .maybeSingle();

      console.log("Debug - Membership check:", {
        initialMemberData,
        memberError,
        userId: user.id,
        groupId,
      });

      if (memberError) {
        console.error("Error checking membership:", memberError);
        if (memberError.code === "PGRST301") {
          toast.error("Session expired. Please log in again.");
          router.push("/");
        } else {
          setError(`Failed to check membership: ${memberError.message}`);
        }
        setLoading(false);
        return;
      }

      // If already a member, just proceed with data fetching
      if (initialMemberData) {
        console.log("Debug - Already a member, proceeding with data fetch");
        currentMemberData = initialMemberData;
      }
      // If not a member and it's a private group, redirect to join page
      else if (!initialMemberData && groupData.password) {
        console.log(
          "Debug - Not a member of private group, redirecting to join page"
        );
        router.push(`/join/${groupId}`);
        return;
      }
      // If not a member and it's a public group, try to join
      else if (!initialMemberData) {
        console.log("Debug - Not a member of public group, attempting to join");
        try {
          const { data: joinResponse, error: joinError } =
            await supabase.functions.invoke("join-group", {
              body: {
                group_id: groupId,
              },
            });

          console.log("Debug - Join attempt:", { joinResponse, joinError });

          if (joinError) {
            console.error("Failed to join group:", joinError);
            setError(`Failed to join group: ${joinError.message}`);
            setLoading(false);
            return;
          }

          if (joinResponse?.error) {
            console.error("Error in join response:", joinResponse.error);
            setError(`Failed to join group: ${joinResponse.error}`);
            setLoading(false);
            return;
          }

          if (joinResponse?.redirect && joinResponse.group_id !== groupId) {
            console.log("Debug - Redirecting to different group");
            router.push(`/group/${joinResponse.group_id}`);
            return;
          }

          // Refresh membership data after joining
          const { data: refreshedMemberData, error: refreshError } =
            await supabase
              .from("group_members")
              .select("role")
              .eq("group_id", groupId)
              .eq("user_id", user.id)
              .maybeSingle();

          if (refreshError) {
            console.error("Error refreshing membership:", refreshError);
            setError(`Failed to refresh membership: ${refreshError.message}`);
            setLoading(false);
            return;
          }

          currentMemberData = refreshedMemberData;

          if (joinResponse?.message) {
            toast.success(joinResponse.message);
          }
        } catch (err) {
          console.error("Error in join process:", err);
          setError(`Failed to join group: ${err.message}`);
          setLoading(false);
          return;
        }
      }

      // Now fetch members and other data
      console.log("Debug - Fetching additional data");
      const [
        { data: membersData, error: membersError },
        { data: paymentsData, error: paymentsError },
        { data: settlementsData, error: settlementsError },
        { data: logsData, error: logsError },
      ] = await Promise.all([
        supabase
          .from("group_members")
          .select(
            `
            id,
            role,
            users (
              id,
              username,
              display_name
            )
          `
          )
          .eq("group_id", groupId),
        supabase
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
              beneficiary:users (
                id,
                username,
                display_name
              ),
              beneficiary_user_id
            )
          `
          )
          .eq("group_id", groupId)
          .order("created_at", { ascending: false }),
        supabase
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
          .eq("group_id", groupId),
        supabase
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
          .order("created_at", { ascending: false }),
      ]);

      console.log("Debug - Additional data fetched:", {
        membersData,
        membersError,
        paymentsData,
        paymentsError,
        settlementsData,
        settlementsError,
        logsData,
        logsError,
      });

      // Check for errors
      const errors = {
        membersError,
        paymentsError,
        settlementsError,
        logsError,
      };
      const errorDetails = Object.entries(errors)
        .filter(([_, value]) => value)
        .map(
          ([key, value]) => `${key}: ${value.message || JSON.stringify(value)}`
        )
        .join("; ");

      if (errorDetails) {
        console.error("Errors fetching related data:", errorDetails);
        if (Object.values(errors).some((err) => err?.code === "PGRST301")) {
          toast.error("Session expired. Please log in again.");
          router.push("/");
        } else {
          setError(`Failed to fetch related data. Details: ${errorDetails}`);
        }
        setLoading(false);
        return;
      }

      // Process members data
      const fetchedMembers = [];
      if (membersData && Array.isArray(membersData)) {
        for (const m of membersData) {
          if (m?.users?.id) {
            fetchedMembers.push({
              id: m.users.id,
              username: m.users.username || "مستخدم",
              display_name:
                m.users.display_name || m.users.username || "مستخدم",
              role: m.role || "member",
            });
          }
        }
      }

      console.log("Debug - Setting state with fetched data:", {
        groupData,
        fetchedMembers,
        currentUserRole: currentMemberData?.role,
      });

      // Set all the state
      setMembers(fetchedMembers);
      setPayments(paymentsData || []);
      setSettlements(settlementsData || []);
      setActivityLogs(logsData || []);

      if (groupData) {
        setGroup({
          id: groupId,
          name: groupData.group_name || "",
          invite_code: groupData.group_invite_code,
          invite_code_visible: groupData.group_invite_code_visible,
          manager_id: groupData.group_manager_id,
        });

        // Set current user role based on memberData
        if (user?.id) {
          if (currentMemberData?.role) {
            setCurrentUserRole(currentMemberData.role);
            console.log(
              "Debug - Setting role from memberData:",
              currentMemberData.role
            );
          }
        }
      }

      // Calculate balances and debts
      if (fetchedMembers.length > 0) {
        console.log("Debug - Calculating balances");
        calculateAll(paymentsData || [], settlementsData || [], fetchedMembers);
      }

      console.log("Debug - Finished loading");
      setLoading(false);
    } catch (err) {
      console.error("Error fetching group data:", err);
      if (err.message?.includes("JWT")) {
        toast.error("Session expired. Please log in again.");
        router.push("/");
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  }, [user?.id, groupId, router, calculateAll]);

  useEffect(() => {
    console.log("Debug - User effect triggered:", {
      userId: user?.id,
      loading,
      error,
    });
    if (user?.id) {
      fetchGroupData();
    }
  }, [user?.id, fetchGroupData]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Add loading state check at the start of the component
  if (loading) {
    console.log("Debug - Rendering loading state");
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">جاري تحميل المجموعة...</h2>
          <p className="text-gray-500">يرجى الانتظار قليلاً</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.log("Debug - Rendering error state:", error);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-500">حدث خطأ</h2>
          <p className="text-gray-500">{error}</p>
          <Link
            href="/"
            className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            العودة للوحة التحكم
          </Link>
        </div>
      </div>
    );
  }

  const handleInitiateSettlement = async (toUserId, amount) => {
    if (!user) return;
    setSettlementLoading(true);
    try {
      const { error } = await supabase.from("settlements").insert({
        group_id: groupId,
        from_user_id: user.id,
        to_user_id: toUserId,
        amount: amount,
        status: "pending",
      });
      if (error) throw error;
      const toUser = members.find((m) => m.id === toUserId);
      await supabase.functions.invoke("log_activity", {
        body: {
          group_id: groupId,
          action_type: "settlement_initiated",
          payload: {
            from_user_id: user.id,
            to_user_id: toUserId,
            from_user_name: user.display_name,
            to_user_name: toUser?.display_name,
            amount: amount,
          },
        },
      });
      toast.success("Settlement offer sent!");
    } catch (err) {
      console.error("Error initiating settlement:", err);
      toast.error("Failed to initiate settlement.");
    } finally {
      setSettlementLoading(false);
    }
  };

  const handleConfirmSettlement = async (settlementId) => {
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

      await supabase.functions.invoke("log_activity", {
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

      toast.success("Settlement confirmed!");
    } catch (err) {
      console.error("Error confirming settlement:", err);
      toast.error("Failed to confirm settlement.");
    } finally {
      setLoading(false);
    }
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
    if (!description.trim()) {
      toast.error("الرجاء إدخال وصف للدفعة");
      return;
    }
    if (selectedBeneficiaries.length === 0) {
      toast.error("الرجاء اختيار مستفيد واحد على الأقل");
      return;
    }
    if (!user) {
      toast.error("يجب تسجيل الدخول أولاً");
      return;
    }

    setError("");
    setPaymentLoading(true);

    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from("payments")
        .insert({
          group_id: groupId,
          payer_id: user.id,
          amount: parsedAmount,
          description: description.trim(),
          payment_date: paymentDate,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const beneficiariesToInsert = selectedBeneficiaries.map(
        (beneficiaryId) => ({
          payment_id: paymentData.id,
          beneficiary_user_id: beneficiaryId,
        })
      );

      const { error: beneficiariesError } = await supabase
        .from("payment_beneficiaries")
        .insert(beneficiariesToInsert);

      if (beneficiariesError) throw beneficiariesError;

      const beneficiaryNames = members
        .filter((m) => selectedBeneficiaries.includes(m.id))
        .map((m) => m.display_name || m.username || "مستخدم");

      await supabase.functions.invoke("log_activity", {
        body: {
          group_id: groupId,
          action_type: "payment_added",
          payload: {
            payer_id: user.id,
            beneficiary_ids: selectedBeneficiaries,
            amount: parsedAmount,
            description: description.trim(),
            payer_name: user.display_name || user.username || "مستخدم",
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

        await supabase.functions.invoke("log_activity", {
          body: {
            group_id: groupId,
            action_type: "payment_deleted",
            payload: {
              description: paymentToDelete.description,
              amount: paymentToDelete.amount,
              payer_name: user.display_name,
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
      const { error } = await supabase.functions.invoke(
        "update-group-settings",
        {
          body: {
            group_id: groupId,
            name: settings.name,
            password: settings.password,
          },
        }
      );
      if (error) throw error;

      if (settings.password) {
        toast.success(
          "Settings updated! All non-manager members were removed for security."
        );
      } else {
        toast.success("Group settings updated!");
      }

      setSettingsModalOpen(false);
    } catch (err) {
      console.error("Error updating settings:", err);
      toast.error(
        "Failed to update settings: " +
          (err.data?.error?.message || err.message)
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

  return (
    <main className="flex flex-col items-center min-h-screen p-4 sm:p-8">
      <div className="w-full max-w-7xl">
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <Link
                href="/"
                className="text-indigo-400 hover:underline mb-4 block"
              >
                &rarr; العودة للوحة التحكم
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold">
                مجموعة: {group ? group.name : "..."}
              </h1>
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
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
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
                        {user && user.id === debt.from.id && (
                          <button
                            onClick={() =>
                              handleInitiateSettlement(debt.to.id, debt.amount)
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
                        {user && user.id === settlement.to_user_id && (
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
                        {user && user.id === settlement.from_user_id && (
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
                  <p className="block text-sm font-medium text-gray-300">
                    المستفيدون
                  </p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                    {members.map((member) => (
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
                          disabled={
                            members.length === 1 || member.id === user?.id
                          }
                          className="h-4 w-4 text-indigo-500 bg-gray-600 border-gray-500 rounded focus:ring-indigo-600 disabled:opacity-50"
                        />
                        <label
                          htmlFor={`beneficiary-${member.id}`}
                          className={`ms-3 block text-sm ${
                            member.id === user?.id
                              ? "text-gray-400"
                              : "text-gray-200"
                          }`}
                        >
                          {member.display_name}
                          {member.id === user?.id && " (أنت - المدفوع بواسطتك)"}
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
              <h2 className="text-2xl font-semibold">الدفعات</h2>
              {payments.length > 0 ? (
                <>
                  <ul className="mt-4 space-y-4">
                    {(showAllPayments ? payments : payments.slice(0, 3)).map(
                      (payment, index) => (
                        <li
                          key={`${payment.id}-${index}`}
                          className="p-4 bg-gray-900/50 rounded-md space-y-3"
                        >
                          <div className="flex justify-between items-center gap-3">
                            <p className="font-bold text-lg">
                              {payment.description}
                            </p>
                            {user &&
                              (user.id === payment.payer_id ||
                                currentUserRole === "manager") && (
                                <button
                                  onClick={() =>
                                    handleDeletePayment(payment.id)
                                  }
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
                      )
                    )}
                  </ul>
                  {payments.length > 3 && (
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
            <div className="bg-gray-800 p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-semibold mb-4">سجل النشاط</h2>
              {activityLogs.length > 0 ? (
                <>
                  <ul className="mt-4 space-y-4 text-sm">
                    {(showAllActivities
                      ? activityLogs
                      : activityLogs.slice(0, 5)
                    ).map((log) => (
                      <li
                        key={log.id}
                        className="border-b border-gray-700 pb-2"
                      >
                        <p>
                          <span className="font-bold">
                            {log.user?.display_name || "A user"}
                          </span>{" "}
                          {formatActivity(log)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {activityLogs.length > 5 && (
                    <button
                      onClick={() => setShowAllActivities(!showAllActivities)}
                      className="mt-4 w-full text-center text-indigo-400 hover:underline"
                    >
                      {showAllActivities ? "إظهار أقل" : "إظهار الكل"}
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-4 text-gray-500">لا يوجد نشاط حديث.</p>
              )}
            </div>
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
          <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">
              إعدادات المجموعة
            </h3>
            {/* Settings Form */}
            <form onSubmit={handleUpdateSettings} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Group Name */}
                <div>
                  <label
                    htmlFor="groupName"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    اسم المجموعة
                  </label>
                  <input
                    id="groupName"
                    type="text"
                    value={settings.name}
                    onChange={(e) =>
                      setSettings({ ...settings, name: e.target.value })
                    }
                    className="w-full bg-gray-700"
                  />
                </div>
                {/* Group Password */}
                <div>
                  <label
                    htmlFor="groupPassword"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    كلمة المرور (اتركه فارغاً لعدم التغيير)
                  </label>
                  <input
                    id="groupPassword"
                    type="password"
                    placeholder="••••••••"
                    value={settings.password}
                    onChange={(e) =>
                      setSettings({ ...settings, password: e.target.value })
                    }
                    className="w-full bg-gray-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                  disabled={settingsLoading}
                >
                  {settingsLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
                </button>
              </div>
            </form>

            {/* Member Management */}
            <div className="mt-8">
              <h4 className="text-xl font-bold text-white mb-4">
                إدارة الأعضاء
              </h4>
              <ul className="space-y-3 max-h-60 overflow-y-auto">
                {members.map((member, index) => (
                  <li
                    key={`${member.id}-${index}`}
                    className="flex justify-between items-center p-3 bg-gray-700 rounded-md"
                  >
                    <div>
                      <p className="font-semibold">{member.display_name}</p>
                      <p className="text-sm text-gray-400">{member.role}</p>
                    </div>
                    {user &&
                      user.id !== member.id &&
                      currentUserRole === "manager" &&
                      member.role !== "manager" && (
                        <button
                          onClick={() => handleKickMember(member.id)}
                          className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                          disabled={loading}
                        >
                          طرد
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const formatActivity = (log) => {
  const payload = log.payload || {};
  const amount = payload.amount ? parseFloat(payload.amount).toFixed(2) : "";
  const userName = log.user?.display_name || log.user?.username || "مستخدم";

  switch (log.action_type) {
    case "group_created":
      return `أنشأ المجموعة '${payload.groupName || "مجموعة"}'`;
    case "member_joined":
      return `انضم إلى المجموعة`;
    case "payment_added":
      return `أضاف دفعة بقيمة $${amount} لـ "${payload.description || ""}"`;
    case "settlement_initiated":
      return `قام بسداد مبلغ لـ ${payload.to_user_name || "مستخدم"}`;
    case "settlement_confirmed":
      return `أكد استلام تسوية من ${payload.from_user_name || "مستخدم"}`;
    case "payment_deleted":
      return `حذف دفعة "${payload.description || ""}" بقيمة $${parseFloat(
        payload.amount || 0
      ).toFixed(2)}`;
    default:
      return "قام بنشاط ما";
  }
};
