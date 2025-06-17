"use client";

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export function useRealtimeSubscription(groupId, callbacks) {
  const channelRef = useRef(null);
  const didMountRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    // Skip the first mount in Strict Mode
    if (!didMountRef.current) {
      didMountRef.current = true;
      console.log("[Debug] Skipping first mount in Strict Mode");
      return;
    }

    if (!groupId) {
      console.log("[Debug] No groupId provided, skipping setup");
      return;
    }

    let isCancelled = false;

    const setupSubscription = async () => {
      try {
        // Only load initial data if it hasn't been loaded yet
        if (!initialLoadDoneRef.current && !isCancelled) {
          console.log("[Debug] Loading initial data for group:", groupId);

          // Fetch all data in parallel for better performance
          const [
            { data: payments, error: paymentsError },
            { data: settlements, error: settlementsError },
            { data: members, error: membersError },
            { data: logs, error: logsError },
          ] = await Promise.all([
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
                  id,
                  beneficiary:users!payment_beneficiaries_beneficiary_user_id_fkey (
                    id,
                    username,
                    display_name
                  )
                )
              `
              )
              .eq("group_id", groupId),
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
              .limit(50),
          ]);

          console.log("[Debug] Initial data fetch results:", {
            payments: { data: payments, error: paymentsError },
            settlements: { data: settlements, error: settlementsError },
            members: { data: members, error: membersError },
            logs: { data: logs, error: logsError },
          });

          if (!isCancelled) {
            // Update all state at once to minimize re-renders
            if (payments && !paymentsError) {
              console.log("[Debug] Setting initial payments:", payments.length);
              callbacks.onPaymentChange({ type: "INSERT", new: payments });
            }
            if (settlements && !settlementsError) {
              console.log(
                "[Debug] Setting initial settlements:",
                settlements.length
              );
              callbacks.onSettlementChange({
                type: "INSERT",
                new: settlements,
              });
            }
            if (members && !membersError) {
              console.log("[Debug] Setting initial members:", members.length);
              callbacks.onMemberChange({ type: "INSERT", new: members });
            }
            if (logs && !logsError) {
              console.log("[Debug] Setting initial logs:", logs.length);
              callbacks.onActivityLogChange({ type: "INSERT", new: logs });
            }

            initialLoadDoneRef.current = true;
          }
        }

        // Set up realtime subscription
        if (!isCancelled) {
          console.log(
            "[Debug] Setting up realtime subscription for group:",
            groupId
          );
          const channel = supabase
            .channel(`group_${groupId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "payments",
                filter: `group_id=eq.${groupId}`,
              },
              (payload) => {
                console.log("[Debug] Received payment change:", payload);
                if (!isCancelled) {
                  callbacks.onPaymentChange(payload);
                }
              }
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "settlements",
                filter: `group_id=eq.${groupId}`,
              },
              (payload) => {
                console.log("[Debug] Received settlement change:", payload);
                if (!isCancelled) {
                  callbacks.onSettlementChange(payload);
                }
              }
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "group_members",
                filter: `group_id=eq.${groupId}`,
              },
              (payload) => {
                console.log("[Debug] Received member change:", payload);
                if (!isCancelled) {
                  callbacks.onMemberChange(payload);
                }
              }
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "activity_logs",
                filter: `group_id=eq.${groupId}`,
              },
              (payload) => {
                console.log("[Debug] Received activity log change:", payload);
                if (!isCancelled) {
                  callbacks.onActivityLogChange(payload);
                }
              }
            )
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "groups",
                filter: `id=eq.${groupId}`,
              },
              (payload) => {
                console.log("[Debug] Received group change:", payload);
                if (!isCancelled) {
                  callbacks.onGroupChange(payload);
                }
              }
            );

          console.log("[Debug] Subscribing to channel");
          await channel.subscribe((status, err) => {
            console.log("[Debug] Channel subscription status:", status, err);
            if (status === "SUBSCRIBED") {
              console.log("[Debug] Channel successfully subscribed");
            }
          });

          channelRef.current = channel;
          console.log("[Debug] Channel setup complete");
        }
      } catch (error) {
        console.error("[Debug] Error in setupSubscription:", error);
      }
    };

    setupSubscription();

    return () => {
      console.log("[Debug] Running cleanup");
      isCancelled = true;
      initialLoadDoneRef.current = false;
      if (channelRef.current) {
        console.log("[Debug] Removing channel");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [groupId, callbacks]);
}
