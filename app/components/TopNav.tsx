"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetSession, safeSignOut } from "@/lib/safeAuth";
import { useUnreadCounts } from "@/lib/useUnreadCounts";

type ProfileRow = {
  id: string;
  username: string | null;
};

function Badge({ n }: { n: number }) {
  if (!n || n <= 0) return null;
  const label = n > 99 ? "99+" : String(n);
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.06)",
        lineHeight: "16px",
      }}
    >
      {label}
    </span>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const { counts } = useUnreadCounts();

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

      const pRes = await supabase.from("profiles_public").select("id, username").eq("id", uid).maybeSingle();

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

      if (!uid) {
        setMyUsername(null);
        return;
      }

      setTimeout(load, 50);
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

  async function signOut() {
    await safeSignOut();
    setUserId(null);
    setMyUsername(null);
    router.push("/login");
    router.refresh();
  }

  const btnClass = (href: string) => `btn ${isActive(href) ? "btnPrimary" : ""}`;

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
        <Link href="/feed">
          <button className={btnClass("/feed")}>Feed</button>
        </Link>

        <Link href="/market">
          <button className={btnClass("/market")}>Market</button>
        </Link>

        <Link href="/trade">
          <button className={btnClass("/trade")}>Trade</button>
        </Link>

        <Link href="/messages">
          <button className={btnClass("/messages")} style={{ display: "inline-flex", alignItems: "center" }}>
            Messages <Badge n={counts.messages_unread} />
          </button>
        </Link>

        <Link href="/notifications">
          <button className={btnClass("/notifications")} style={{ display: "inline-flex", alignItems: "center" }}>
            Notifications <Badge n={counts.notifications_unread} />
          </button>
        </Link>

        {userId ? (
          <>
            <Link href="/my/listings">
              <button className={btnClass("/my/listings")}>My Listings</button>
            </Link>

            <Link href="/profile">
              <button className={btnClass("/profile")}>Profile</button>
            </Link>

            {myUsername ? (
              <Link href={`/u/${encodeURIComponent(myUsername)}`}>
                <button className="btn">Public</button>
              </Link>
            ) : null}

            <button className="btn" onClick={signOut} type="button">
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login">
            <button className={btnClass("/login")}>Sign in</button>
          </Link>
        )}
      </div>
    </div>
  );
}