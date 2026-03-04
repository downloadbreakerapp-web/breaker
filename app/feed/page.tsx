"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FeedPostKind = "status" | "break" | "listing";

type FeedPostRow = {
  id: number;
  user_id: string;
  kind: FeedPostKind;
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  sales_count: number;
  reputation_rating: number;
  reputation_count: number;
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

function friendlyError(msg: string) {
  const m = (msg || "").toLowerCase();
  if (m.includes("rate_limited")) return "Slow down — you’re doing that too fast. Try again in a minute.";
  if (m.includes("row-level security")) return "Action blocked by security rules.";
  if (m.includes("not_authenticated")) return "Please sign in.";
  return msg || "Something went wrong.";
}

export default function FeedPage() {
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<"foryou" | "following">("foryou");

  const [rows, setRows] = useState<FeedPostRow[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading] = useState(true);

  // create post
  const [kind, setKind] = useState<FeedPostKind>("status");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);

  // prevent overlapping loads (realtime can spam)
  const loadingRef = useRef(false);

  // realtime debounce
  const reloadTimer = useRef<any>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load({ silent: true }), 250);
  };

  function dump(label: string, e: any) {
    if (!e) return;
    console.error(label, e);
    console.error(label + " message:", e.message);
    console.error(label + " details:", e.details);
    console.error(label + " hint:", e.hint);
    console.error(label + " code:", e.code);
  }

  async function loadMe() {
    try {
      const { data } = await supabase.auth.getUser();
      setMe(data.user?.id ?? null);
    } catch {
      setMe(null);
    }
  }

  useEffect(() => {
    loadMe();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(loadMe, 50);
      // also refresh feed after auth changes
      setTimeout(() => load({ silent: true }), 100);
    });
    return () => sub?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(opts?: { silent?: boolean }) {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const silent = !!opts?.silent;
    if (!silent) setLoading(true);

    try {
      let allowedUserIds: string[] | null = null;

      if (tab === "following") {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? null;

        if (!uid) {
          setRows([]);
          setProfilesById(new Map());
          return;
        }

        const fRes = await supabase.from("follows").select("following_id").eq("follower_id", uid);
        if (fRes.error) {
          dump("FEED follows error", fRes.error);
          setRows([]);
          setProfilesById(new Map());
          return;
        }

        const followingIds = (fRes.data ?? []).map((r: any) => r.following_id as string);
        allowedUserIds = Array.from(new Set([uid, ...followingIds]));
        if (allowedUserIds.length === 0) {
          setRows([]);
          setProfilesById(new Map());
          return;
        }
      }

      let q = supabase
        .from("feed_posts")
        .select("id, user_id, kind, title, body, media_url, media_type, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (allowedUserIds) q = q.in("user_id", allowedUserIds);

      const res = await q;

      if (res.error) {
        dump("FEED posts error", res.error);
        setRows([]);
        setProfilesById(new Map());
        return;
      }

      const posts = (res.data ?? []) as FeedPostRow[];
      setRows(posts);

      // load profiles for usernames + trust (best-effort)
      const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
      if (userIds.length) {
        const pRes = await supabase
          .from("profiles")
          .select("id, username, sales_count, reputation_rating, reputation_count")
          .in("id", userIds);

        if (!pRes.error && pRes.data) {
          const m = new Map<string, ProfileRow>();
          for (const r of pRes.data as any[]) {
            m.set(r.id, {
              id: r.id,
              username: r.username ?? null,
              sales_count: r.sales_count ?? 0,
              reputation_rating: Number(r.reputation_rating ?? 0),
              reputation_count: r.reputation_count ?? 0,
            });
          }
          setProfilesById(m);
        } else {
          // do NOT fail the feed if profiles are blocked
          if (pRes.error) dump("FEED profiles error", pRes.error);
          setProfilesById(new Map());
        }
      } else {
        setProfilesById(new Map());
      }
    } catch (e: any) {
      console.error("FEED load crashed:", e);
      // don’t lock the UI
      if (!silent) alert(friendlyError(e?.message));
      setRows([]);
      setProfilesById(new Map());
    } finally {
      loadingRef.current = false;
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ✅ REALTIME: Feed posts + follows impact the UI
  useEffect(() => {
    // Posts changes
    const postsCh = supabase
      .channel(`rt-feed-posts-${tab}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, scheduleReload)
      .subscribe();

    // Follows changes matter only for Following tab
    const followsCh =
      tab === "following" && me
        ? supabase
            .channel(`rt-feed-follows-${me}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${me}` },
              scheduleReload
            )
            .subscribe()
        : null;

    return () => {
      supabase.removeChannel(postsCh);
      if (followsCh) supabase.removeChannel(followsCh);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me]);

  async function uploadClip(uid: string, f: File) {
    if (f.size > 25 * 1024 * 1024) throw new Error("Clip too large (max 25MB).");
    const okTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (!okTypes.includes(f.type)) throw new Error("Unsupported file type. Use mp4, mov, or webm.");

    const ext = f.name.split(".").pop() || "mp4";
    const path = `${uid}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

    const up = await supabase.storage.from("clips").upload(path, f, {
      upsert: false,
      contentType: f.type,
    });
    if (up.error) throw new Error(up.error.message);

    const pub = supabase.storage.from("clips").getPublicUrl(path);
    return pub.data.publicUrl;
  }

  async function createPost() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;

    if (!uid) {
      alert("Please sign in.");
      router.push("/login");
      router.refresh();
      return;
    }

    setPosting(true);

    try {
      let media_url: string | null = null;
      let media_type: string | null = null;

      if (file) {
        media_url = await uploadClip(uid, file);
        media_type = file.type;
      }

      const ins = await supabase.from("feed_posts").insert({
        user_id: uid,
        kind,
        title: title.trim() || null,
        body: body.trim() || null,
        media_url,
        media_type,
      });

      if (ins.error) throw new Error(ins.error.message);

      setKind("status");
      setTitle("");
      setBody("");
      setFile(null);

      await load();
    } catch (e: any) {
      alert(friendlyError(e?.message ?? "Error"));
    } finally {
      setPosting(false);
    }
  }

  const canUseFollowing = useMemo(() => !!me, [me]);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">Feed</div>
          <div className="muted2">Clips, hits, recaps, and discussions.</div>
        </div>
        <button className="btn" type="button" onClick={() => load()}>
          Refresh
        </button>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <button
          className={`btn ${tab === "foryou" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => setTab("foryou")}
        >
          For You
        </button>

        <button
          className={`btn ${tab === "following" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => {
            if (!canUseFollowing) {
              alert("Sign in to view Following.");
              router.push("/login");
              router.refresh();
              return;
            }
            setTab("following");
          }}
        >
          Following
        </button>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div className="h2">Create</div>
        </div>
        <div className="cardBody" style={{ display: "grid", gap: 10 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className={`btn ${kind === "status" ? "btnPrimary" : ""}`} type="button" onClick={() => setKind("status")}>
              Post
            </button>
            <button className={`btn ${kind === "break" ? "btnPrimary" : ""}`} type="button" onClick={() => setKind("break")}>
              Break
            </button>
            <button className={`btn ${kind === "listing" ? "btnPrimary" : ""}`} type="button" onClick={() => setKind("listing")}>
              Listing
            </button>
          </div>

          <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input" rows={3} placeholder="Write something..." value={body} onChange={(e) => setBody(e.target.value)} />

          <input
            className="input"
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div style={{ textAlign: "right" }}>
            <button className="btn btnPrimary" type="button" onClick={createPost} disabled={posting}>
              {posting ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div className="h2">{tab === "foryou" ? "Latest" : "Following"}</div>
        </div>
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="muted">{tab === "following" ? "No posts from people you follow yet." : "No posts yet."}</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {rows.map((p) => {
                const prof = profilesById.get(p.user_id);
                const uname = prof?.username ?? "user";

                return (
                  <div
                    key={p.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      padding: 14,
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Link href={`/u/${encodeURIComponent(uname)}`} style={{ textDecoration: "none", fontWeight: 900 }}>
                        @{uname}
                      </Link>
                      <div className="muted2">{timeAgo(p.created_at)}</div>
                    </div>

                    <div className="muted2">
                      {p.kind.toUpperCase()}
                      {prof ? (
                        <>
                          {" "}
                          • ⭐ {prof.reputation_rating.toFixed(2)} ({prof.reputation_count}) • Sales {prof.sales_count}
                        </>
                      ) : null}
                    </div>

                    {p.title ? <div style={{ fontWeight: 900 }}>{p.title}</div> : null}
                    {p.body ? <div className="muted2">{p.body}</div> : null}

                    {p.media_url ? (
                      <div>
                        <a href={p.media_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          View clip →
                        </a>
                      </div>
                    ) : null}

                    <div>
                      <Link href={`/post/${p.id}`}>
                        <button className="btn" type="button">
                          Open thread →
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}