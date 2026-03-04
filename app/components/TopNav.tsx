"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetSession, safeSignOut } from "@/lib/safeAuth";

type ProfileRow = {
  id: string;
  username: string | null;
};

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const { data, error } = await safeGetSession();
      const uid = data.session?.user?.id ?? null;

      if (!mountedRef.current) return;

      if (error || !uid) {
        setUserId(null);
        setMyUsername(null);
        return;
      }

      setUserId(uid);

      const pRes = await supabase.from("profiles").select("id, username").eq("id", uid).maybeSingle();
      if (!mountedRef.current) return;

      if (!pRes.error && pRes.data) {
        const p = pRes.data as ProfileRow;
        setMyUsername(p.username ?? null);
      } else {
        setMyUsername(null);
      }
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) setMyUsername(null);
      else setTimeout(load, 50);
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const btnClass = (href: string) => `btn ${isActive(href) ? "btnPrimary" : ""}`;

  async function signOut() {
    await safeSignOut();
    setUserId(null);
    setMyUsername(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>Breaker</div>
      </Link>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <Link href="/">
          <button className={btnClass("/")}>Home</button>
        </Link>

        {userId ? (
          <>
            <Link href="/profile">
              <button className={btnClass("/profile")}>My Profile</button>
            </Link>

            {myUsername ? (
              <Link href={`/u/${encodeURIComponent(myUsername)}`}>
                <button className={btnClass(`/u/${encodeURIComponent(myUsername)}`)}>Public</button>
              </Link>
            ) : null}

            <button className="btn" onClick={signOut} type="button">
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/login">
              <button className={btnClass("/login")}>Login</button>
            </Link>
            <Link href="/signup">
              <button className={btnClass("/signup")}>Sign up</button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}