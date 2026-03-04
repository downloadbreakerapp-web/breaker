"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProfilePublicRow = {
  id: string;
  username: string | null;
  created_at: string;
  sales_count: number;
  buy_count: number;
  reputation_rating: number;
  reputation_count: number;

  follower_count: number;
  following_count: number;
  avatar_url: string | null;
  banner_url: string | null;
};

type FeedPostRow = {
  id: number;
  user_id: string;
  kind: "status" | "break" | "listing";
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
};

type PublicListingRow = {
  id: number;
  seller_user_id: string;
  buyer_user_id: string | null;
  type: "single" | "pack" | "box";
  title: string;
  description: string | null;
  price: number | null;
  condition: string | null;
  status: "active" | "sold" | "removed";
  product_id: number | null;
  sold_at: string | null;
  created_at: string;
  seller_username: string | null;
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

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const usernameParam = (params?.username as string) ?? "";
  const username = decodeURIComponent(usernameParam);

  const [me, setMe] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfilePublicRow | null>(null);
  const [posts, setPosts] = useState<FeedPostRow[]>([]);
  const [listings, setListings] = useState<PublicListingRow[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);

  const loadingRef = useRef(false);

  const isMe = useMemo(() => !!(me && profile?.id && me === profile.id), [me, profile]);

  async function loadMe() {
    const { data } = await supabase.auth.getUser();
    setMe(data.user?.id ?? null);
  }

  async function load(opts?: { silent?: boolean }) {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const silent = !!opts?.silent;
    if (!silent) setLoading(true);

    try {
      // ✅ PUBLIC SAFE PROFILE (VIEW)
      const pRes = await supabase
        .from("profiles_public")
        .select("id, username, created_at, sales_count, buy_count, reputation_rating, reputation_count, follower_count, following_count, avatar_url, banner_url")
        .eq("username", username)
        .maybeSingle();

      if (pRes.error) throw pRes.error;

      const p = (pRes.data ?? null) as ProfilePublicRow | null;
      setProfile(p);

      if (!p) {
        setPosts([]);
        setListings([]);
        setIsFollowing(false);
        return;
      }

      // posts are fine (table, RLS should allow read if you want; if not, make a feed_posts_public view too)
      const postRes = await supabase
        .from("feed_posts")
        .select("id, user_id, kind, title, body, media_url, media_type, created_at")
        .eq("user_id", p.id)
        .order("created_at", { ascending: false })
        .limit(30);

      setPosts((postRes.data ?? []) as FeedPostRow[]);

      // ✅ SAFE public listings view
      const lRes = await supabase
        .from("market_listings_public")
        .select("id, seller_user_id, buyer_user_id, type, title, description, price, condition, status, product_id, sold_at, created_at, seller_username")
        .eq("seller_user_id", p.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(24);

      setListings((lRes.data ?? []) as PublicListingRow[]);

      // follow state (private per viewer, ok)
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;

      if (uid && uid !== p.id) {
        const fRes = await supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", uid)
          .eq("following_id", p.id)
          .maybeSingle();

        setIsFollowing(!!fRes.data);
      } else {
        setIsFollowing(false);
      }
    } catch (e: any) {
      console.warn("profile load failed:", e?.message ?? e);
      if (!silent) alert(e?.message ?? "Load failed");
    } finally {
      loadingRef.current = false;
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    load();
  }, [usernameParam]);

  // ✅ realtime ONLY for real tables; polling for view-derived stuff
  useEffect(() => {
    if (!profile?.id) return;

    const refresh = () => load({ silent: true });

    const channel = supabase
      .channel(`rt-profile-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${profile.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts", filter: `user_id=eq.${profile.id}` }, refresh)
      .subscribe();

    const poll = window.setInterval(refresh, 20000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      alert("Please sign in.");
      router.push("/login");
      return null;
    }
    return data.user;
  }

  async function toggleFollow() {
    if (!profile || isMe) return;

    const user = await requireAuth();
    if (!user) return;

    if (isFollowing) {
      const del = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
      if (del.error) return alert(del.error.message);
      setIsFollowing(false);
      load({ silent: true });
      return;
    }

    const ins = await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    if (ins.error) return alert(ins.error.message);
    setIsFollowing(true);
    load({ silent: true });
  }

  if (!usernameParam) {
    return (
      <div className="card">
        <div className="cardBody">Missing username.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 950, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/feed">
          <button className="btn">← Back</button>
        </Link>
        <button className="btn" onClick={() => load()}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            height: 160,
            background: profile?.banner_url
              ? `url(${profile.banner_url}) center/cover no-repeat`
              : "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
            borderBottom: "1px solid var(--border)",
          }}
        />

        <div className="cardBody" style={{ paddingTop: 0 }}>
          {loading ? (
            <div className="muted" style={{ paddingTop: 12 }}>
              Loading…
            </div>
          ) : !profile ? (
            <div className="muted" style={{ paddingTop: 12 }}>
              User not found.
            </div>
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: -44, flexWrap: "wrap", gap: 10 }}>
                <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
                  <div
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 20,
                      border: "1px solid var(--border)",
                      background: profile.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : "rgba(255,255,255,0.04)",
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 28 }}>@{profile.username ?? "user"}</div>
                    <div className="muted2">Joined {new Date(profile.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  {isMe ? (
                    <Link href="/profile">
                      <button className="btn btnPrimary">Edit Profile</button>
                    </Link>
                  ) : (
                    <button className={`btn ${isFollowing ? "" : "btnPrimary"}`} onClick={toggleFollow}>
                      {isFollowing ? "Following" : "Follow"}
                    </button>
                  )}

                  <Link href="/messages">
                    <button className="btn">Message</button>
                  </Link>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 }}>
                <div className="pill">Followers <b>{profile.follower_count ?? 0}</b></div>
                <div className="pill">Following <b>{profile.following_count ?? 0}</b></div>
                <div className="pill">⭐ {Number(profile.reputation_rating ?? 0).toFixed(2)} ({profile.reputation_count ?? 0})</div>
                <div className="pill">Sales <b>{profile.sales_count ?? 0}</b></div>
                <div className="pill">Buys <b>{profile.buy_count ?? 0}</b></div>
              </div>
            </>
          )}
        </div>
      </div>

      {profile ? (
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Active listings</div>
          </div>
          <div className="cardBody">
            {listings.length === 0 ? (
              <div className="muted">No active listings.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                {listings.map((l) => (
                  <Link key={l.id} href={`/trade/${l.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        padding: 14,
                        background: "rgba(255,255,255,0.04)",
                        display: "grid",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{l.title}</div>
                      <div className="muted2">
                        <span className="pill">{l.type.toUpperCase()}</span>
                        {l.condition ? ` • ${l.condition}` : ""}
                      </div>
                      <div className="pill">{l.price == null ? "—" : `$${fmtMoney(Number(l.price))}`}</div>
                      <div className="muted2">View listing →</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {profile ? (
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Posts</div>
          </div>
          <div className="cardBody">
            {posts.length === 0 ? (
              <div className="muted">No posts yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {posts.map((p) => (
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
                      <div className="muted2">{p.kind.toUpperCase()}</div>
                      <div className="muted2">{timeAgo(p.created_at)}</div>
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
                        <button className="btn">Open thread →</button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}