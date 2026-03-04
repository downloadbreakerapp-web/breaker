"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import LiveBackground from "@/components/LiveBackground";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/profile");
    } catch (e: any) {
      setErr(e?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18, position: "relative" }}>
      <LiveBackground />

      <div style={{ position: "relative", zIndex: 1, width: "min(520px, 100%)" }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.55)", borderRadius: 22, padding: 22, backdropFilter: "blur(12px)" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/images/breaker-logo.png" alt="Breaker" style={{ width: 46, height: 46, objectFit: "contain" }} />
              <div style={{ fontSize: 24, fontWeight: 950 }}>Login</div>
            </div>

            <form onSubmit={onLogin} style={{ display: "grid", gap: 10, marginTop: 8 }}>
              <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

              {err ? (
                <div style={{ border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)", borderRadius: 14, padding: 10, fontWeight: 800 }}>
                  {err}
                </div>
              ) : null}

              <button className="btn btnPrimary" disabled={loading} type="submit">
                {loading ? "Logging in…" : "Login"}
              </button>

              <div style={{ opacity: 0.85, fontWeight: 800 }}>
                No account?{" "}
                <Link href="/signup" style={{ textDecoration: "underline", color: "rgba(226,232,240,0.95)" }}>
                  Sign up
                </Link>
              </div>

              <Link href="/" style={{ textDecoration: "none" }}>
                <button className="btn" type="button">Back</button>
              </Link>
            </form>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .input {
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(226, 232, 240, 0.95);
          outline: none;
          font-weight: 800;
        }
        .input::placeholder {
          color: rgba(226, 232, 240, 0.55);
        }
        .btn {
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
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
        .btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}