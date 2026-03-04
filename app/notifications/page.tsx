"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetSession } from "@/lib/safeAuth";

type NotifType = "follow" | "like_post" | "comment_post" | "reply_comment" | "dm_message";

type NotifRow = {
  id: number;
  type: NotifType;
  post_id: number | null;
  comment_id: number | null;
  conversation_id: string | null;
  message_id: number | null;
  metadata: any;
  read_at: string | null;
  created_at: string;

  actor_id: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationsPage() {
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadTimer = useRef<any>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load({ silent: true }), 500);
  };

  async function loadMe() {
    const { data, error } = await safeGetSession();
    const uid = data.session?.user?.id ?? null;
    const finalUid = error ? null : uid;
    setMe(finalUid);
    return finalUid;
  }

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);

    const uid = await loadMe();
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    const res = await supabase
      .from("my_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (res.error) {
      console.warn("notifications load:", res.error);
      setRows([]);
      if (!opts?.silent) setLoading(false);
      return;
    }

    setRows((res.data ?? []) as NotifRow[]);
    if (!opts?.silent) setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me) return;

    const ch = supabase
      .channel(`rt-notifs-${me}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${me}` },
        () => scheduleReload()
      )
      .subscribe();

    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const unreadCount = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  async function markAllRead() {
    const uid = await loadMe();
    if (!uid) return;

    const { error } = await supabase.rpc("mark_all_my_notifications_read");
    if (error) return alert(error.message);

    await load();
  }

  async function markOneRead(id: number) {
    const uid = await loadMe();
    if (!uid) return;

    await supabase.rpc("mark_my_notification_read", {
      p_notification_id: id,
    });
  }

  function label(n: NotifRow) {
    const actorName = n.actor_username ?? "user";
    if (n.type === "follow") return `@${actorName} followed you`;
    if (n.type === "like_post") return `@${actorName} liked your post`;
    if (n.type === "comment_post") return `@${actorName} commented on your post`;
    if (n.type === "reply_comment") return `@${actorName} replied to your comment`;
    if (n.type === "dm_message") return `@${actorName} sent you a message`;
    return "Notification";
  }

  async function go(n: NotifRow) {
    await markOneRead(n.id);

    if (n.type === "dm_message" && n.conversation_id) {
      router.push(`/messages/${n.conversation_id}`);
      return;
    }
    if ((n.type === "like_post" || n.type === "comment_post" || n.type === "reply_comment") && n.post_id) {
      router.push(`/post/${n.post_id}`);
      return;
    }
    if (n.type === "follow") {
      router.push("/feed");
      return;
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">Notifications</div>
          <div className="muted2">{unreadCount ? `${unreadCount} unread` : "All caught up"}</div>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => load()}>
            Refresh
          </button>
          <button className="btn btnPrimary" onClick={markAllRead} disabled={!unreadCount}>
            Mark all read
          </button>
        </div>
      </div>

      {!me ? (
        <div className="card">
          <div className="cardBody">
            Please <Link href="/login">sign in</Link>.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="cardBody">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="muted">No notifications yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {rows.map((n) => {
                  const actorName = n.actor_username ?? "user";
                  return (
                    <div
                      key={n.id}
                      onClick={() => go(n)}
                      style={{
                        cursor: "pointer",
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        padding: 14,
                        background: n.read_at ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{label(n)}</div>
                      <div className="muted2">
                        {timeAgo(n.created_at)} •{" "}
                        {n.actor_id && n.actor_username ? (
                          <Link href={`/u/${encodeURIComponent(actorName)}`} onClick={(e) => e.stopPropagation()}>
                            @{actorName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="muted2">Click to open →</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}