"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ReportRow = {
  id: number;
  reporter_id: string;
  target_type: "post" | "comment";
  post_id: number | null;
  comment_id: number | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
};

export default function AdminReportsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReportRow[]>([]);

  async function load() {
    setLoading(true);
    const res = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (res.error) {
      alert(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((res.data ?? []) as any[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: number, status: ReportRow["status"]) {
    const res = await supabase.from("reports").update({ status }).eq("id", id);
    if (res.error) return alert(res.error.message);
    await load();
  }

  async function banUser(userId: string) {
    const reason = (prompt("Ban reason (optional):") ?? "").trim();
    const res = await supabase.from("user_bans").insert({ user_id: userId, is_banned: true, reason: reason || null });
    if (res.error) return alert(res.error.message);
    alert("User banned.");
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1100, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">Admin • Reports</div>
          <div className="muted2">Only admins can see this page.</div>
        </div>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="muted">No reports.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((r) => (
                <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 900 }}>
                    #{r.id} • {r.target_type.toUpperCase()} • {r.status.toUpperCase()}
                  </div>
                  <div className="muted2" style={{ marginTop: 6 }}>
                    Reason: <b>{r.reason}</b>
                  </div>
                  {r.details ? <div className="muted2">Details: {r.details}</div> : null}

                  <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    {r.post_id ? (
                      <Link href={`/post/${r.post_id}`}>
                        <button className="btn">Open post</button>
                      </Link>
                    ) : null}

                    <button className="btn" onClick={() => setStatus(r.id, "reviewed")}>
                      Mark reviewed
                    </button>
                    <button className="btn" onClick={() => setStatus(r.id, "dismissed")}>
                      Dismiss
                    </button>
                    <button className="btn" onClick={() => banUser(r.reporter_id)}>
                      Ban reporter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="muted2">
        To make yourself admin: set your row in <b>profiles.role</b> = <b>'admin'</b> in Supabase table editor.
      </div>
    </div>
  );
}