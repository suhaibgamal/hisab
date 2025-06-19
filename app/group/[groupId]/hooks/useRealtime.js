"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../../lib/supabase";
import { toast } from "sonner";

export function useRealtime(groupId, onRealtimeEvent) {
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const lastStatusRef = useRef();

  useEffect(() => {
    if (!groupId) return;

    setConnectionStatus("connecting");

    const channel = supabase
      .channel(`group_${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        onRealtimeEvent
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        onRealtimeEvent
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        onRealtimeEvent
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("connecting");
        }
      });

    // Fallback ping to check connection state
    const interval = setInterval(() => {
      if (channel.state === "joined") {
        setConnectionStatus("connected");
      } else if (channel.state === "joining") {
        setConnectionStatus("connecting");
      } else {
        setConnectionStatus("disconnected");
      }
    }, 10000);

    const handleOnline = () => {
      toast.success("تم استعادة الاتصال. جارٍ إعادة الاتصال...");
      setConnectionStatus("connecting");
    };
    const handleOffline = () => {
      toast.error("تم فقد الاتصال بالإنترنت.");
      setConnectionStatus("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [groupId, onRealtimeEvent]);

  useEffect(() => {
    if (connectionStatus !== lastStatusRef.current) {
      if (connectionStatus === "connected")
        toast.success("تم الاتصال بالخادم.");
      if (connectionStatus === "disconnected")
        toast.error("تم فقد الاتصال بالخادم.");
      if (connectionStatus === "connecting") toast("جاري الاتصال بالخادم...");
      lastStatusRef.current = connectionStatus;
    }
  }, [connectionStatus]);

  return connectionStatus;
}
