"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type BreakRow = {
  id: string;
  title: string;
  stream_url: string | null;
  status: string | null;
  host_user_id: string | null;
  created_at: string;
};

export default function LivePage() {
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  async function hydrateUsernames(userIds: string[]) {
    const missing = userIds.filter((id) => id && !usernames[id]);
    if (missing.length === 0) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", missing);

    if (error) {
      console.error("PROFILES LOAD ERROR:", error);
      return;
    }

    setUsernames((prev) => {
      const next = { ...prev };
      (data ?? []).forEach((p: any) => {
        next[p.id] = p.username ?? p.id.slice(0, 6);
      });
      return next;
    });
  }

  async function loadBreaks() {
    setLoading(true);

    const { data, error } = await supabase
      .from("breaks")
      .select("id, title, stream_url, status, host_user_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      // This will show the real message instead of {}
      console.error("BREAK LOAD ERROR:", error);
      alert(error.message);
      setLoading(false);
      return;
    }

    const rows = (data as BreakRow[]) ?? [];
    setBreaks(rows);

    // load usernames for hosts
    const hostIds = rows.map((b) => b.host_user_id).filter(Boolean) as string[];
    hydrateUsernames(hostIds);

    setLoading(false);
  }

  useEffect(() => {
    loadBreaks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="h1">Live Breaks</div>
        <div className="muted2">Join breaks happening right now.</div>
      </div>

      {loading ? (
        <div className="card">
          <div className="cardBody">Loading breaks…</div>
        </div>
      ) : breaks.length === 0 ? (
        <div className="card">
          <div className="cardBody">
            <div className="muted">No breaks yet.</div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {breaks.map((b) => {
            const isLive = (b.status ?? "").toLowerCase() === "live";
            const hostName = b.host_user_id
              ? usernames[b.host_user_id] ?? b.host_user_id.slice(0, 6)
              : "unknown";

            return (
              <div key={b.id} className="card">
                <div className="cardHeader">
                  <div className="h2">{b.title}</div>
                  <div className="muted2" style={{ marginTop: 6 }}>
                    Hosted by @{hostName}
                  </div>

                  {isLive && (
                    <div
                      style={{
                        marginTop: 10,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderRadius: 999,
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.5)",
                        color: "var(--red)",
                        fontWeight: 700,
                        fontSize: 12,
                        width: "fit-content",
                      }}
                    >
                      ● LIVE
                    </div>
                  )}
                </div>

                <div className="cardBody">
                  <Link href={`/break/${b.id}`}>
                    <button className="btn btnPrimary" style={{ width: "100%" }}>
                      Join Break
                    </button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}