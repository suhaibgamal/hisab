"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../../../../lib/supabase";
import { toast } from "sonner";

function now() {
  return new Date().toISOString();
}

export function useRealtime(groupId, onRealtimeEvent) {
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [reconnectKey, setReconnectKey] = useState(0);
  const lastStatusRef = useRef();
  const channelRef = useRef(null);
  const intervalRef = useRef(null);
  const prevGroupIdRef = useRef();
  const prevOnRealtimeEventRef = useRef();
  const effectRunCount = useRef(0);
  const eventHandlerRef = useRef(onRealtimeEvent);

  useEffect(() => {
    eventHandlerRef.current = onRealtimeEvent;
  }, [onRealtimeEvent]);

  useEffect(() => {
    effectRunCount.current += 1;
    const isFirstMount = effectRunCount.current === 1;
    setConnectionStatus("connecting");
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    const channel = supabase
      .channel(`group_${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        (payload) => {
          eventHandlerRef.current(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        (payload) => {
          eventHandlerRef.current(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        (payload) => {
          eventHandlerRef.current(payload);
        }
      );
    channel.on("error", (err) => {
      // No-op in production
    });
    channel.on("close", () => {
      // No-op in production
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionStatus("connected");
      } else if (
        status === "TIMED_OUT" ||
        status === "CLOSED" ||
        status === "CHANNEL_ERROR"
      ) {
        setConnectionStatus("disconnected");
      } else {
        setConnectionStatus("connecting");
      }
    });
    channelRef.current = channel;
    intervalRef.current = setInterval(() => {
      const socket = supabase?.realtime?.socket;
      if (socket && socket.readyState !== 1) {
        setConnectionStatus("disconnected");
      }
    }, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [groupId, reconnectKey]);

  useEffect(() => {
    if (lastStatusRef.current !== connectionStatus) {
      lastStatusRef.current = connectionStatus;
    }
  }, [connectionStatus, groupId]);

  const reconnect = useCallback(() => {
    setReconnectKey((k) => k + 1);
    setConnectionStatus("connecting");
  }, []);

  return { connectionStatus, reconnect };
}
