"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type BreakRow = {
  id: string;
  title: string;
  stream_url: string | null;
  host_user_id: string;
  created_at?: string;
  status?: string | null;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function HostDashboard() {
  const [session, setSession] = useState<any>(null);
  const userId = session?.user?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [myBreaks, setMyBreaks] = useState<BreakRow[]>([]);

  const [title, setTitle] = useState("");
  const [breakId, setBreakId] = useState("");
  const [streamUrl, setStreamUrl] = useState(
    "https://www.youtube.com/embed/0e0pcCakZvg"
  );
  const [creating, setCreating] = useState(false);

  // Get auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Auto-generate slug
  useEffect(() => {
    if (!breakId) {
      const s = slugify(title);
      if (s) setBreakId(s);
    }
  }, [title]);

  async function loadMyBreaks(uid: string) {
    setLoading(true);

    const { data, error } = await supabase
      .from("breaks")
      .select("*")
      .eq("host_user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("LOAD MY BREAKS ERROR:", error);
      setMyBreaks([]);
      setLoading(false);
      return;
    }

    setMyBreaks((data as BreakRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setMyBreaks([]);
      setLoading(false);
      return;
    }
    loadMyBreaks(userId);
  }, [userId]);

  async function createBreak() {
    if (!userId) return alert("Sign in first.");

    const id = slugify(breakId || title);

    if (!id) return alert("Enter a break title (or ID)");
    if (!title.trim()) return alert("Enter a break title");

    setCreating(true);

    const res = await supabase.from("breaks").insert([
  {
    id,
    title: title.trim(),
    stream_url: streamUrl.trim(),
    host_user_id: userId,
    status: "scheduled",
  },
]);

setCreating(false);

if (res.error) {
  console.error("CREATE BREAK ERROR FULL:", res);
  alert(res.error.message ?? "Unknown error. Check console.");
  return;
}

    setTitle("");
    setBreakId("");
    await loadMyBreaks(userId);
    alert("Break created!");
  }

  async function setBreakStatus(
    id: string,
    status: "scheduled" | "live" | "ended"
  ) {
    const { error } = await supabase
      .from("breaks")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("SET STATUS ERROR:", error);
      alert("Failed to update status.");
      return;
    }

    await loadMyBreaks(userId!);
  }

  async function seedSlots(breakId: string, count: number, price: number) {
    const rows = Array.from({ length: count }, (_, i) => ({
      break_id: breakId,
      slot_number: i + 1,
      label: `Spot ${i + 1}`,
      price,
      buyer_user_id: null,
    }));

    const { error } = await supabase.from("break_slots").insert(rows);

    if (error) {
      console.error("SEED SLOTS ERROR:", error);
      alert("Seeding failed (maybe already seeded).");
      return;
    }

    alert(`Seeded ${count} spots.`);
  }

  if (!session) {
    return (
      <div>
        <div className="h1">Host</div>
        <div className="muted2" style={{ marginTop: 6 }}>
          Sign in first (top bar), then come back here.
        </div>
        <div style={{ marginTop: 14 }}>
          <Link href="/" className="pill">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="h1">Host Dashboard</div>
        <div className="muted2" style={{ marginTop: 6 }}>
          Create and manage your breaks.
        </div>
      </div>

      {/* Create Break */}
      <div className="card">
        <div className="cardHeader">
          <div className="h2">Create a Break</div>
        </div>

        <div className="cardBody">
          <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
            <input
              className="input"
              placeholder="Break title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <input
              className="input"
              placeholder="Break ID (URL slug)"
              value={breakId}
              onChange={(e) => setBreakId(e.target.value)}
            />

            <input
              className="input"
              placeholder="Stream embed URL"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
            />

            <div className="row" style={{ gap: 10 }}>
              <button
                className="btn btnPrimary"
                onClick={createBreak}
                disabled={creating}
              >
                {creating ? "Creating…" : "Create Break"}
              </button>

              <button
                className="btn"
                onClick={() => loadMyBreaks(userId!)}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }} />

      {/* My Breaks */}
      <div className="card">
        <div className="cardHeader">
          <div className="h2">My Breaks</div>
        </div>

        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : myBreaks.length === 0 ? (
            <div className="muted">No breaks yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {myBreaks.map((b) => (
                <div
                  key={b.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{b.title}</div>
                      <div className="muted2" style={{ marginTop: 4 }}>
                        ID: {b.id}
                      </div>
                    </div>

                    <Link href={`/break/${b.id}`}>
                      <button className="btn btnPrimary">Open</button>
                    </Link>
                  </div>

                  <div
                    className="row"
                    style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}
                  >
                    <div className="pill">
                      Status: {(b.status ?? "scheduled").toUpperCase()}
                    </div>

                    <button
                      className="btn"
                      onClick={() => setBreakStatus(b.id, "scheduled")}
                    >
                      Schedule
                    </button>

                    <button
                      className="btn btnPrimary"
                      onClick={() => setBreakStatus(b.id, "live")}
                    >
                      Go Live
                    </button>

                    <button
                      className="btn"
                      onClick={() => setBreakStatus(b.id, "ended")}
                    >
                      End
                    </button>

                    <button
                      className="btn"
                      onClick={() => seedSlots(b.id, 20, 20)}
                    >
                      Seed 20 Spots ($20)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}