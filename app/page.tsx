"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type BreakRow = {
  id: string;
  title: string;
  stream_url: string | null;
};

export default function HomePage() {
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setSession(data.session));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
    setSession(newSession);
  });
  return () => sub.subscription.unsubscribe();
}, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("breaks")
        .select("*")
        .order("id", { ascending: true });

      if (error) {
        console.error("LOAD BREAKS ERROR:", error);
        setLoading(false);
        return;
      }

      setBreaks((data as BreakRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <main style={{ padding: 40 }}>

    {/* Top bar */}
<section
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
    maxWidth: 900,
  }}
>
  <div style={{ fontWeight: 800, fontSize: 22 }}>Breaker</div>

  <div style={{ display: "flex", gap: 10 }}>
  {session && (
    <Link href="/host">
      <button>Host Dashboard</button>
    </Link>
  )}
</div>
</section>

      {/* Landing header */}
      <section style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: 40, marginBottom: 10 }}>Welcome to Breaker</h1>
        <p style={{ opacity: 0.8, fontSize: 16, lineHeight: 1.5 }}>
          Breaker is a live break platform where streamers run card/pack breaks and buyers claim spots
          before the stream starts. As cards get pulled, the results update live for everyone watching.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <a href="#breaks">
            <button>Browse live breaks</button>
          </a>
          <Link href="/break/test">
            <button>Open a demo break</button>
          </Link>
        </div>
      </section>

      {/* Break list */}
      <section id="breaks" style={{ marginTop: 30 }}>
        <h2>Live & Upcoming Breaks</h2>

        {loading && <p>Loading breaks…</p>}

        {!loading && breaks.length === 0 && (
          <p>No breaks yet. Create one in Supabase.</p>
        )}

        <div style={{ marginTop: 14, display: "grid", gap: 16 }}>
          {breaks.map((b) => (
            <div
              key={b.id}
              style={{
                border: "1px solid #333",
                padding: 16,
                borderRadius: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>{b.title}</h3>
              <p style={{ opacity: 0.8, marginTop: 6 }}>Break ID: {b.id}</p>

              <Link href={`/break/${b.id}`}>
                <button style={{ marginTop: 10 }}>Join Break</button>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
