"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FeedPostRow = {
  id: number;
  user_id: string;
  kind: string;
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
};

type CommentRow = {
  id: number;
  post_id: number;
  user_id: string;
  body: string;
  parent_comment_id: number | null;
  created_at: string;
};

type ProfileRow = { id: string; username: string | null };

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

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const postId = Number((params?.id as string) ?? "");

  const [me, setMe] = useState<string | null>(null);

  const [post, setPost] = useState<FeedPostRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, ProfileRow>>(new Map());

  const [loading, setLoading] = useState(true);

  const [likesCount, setLikesCount] = useState<number>(0);
  const [iLike, setILike] = useState<boolean>(false);

  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const reloadTimer = useRef<any>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 200);
  };

  async function load() {
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;
    setMe(uid);

    const pRes = await supabase
      .from("feed_posts")
      .select("id, user_id, kind, title, body, media_url, media_type, created_at")
      .eq("id", postId)
      .maybeSingle();

    if (pRes.error) {
      alert(pRes.error.message);
      setLoading(false);
      return;
    }

    const p = (pRes.data ?? null) as FeedPostRow | null;
    setPost(p);

    const cRes = await supabase
      .from("feed_post_comments")
      .select("id, post_id, user_id, body, parent_comment_id, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (cRes.error) {
      alert(cRes.error.message);
      setComments([]);
    } else {
      setComments((cRes.data ?? []) as any[]);
    }

    const lcRes = await supabase
      .from("feed_post_likes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", postId);

    setLikesCount(lcRes.count ?? 0);

    if (uid) {
      const ilRes = await supabase
        .from("feed_post_likes")
        .select("post_id, user_id")
        .eq("post_id", postId)
        .eq("user_id", uid)
        .maybeSingle();

      setILike(!!ilRes.data);
    } else {
      setILike(false);
    }

    const userIds = Array.from(
      new Set([
        ...(p?.user_id ? [p.user_id] : []),
        ...((cRes.data ?? []) as any[]).map((x: any) => x.user_id as string),
      ])
    );

    if (userIds.length) {
      const prRes = await supabase.from("profiles").select("id, username").in("id", userIds);
      if (!prRes.error && prRes.data) {
        const m = new Map<string, ProfileRow>();
        for (const r of prRes.data as any[]) m.set(r.id, { id: r.id, username: r.username ?? null });
        setProfilesById(m);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!Number.isFinite(postId)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // ✅ REALTIME: post, likes, comments (only for this post)
  useEffect(() => {
    if (!Number.isFinite(postId)) return;

    const ch = supabase
      .channel(`rt-post-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts", filter: `id=eq.${postId}` }, () => scheduleReload())
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_post_likes", filter: `post_id=eq.${postId}` }, () => scheduleReload())
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_post_comments", filter: `post_id=eq.${postId}` }, () => scheduleReload())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const topLevel = useMemo(() => comments.filter((c) => !c.parent_comment_id), [comments]);
  const repliesByParent = useMemo(() => {
    const m = new Map<number, CommentRow[]>();
    for (const c of comments) {
      if (c.parent_comment_id) {
        const arr = m.get(c.parent_comment_id) ?? [];
        arr.push(c);
        m.set(c.parent_comment_id, arr);
      }
    }
    return m;
  }, [comments]);

  function uname(uid: string) {
    return profilesById.get(uid)?.username ?? "user";
  }

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      alert("Please sign in.");
      router.push("/login");
      return null;
    }
    return data.user;
  }

  async function toggleLike() {
    const user = await requireAuth();
    if (!user) return;

    if (iLike) {
      const del = await supabase.from("feed_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
      if (del.error) return alert(del.error.message);
      setILike(false);
      setLikesCount((n) => Math.max(0, n - 1));
    } else {
      const ins = await supabase.from("feed_post_likes").insert({ post_id: postId, user_id: user.id });
      if (ins.error) return alert(ins.error.message);
      setILike(true);
      setLikesCount((n) => n + 1);
    }
  }

  async function submitComment() {
    const user = await requireAuth();
    if (!user) return;

    const b = newComment.trim();
    if (!b) return;

    const ins = await supabase.from("feed_post_comments").insert({
      post_id: postId,
      user_id: user.id,
      body: b,
      parent_comment_id: null,
    });

    if (ins.error) return alert(ins.error.message);

    setNewComment("");
    // realtime will also reload
    await load();
  }

  async function submitReply() {
    const user = await requireAuth();
    if (!user || !replyTo) return;

    const b = replyBody.trim();
    if (!b) return;

    const ins = await supabase.from("feed_post_comments").insert({
      post_id: postId,
      user_id: user.id,
      body: b,
      parent_comment_id: replyTo.id,
    });

    if (ins.error) return alert(ins.error.message);

    setReplyTo(null);
    setReplyBody("");
    await load();
  }

  async function reportPost() {
    const user = await requireAuth();
    if (!user) return;

    const reason = (prompt("Report reason (short):") ?? "").trim();
    if (!reason) return;

    const details = (prompt("Details (optional):") ?? "").trim();

    const ins = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: "post",
      post_id: postId,
      comment_id: null,
      reason,
      details: details || null,
      status: "open",
    });

    if (ins.error) return alert(ins.error.message);
    alert("Reported. Thank you.");
  }

  async function reportComment(c: CommentRow) {
    const user = await requireAuth();
    if (!user) return;

    const reason = (prompt("Report reason (short):") ?? "").trim();
    if (!reason) return;

    const details = (prompt("Details (optional):") ?? "").trim();

    const ins = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: "comment",
      post_id: postId,
      comment_id: c.id,
      reason,
      details: details || null,
      status: "open",
    });

    if (ins.error) return alert(ins.error.message);
    alert("Reported. Thank you.");
  }

  if (!Number.isFinite(postId)) {
    return (
      <div className="card">
        <div className="cardBody">Invalid post id.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/feed">
          <button className="btn">← Back</button>
        </Link>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : !post ? (
            <div className="muted">Post not found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Link href={`/u/${encodeURIComponent(uname(post.user_id))}`} style={{ textDecoration: "none", fontWeight: 900 }}>
                  @{uname(post.user_id)}
                </Link>
                <div className="muted2">{timeAgo(post.created_at)}</div>
              </div>

              <div className="muted2">{post.kind.toUpperCase()}</div>

              {post.title ? <div style={{ fontWeight: 900, fontSize: 20 }}>{post.title}</div> : null}
              {post.body ? <div className="muted2">{post.body}</div> : null}

              {post.media_url ? (
                <div>
                  <a href={post.media_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                    View clip →
                  </a>
                </div>
              ) : null}

              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className={`btn ${iLike ? "btnPrimary" : ""}`} onClick={toggleLike}>
                  {iLike ? "Liked" : "Like"} • {likesCount}
                </button>
                <button className="btn" onClick={reportPost}>Report</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div className="h2">Comments</div>
        </div>
        <div className="cardBody" style={{ display: "grid", gap: 10 }}>
          <textarea className="input" rows={3} placeholder="Write a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)} />
          <div style={{ textAlign: "right" }}>
            <button className="btn btnPrimary" onClick={submitComment}>Comment</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : topLevel.length === 0 ? (
            <div className="muted">No comments yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {topLevel.map((c) => {
                const replies = repliesByParent.get(c.id) ?? [];
                return (
                  <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 14 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Link href={`/u/${encodeURIComponent(uname(c.user_id))}`} style={{ textDecoration: "none", fontWeight: 900 }}>
                        @{uname(c.user_id)}
                      </Link>
                      <div className="muted2">{timeAgo(c.created_at)}</div>
                    </div>

                    <div className="muted2" style={{ marginTop: 6 }}>{c.body}</div>

                    <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => { setReplyTo(c); setReplyBody(""); }}>
                        Reply
                      </button>
                      <button className="btn" onClick={() => reportComment(c)}>
                        Report
                      </button>
                    </div>

                    {replies.length ? (
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {replies.map((r) => (
                          <div key={r.id} style={{ borderLeft: "3px solid var(--border)", paddingLeft: 12 }}>
                            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                              <Link href={`/u/${encodeURIComponent(uname(r.user_id))}`} style={{ textDecoration: "none", fontWeight: 900 }}>
                                @{uname(r.user_id)}
                              </Link>
                              <div className="muted2">{timeAgo(r.created_at)}</div>
                            </div>
                            <div className="muted2" style={{ marginTop: 6 }}>{r.body}</div>
                            <div className="row" style={{ gap: 10, marginTop: 8 }}>
                              <button className="btn" onClick={() => reportComment(r)}>
                                Report
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {replyTo ? (
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Reply to @{uname(replyTo.user_id)}</div>
            <button className="btn" onClick={() => setReplyTo(null)}>Close</button>
          </div>
          <div className="cardBody" style={{ display: "grid", gap: 10 }}>
            <textarea className="input" rows={3} placeholder="Write a reply..." value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
            <div style={{ textAlign: "right" }}>
              <button className="btn btnPrimary" onClick={submitReply}>Reply</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}