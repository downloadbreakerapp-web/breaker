"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { safeGetSession } from "@/lib/safeAuth";

export type UnreadCounts = {
  notifications_unread: number;
  messages_unread: number;
};

const ZERO: UnreadCounts = { notifications_unread: 0, messages_unread: 0 };

export function useUnreadCounts() {
  const [counts, setCounts] = useState<UnreadCounts>(ZERO);
  const [signedIn, setSignedIn] = useState(false);

  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const { data, error } = await safeGetSession();
      const uid = data.session?.user?.id ?? null;

      setSignedIn(Boolean(uid));

      if (error || !uid) {
        setCounts(ZERO);
        return;
      }

      const { data: row, error: qErr } = await supabase.from("my_unread_counts").select("*").maybeSingle();
      if (qErr) {
        console.error(qErr);
        return;
      }

      setCounts({
        notifications_unread: (row as any)?.notifications_unread ?? 0,
        messages_unread: (row as any)?.messages_unread ?? 0,
      });
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("unread-badges")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, () => load())
      .subscribe();

    const t = window.setInterval(() => load(), 25000);

    return () => {
      window.clearInterval(t);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { counts, signedIn, refreshUnread: load };
}