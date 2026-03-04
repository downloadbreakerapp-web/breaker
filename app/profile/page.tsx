"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LiveBackground from "@/components/LiveBackground";
import { supabase } from "@/lib/supabaseClient";

type PrelaunchProfile = {
  user_id: string;
  card_style: "sports" | "pokemon";
  display_name: string;
  username: string | null;
  bio: string | null;

  sport: string | null;
  team: string | null;
  position: string | null;
  rookie_year: number | null;
  favorite_player: string | null;

  pokemon_favorite: string | null;
  pokemon_type: string | null;
  pokemon_trainer: string | null;
  pokemon_region: string | null;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<PrelaunchProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        window.location.href = "/";
        return;
      }
      if (!alive) return;
      setEmail(user.email ?? null);

      const res = await supabase.from("prelaunch_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (!alive) return;

      if (res.error) {
        setErr(res.error.message);
      } else {
        setProfile((res.data as any) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18, position: "relative" }}>
      <LiveBackground />

      <div style={{ position: "relative", zIndex: 1, width: "min(980px, 100%)", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/images/breaker-logo.png" alt="Breaker" style={{ width: 46, height: 46, objectFit: "contain" }} />
            <div style={{ display: "grid" }}>
              <div style={{ fontWeight: 950, fontSize: 20 }}>My Breaker Card</div>
              <div style={{ opacity: 0.85, fontWeight: 850 }}>{email ?? ""}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <button className="btn">Home</button>
            </Link>
            <button className="btn" onClick={logout}>Logout</button>
          </div>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.55)", borderRadius: 22, padding: 18, backdropFilter: "blur(12px)" }}>
          {loading ? (
            <div style={{ opacity: 0.85, fontWeight: 850 }}>Loading…</div>
          ) : err ? (
            <div style={{ border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)", borderRadius: 14, padding: 10, fontWeight: 900 }}>
              {err}
            </div>
          ) : !profile ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>No card found yet.</div>
              <div style={{ opacity: 0.85, fontWeight: 850 }}>Go back and sign up to mint your Breaker card.</div>
              <Link href="/" style={{ textDecoration: "none" }}>
                <button className="btn btnPrimary">Go to landing</button>
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>Breaker is coming soon.</div>
              <div style={{ opacity: 0.88, fontWeight: 850 }}>
                Your prelaunch card is saved. When Breaker drops, this becomes your collector identity.
              </div>

              <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 12 }}>
                {profile.card_style === "sports" ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 950, fontSize: 22 }}>{profile.display_name}</div>
                    <div style={{ opacity: 0.85, fontWeight: 850 }}>{profile.username ? `@${profile.username.replace("@", "")}` : ""}</div>
                    <div style={{ opacity: 0.9 }}>{profile.bio ?? ""}</div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div className="pill">Sport: <b>{profile.sport ?? "—"}</b></div>
                      <div className="pill">Team: <b>{profile.team ?? "—"}</b></div>
                      <div className="pill">Position: <b>{profile.position ?? "—"}</b></div>
                      <div className="pill">Rookie Year: <b>{profile.rookie_year ?? "—"}</b></div>
                      <div className="pill" style={{ gridColumn: "1 / -1" }}>Favorite Player: <b>{profile.favorite_player ?? "—"}</b></div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 950, fontSize: 22 }}>{profile.display_name}</div>
                    <div style={{ opacity: 0.85, fontWeight: 850 }}>{profile.username ? `@${profile.username.replace("@", "")}` : ""}</div>
                    <div style={{ opacity: 0.9 }}>{profile.bio ?? ""}</div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div className="pill">Favorite: <b>{profile.pokemon_favorite ?? "—"}</b></div>
                      <div className="pill">Type: <b>{profile.pokemon_type ?? "—"}</b></div>
                      <div className="pill">Trainer: <b>{profile.pokemon_trainer ?? "—"}</b></div>
                      <div className="pill">Region: <b>{profile.pokemon_region ?? "—"}</b></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .btn {
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(226, 232, 240, 0.95);
          font-weight: 950;
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
        .pill {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.03);
          font-weight: 850;
        }
      `}</style>
    </div>
  );
}