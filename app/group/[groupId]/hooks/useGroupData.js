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

        // Separate active settlements for balance calculation
        const activeSettlements = settlements.filter(
          (t) => t.status === "active"
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

        // Store all settlements for UI but calculate balances only with active ones
        const processedSettlements = settlements.map((settlement) => {
          const fromUserSplit = settlement.splits.find((s) => s.amount > 0);
          const toUserSplit = settlement.splits.find((s) => s.amount < 0);
          return {
            ...settlement,
            amount: fromUserSplit ? fromUserSplit.amount : 0,
            to_user_id: toUserSplit ? toUserSplit.user_id : null,
          };
        });

        setSettlements(processedSettlements);

        // Update paymentStats calculation to only use active settlements
        const totalPaid =
          activePayments.reduce((sum, p) => {
            const payerSplit = p.splits.find((s) => s.amount > 0);
            return payerSplit && payerSplit.user_id === currentUserDbId
              ? sum + payerSplit.amount
              : sum;
          }, 0) +
          activeSettlements.reduce((sum, s) => {
            const fromUserSplit = s.splits.find((split) => split.amount > 0);
            return fromUserSplit && fromUserSplit.user_id === currentUserDbId
              ? sum + fromUserSplit.amount
              : sum;
          }, 0);

        const totalReceived =
          activePayments.reduce((sum, p) => {
            const userSplit = p.splits.find(
              (s) => s.user_id === currentUserDbId && s.amount < 0
            );
            return userSplit ? sum + Math.abs(userSplit.amount) : sum;
          }, 0) +
          activeSettlements.reduce((sum, s) => {
            const toUserSplit = s.splits.find((split) => split.amount < 0);
            return toUserSplit && toUserSplit.user_id === currentUserDbId
              ? sum + Math.abs(toUserSplit.amount)
              : sum;
          }, 0);

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

  useEffect(() => {
    fetchGroupData(true);
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

// New client-side debt calculation function
function calculateSimplifiedDebts(transactions, members) {
  const balances = new Map();
  members.forEach((m) => balances.set(m.users.id, 0));

  // Only 'active' transactions affect the final balance
  transactions
    .filter((t) => t.status === "active")
    .forEach((t) => {
      t.splits.forEach((split) => {
        balances.set(
          split.user_id,
          (balances.get(split.user_id) || 0) + parseFloat(split.amount)
        );
      });
    });

  const debtors = [];
  const creditors = [];

  balances.forEach((balance, userId) => {
    if (balance < 0) {
      debtors.push({ userId, amount: -balance });
    } else if (balance > 0) {
      creditors.push({ userId, amount: balance });
    }
  });

  debtors.sort((a, b) => a.amount - b.amount);
  creditors.sort((a, b) => a.amount - b.amount);

  const debts = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0.005) {
      // Epsilon for floating point issues
      debts.push({
        from_user_id: debtor.userId,
        to_user_id: creditor.userId,
        amount: amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.005) i++;
    if (creditor.amount < 0.005) j++;
  }

  return debts;
}
