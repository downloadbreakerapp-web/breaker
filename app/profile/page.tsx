"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetUser, safeSignOut } from "@/lib/safeAuth";

type MyProfileRow = {
  id: string;
  username: string | null;
  role: string | null;
  sales_count: number | null;
  buy_count: number | null;
  reputation_rating: number | null;
  reputation_count: number | null;
};

export default function ProfilePage() {
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfileRow | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // prevents overlapping loads (common on refresh + auth change)
  const loadingRef = useRef(false);

  const dump = (label: string, e: any) => {
    if (!e) return;
    console.error(label, e);
    console.error(label + " message:", e.message);
    console.error(label + " details:", e.details);
    console.error(label + " hint:", e.hint);
    console.error(label + " code:", e.code);
  };

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      const { data: authData, error: authErr } = await safeGetUser();
      dump("PROFILE getUser", authErr);

      const uid = authData?.user?.id ?? null;
      setMe(uid);

      if (authErr || !uid) {
        setProfile(null);
        setUsername("");
        return;
      }

      // ✅ SAFE: read from view (NOT base table)
      const res = await supabase
        .from("my_profile")
        .select(
          "id, username, role, sales_count, buy_count, reputation_rating, reputation_count"
        )
        .maybeSingle();

      dump("PROFILE my_profile", res.error);

      if (res.error) {
        setProfile(null);
        setUsername("");
        return;
      }

      const p = (res.data ?? null) as MyProfileRow | null;
      setProfile(p);
      setUsername(p?.username ?? "");
    } catch (e: any) {
      // This is what prevents infinite “Loading…” when something throws.
      console.error("PROFILE load crashed:", e);
      setProfile(null);
      setUsername("");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load();

    // reload profile automatically on sign-in/sign-out/token refresh
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(load, 50);
    });

    return () => sub?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!me) return;

    const u = username.trim();
    if (u.length < 3) {
      alert("Username must be at least 3 characters.");
      return;
    }

    setSaving(true);
    try {
      // ✅ SAFE: update via RPC (NOT direct upsert on base table)
      const res = await supabase.rpc("update_my_profile", { p_username: u });
      if (res.error) throw res.error;

      alert("Saved!");
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
  await safeSignOut();
  router.push("/login");
  router.refresh();
}

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 800, margin: "0 auto" }}>
      <div>
        <div className="h1">Profile</div>
        <div className="muted2">Your account + trust score.</div>
      </div>

      {loading ? (
        <div className="card">
          <div className="cardBody">
            <div className="muted">Loading…</div>
          </div>
        </div>
      ) : !me ? (
        <div className="card">
          <div className="cardBody">
            Please <Link href="/login">sign in</Link>.
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="cardHeader">
              <div className="h2">Username</div>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Pick a username"
              />
              <div style={{ textAlign: "right" }}>
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
              <div className="muted2">
                Posting/DMs/listings require verified email + username.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <div className="h2">Trust</div>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 8 }}>
              <div className="pill">Role: {profile?.role ?? "buyer"}</div>
              <div className="pill">Sales: {profile?.sales_count ?? 0}</div>
              <div className="pill">Buys: {profile?.buy_count ?? 0}</div>
              <div className="pill">
                Rating: {(profile?.reputation_rating ?? 0).toFixed(2)} (
                {profile?.reputation_count ?? 0})
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <button className="btn" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}