"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LiveBackground from "@/components/LiveBackground";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setEmail(data.user?.email ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18, position: "relative" }}>
      <LiveBackground />

      {/* content must be above background */}
      <div style={{ position: "relative", zIndex: 1, width: "min(920px, 100%)" }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.50)",
            borderRadius: 22,
            padding: 24,
            boxShadow: "0 20px 90px rgba(0,0,0,0.60)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: 10 }}>
            <img
              src="/images/breaker-logo.png"
              alt="Breaker"
              style={{
                width: 112,
                height: 112,
                objectFit: "contain",
                filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.8))",
              }}
            />

            <div style={{ fontSize: 46, fontWeight: 950, letterSpacing: -1 }}>BREAKER</div>

            <div style={{ maxWidth: 680, lineHeight: 1.6, fontSize: 16, opacity: 0.92 }}>
              Breaker is a live pack-break platform built for collectors.
              <br />
              Buy into breaks, rip packs, and track your pulls — all in one place.
              <br />
              Prelaunch is live. Claim your Breaker card before the public drop.
            </div>

            <div style={{ height: 10 }} />

            {loading ? (
              <div style={{ opacity: 0.8 }}>Loading…</div>
            ) : email ? (
              <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    fontWeight: 800,
                  }}
                >
                  Signed in as {email}
                </div>

                <Link href="/profile" style={{ textDecoration: "none" }}>
                  <button className="btn btnPrimary">Open my Breaker card</button>
                </Link>

                <div style={{ opacity: 0.75, fontWeight: 800 }}>Breaker is coming soon.</div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <Link href="/login" style={{ textDecoration: "none" }}>
                  <button className="btn">Login</button>
                </Link>
                <Link href="/signup" style={{ textDecoration: "none" }}>
                  <button className="btn btnPrimary">Sign up</button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        :root {
          --border: rgba(255, 255, 255, 0.1);
        }
        body {
          background: black;
          color: rgba(226, 232, 240, 0.95);
        }
        .btn {
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(226, 232, 240, 0.95);
          font-weight: 900;
          cursor: pointer;
        }
        .btn:hover {
          background: rgba(255, 255, 255, 0.07);
        }
        .btnPrimary {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.18);
        }
        .btnPrimary:hover {
          background: rgba(255, 255, 255, 0.16);
        }
      `}</style>
    </div>
  );
}