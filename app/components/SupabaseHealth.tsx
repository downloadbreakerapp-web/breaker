"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, getSupabaseEnvStatus } from "@/lib/supabaseClient";

type State =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; title: string; details?: string };

export default function SupabaseHealth() {
  const env = useMemo(() => getSupabaseEnvStatus(), []);
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    (async () => {
      if (!env.ok) {
        setState({
          status: "error",
          title: "Missing Supabase env vars",
          details: env.missing.join(", "),
        });
        return;
      }

      try {
        const { error } = await supabase.from("market_products").select("id").limit(1);
        if (error) {
          setState({ status: "error", title: "Supabase query error", details: error.message });
          return;
        }
        setState({ status: "ok" });
      } catch (e: any) {
        setState({ status: "error", title: "Supabase threw", details: String(e?.message || e) });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "ok") return null;

  return (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999, padding: 12, borderRadius: 16, background: "rgba(20,24,35,.92)", color: "white" }}>
      <b>{state.status === "checking" ? "Checking Supabase…" : state.title}</b>
      {state.status === "error" && <div style={{ marginTop: 6, opacity: 0.85 }}>{state.details}</div>}
    </div>
  );
}