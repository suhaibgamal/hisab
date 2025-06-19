"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../../../lib/supabase";
import { useRouter } from "next/navigation";

export function useGroupData(groupId) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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

  const fetchGroupData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFatalError(null);

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
        router.replace(`/join/${groupId}`);
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

      const { data: debtsData, error: debtsError } = debtsResult;
      if (debtsError) {
        setDebts([]);
      } else if (debtsData && debtsData.debts) {
        setDebts(debtsData.debts);
      } else {
        setDebts([]);
      }
    } catch (err) {
      if (!fatalError) {
        setError(err.message || "An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, router, fatalError]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  return {
    loading,
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
    setGroup, // Expose setGroup for realtime updates
    fetchGroupData, // Expose for manual refetching
  };
}
