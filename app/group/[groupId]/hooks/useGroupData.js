"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "../../../../lib/supabase";
import { useRouter } from "next/navigation";

export function useGroupData(groupId) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fatalError, setFatalError] = useState(null);

  const [user, setUser] = useState(null);
  const [group, setGroupState] = useState(null);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [balances, setBalances] = useState([]);
  const [debts, setDebts] = useState([]);

  const [currentUserDbId, setCurrentUserDbId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  const setGroup = useCallback((group) => setGroupState(group), []);

  const fetchGroupData = useCallback(
    async (showPageLoader = true) => {
      if (showPageLoader) {
        setLoading(true);
      }
      setError(null);
      // We don't clear fatal error, if it happens once, it's persistent
      // setFatalError(null);

      try {
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

        const { data: membersData, error: membersError } = await supabase
          .from("group_members")
          .select(
            "id, role, joined_at, users(id, username, display_name, supabase_auth_id)"
          )
          .eq("group_id", groupId);

        if (membersError) throw new Error("Could not verify your membership.");
        setMembers(membersData);

        const currentMember = membersData.find(
          (m) => m.users?.supabase_auth_id === session.user.id
        );
        if (!currentMember) {
          // Redirect to join page with invite code if available
          if (groupData && groupData.invite_code) {
            router.replace(`/join/${groupData.invite_code}`);
          } else {
            router.replace(`/join/unknown`);
          }
          return;
        }
        setCurrentUserRole(currentMember.role);
        setCurrentUserDbId(currentMember.users?.id);

        const [
          transactionsResult,
          activityLogsResult,
          balancesResult,
          debtsResult,
        ] = await Promise.all([
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

        const { data: transactionsData, error: transactionsError } =
          transactionsResult;
        if (transactionsError) throw new Error("Error loading transactions");
        const allTransactions = transactionsData || [];

        // Separate transactions by type and status
        const activePayments = allTransactions.filter(
          (t) => t.type === "payment" && t.status === "active"
        );
        const settlements = allTransactions.filter(
          (t) => t.type === "settlement"
        ); // Keep all settlements for UI display

        setPayments(
          activePayments.map((payment) => {
            const payerSplit = payment.splits.find((s) => s.amount > 0);
            return {
              ...payment,
              amount: payerSplit ? payerSplit.amount : 0,
              payer: payerSplit ? payerSplit.user : null,
            };
          })
        );

        const processedSettlements = settlements.map((settlement) => {
          const fromUserSplit = settlement.splits.find((s) => s.amount > 0);
          const toUserSplit = settlement.splits.find((s) => s.amount < 0);
          return {
            ...settlement,
            amount: fromUserSplit ? fromUserSplit.amount : 0,
            from_user_id: fromUserSplit ? fromUserSplit.user_id : null,
            to_user_id: toUserSplit ? toUserSplit.user_id : null,
          };
        });

        setSettlements(processedSettlements);

        const { data: activityLogsData, error: activityLogsError } =
          activityLogsResult;
        if (activityLogsError) throw new Error("Error loading activity logs");
        setActivityLogs(activityLogsData || []);

        const { data: balancesData, error: balancesError } = balancesResult;
        if (balancesError) {
          setBalances([]);
        } else {
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

          // Merge all members with balances, defaulting to 0 if missing
          const allBalances = membersData.map((member) => {
            const balanceEntry = balancesArray.find(
              (b) => b.user_id === member.users.id
            );
            return {
              user_id: member.users.id,
              balance: balanceEntry ? balanceEntry.balance : 0,
              ...member.users,
              joined_at: member.joined_at,
              role: member.role,
            };
          });
          setBalances(allBalances);
        }

        const { data: debtsData, error: debtsError } = debtsResult;
        if (debtsError) {
          setDebts([]);
        } else if (debtsData && Array.isArray(debtsData.debts)) {
          setDebts(debtsData.debts);
        } else {
          setDebts([]);
        }
      } catch (err) {
        if (!fatalError) {
          setError(err.message || "An unexpected error occurred");
        }
      } finally {
        if (showPageLoader) {
          setLoading(false);
        }
      }
    },
    [groupId, router, fatalError]
  );

  // Fetch only payments and settlements
  const fetchPaymentsAndSettlements = useCallback(async () => {
    try {
      const [transactionsResult, balancesResult, debtsResult] =
        await Promise.all([
          supabase
            .from("transactions")
            .select(
              "*, splits:transaction_splits(id, user_id, amount, user:users(id, username, display_name))"
            )
            .eq("group_id", groupId)
            .order("created_at", { ascending: false }),
          supabase.functions.invoke("get-group-balances", {
            body: { group_id: groupId },
          }),
          supabase.functions.invoke("get-simplified-debts", {
            body: { group_id: groupId },
          }),
        ]);

      const { data: transactionsData } = transactionsResult;
      const allTransactions = transactionsData || [];
      const activePayments = allTransactions.filter(
        (t) => t.type === "payment" && t.status === "active"
      );
      const settlements = allTransactions.filter(
        (t) => t.type === "settlement"
      );

      setPayments(
        activePayments.map((payment) => {
          const payerSplit = payment.splits.find((s) => s.amount > 0);
          return {
            ...payment,
            amount: payerSplit ? payerSplit.amount : 0,
            payer: payerSplit ? payerSplit.user : null,
          };
        })
      );
      const processedSettlements = settlements.map((settlement) => {
        const fromUserSplit = settlement.splits.find((s) => s.amount > 0);
        const toUserSplit = settlement.splits.find((s) => s.amount < 0);
        return {
          ...settlement,
          amount: fromUserSplit ? fromUserSplit.amount : 0,
          from_user_id: fromUserSplit ? fromUserSplit.user_id : null,
          to_user_id: toUserSplit ? toUserSplit.user_id : null,
        };
      });
      setSettlements(processedSettlements);

      // Balances
      const { data: balancesData } = balancesResult;
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
      setBalances((prev) => {
        // Use previous members state for mapping
        return members.map((member) => {
          const balanceEntry = balancesArray.find(
            (b) => b.user_id === member.users.id
          );
          return {
            user_id: member.users.id,
            balance: balanceEntry ? balanceEntry.balance : 0,
            ...member.users,
            joined_at: member.joined_at,
            role: member.role,
          };
        });
      });

      // Debts
      const { data: debtsData } = debtsResult;
      if (debtsData && Array.isArray(debtsData.debts)) {
        setDebts(debtsData.debts);
      } else {
        setDebts([]);
      }
    } catch (err) {
      // fallback: refetch all if error
      fetchGroupData(false);
    }
  }, [groupId, members, fetchGroupData]);

  // Fetch only members
  const fetchMembers = useCallback(async () => {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from("group_members")
        .select(
          "id, role, joined_at, users(id, username, display_name, supabase_auth_id)"
        )
        .eq("group_id", groupId);
      if (membersError) throw new Error("Could not verify your membership.");
      setMembers(membersData);
    } catch (err) {
      // fallback: refetch all if error
      fetchGroupData(false);
    }
  }, [groupId, fetchGroupData]);

  useEffect(() => {
    fetchGroupData(true);
  }, [fetchGroupData]);

  // --- MEMOIZED FUNCTIONS FOR STABILITY ---
  // These must be memoized to avoid breaking real-time subscriptions in parent components.
  const setGroupMemo = useCallback((group) => {
    setGroup(group);
  }, []);

  return useMemo(
    () => ({
      group,
      setGroup: setGroupMemo,
      fetchGroupData,
      fetchPaymentsAndSettlements,
      fetchMembers,
      loading,
      error,
      fatalError,
      user,
      members,
      payments,
      settlements,
      activityLogs,
      balances,
      debts,
      currentUserDbId,
      currentUserRole,
    }),
    [
      group,
      setGroupMemo,
      fetchGroupData,
      fetchPaymentsAndSettlements,
      fetchMembers,
      loading,
      error,
      fatalError,
      user,
      members,
      payments,
      settlements,
      activityLogs,
      balances,
      debts,
      currentUserDbId,
      currentUserRole,
    ]
  );
}
