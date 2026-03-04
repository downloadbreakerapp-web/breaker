"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetSession } from "@/lib/safeAuth";

type MsgRow = {
  id: number;
  conversation_id: string;
  sender_id: string;
  sender_username: string | null;
  sender_avatar_url: string | null;
  body: string;
  created_at: string;
};

type MemberRow = {
  conversation_id: string;
  user_id: string;
  role: "member" | "admin";
  joined_at?: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
};

type ConvMeta = {
  conversation_id: string;
  is_group: boolean;
  title: string | null;
  created_at: string;
};

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const convId = String(params?.id ?? "");

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [conv, setConv] = useState<ConvMeta | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, ProfileRow>>(new Map());
  const [messages, setMessages] = useState<MsgRow[]>([]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // invite (group only)
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<ProfileRow[]>([]);
  const [inviting, setInviting] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function loadMe() {
    const { data, error } = await safeGetSession();
    const uid = data.session?.user?.id ?? null;
    const finalUid = error ? null : uid;
    setMe(finalUid);
    return finalUid;
  }

  async function markRead() {
    if (!convId) return;
    const uid = await loadMe();
    if (!uid) return;

    await supabase.rpc("mark_conversation_dm_read", {
      p_conversation_id: convId,
    });
  }

  async function loadThread() {
    setLoading(true);

    const uid = await loadMe();
    if (!uid) {
      setLoading(false);
      return;
    }

    const metaRes = await supabase
      .from("my_conversation_meta")
      .select("*")
      .eq("conversation_id", convId)
      .maybeSingle();

    if (metaRes.error) {
      alert(metaRes.error.message);
      setLoading(false);
      return;
    }
    setConv((metaRes.data ?? null) as ConvMeta | null);

    const memRes = await supabase
      .from("my_conversation_members")
      .select("conversation_id, user_id, role, joined_at")
      .eq("conversation_id", convId);

    if (memRes.error) {
      alert(memRes.error.message);
      setLoading(false);
      return;
    }

    const memRows = (memRes.data ?? []) as MemberRow[];
    setMembers(memRows);

    const userIds = Array.from(new Set(memRows.map((x) => x.user_id)));
    if (userIds.length > 0) {
      const profRes = await supabase.from("profiles_public").select("id, username").in("id", userIds);
      if (!profRes.error && profRes.data) {
        const map = new Map<string, ProfileRow>();
        for (const r of profRes.data as any[]) map.set(r.id, { id: r.id, username: r.username ?? null });
        setProfilesById(map);
      }
    }

    const msgRes = await supabase
      .from("my_conversation_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("id", { ascending: true })
      .limit(300);

    if (msgRes.error) {
      alert(msgRes.error.message);
      setLoading(false);
      return;
    }

    setMessages((msgRes.data ?? []) as MsgRow[]);
    setLoading(false);
    scrollToBottom();

    await markRead();
  }

  useEffect(() => {
    if (!convId) return;
    loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => {
    if (!convId) return;

    const channel = supabase
      .channel(`conv_${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages", filter: `conversation_id=eq.${convId}` },
        async () => {
          await loadThread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  const isAdmin = useMemo(() => {
    if (!me) return false;
    return members.some((m) => m.user_id === me && m.role === "admin");
  }, [members, me]);

  const title = useMemo(() => {
    if (!conv) return "Chat";
    if (conv.is_group) return conv.title ?? "Group chat";
    const other = members.find((m) => m.user_id !== me);
    const uname = other ? profilesById.get(other.user_id)?.username : null;
    return uname ? `@${uname}` : "Direct message";
  }, [conv, members, me, profilesById]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    const uid = await loadMe();
    if (!uid) {
      alert("Please sign in.");
      router.push("/login");
      return;
    }

    setSending(true);
    setDraft("");

    const { error } = await supabase.rpc("send_dm_message_atomic", {
      p_conversation_id: convId,
      p_body: text,
    });

    setSending(false);

    if (error) {
      alert(error.message);
      setDraft(text);
      return;
    }

    await loadThread();
  }

  async function searchInvite(q: string) {
    setInviteSearch(q);
    const s = q.trim();
    if (s.length < 2) {
      setInviteResults([]);
      return;
    }

    const res = await supabase.from("profiles_public").select("id, username").ilike("username", `%${s}%`).limit(8);
    if (res.error) return;

    const rows = (res.data ?? []) as any[];
    setInviteResults(rows.map((r) => ({ id: r.id, username: r.username ?? null })));
  }

  async function invite(userId: string) {
    if (!conv?.is_group) return;
    if (!isAdmin) return;

    setInviting(true);

    const { error } = await supabase.rpc("invite_to_group", {
      p_conversation_id: convId,
      p_user_id: userId,
    });

    setInviting(false);

    if (error) {
      alert(error.message);
      return;
    }

    setInviteSearch("");
    setInviteResults([]);
    await loadThread();
  }

  if (!convId) {
    return (
      <div className="card">
        <div className="cardBody">Missing conversation id.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 1000, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/messages">
          <button className="btn">← Inbox</button>
        </Link>

        <div style={{ fontWeight: 950, fontSize: 18 }}>{title}</div>

        <button className="btn" onClick={loadThread}>
          Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
        {/* Chat */}
        <div className="card">
          <div className="cardBody" style={{ height: 520, overflow: "auto", display: "grid", gap: 10 }}>
            {!me ? (
              <div className="muted">
                Please <Link href="/login">sign in</Link> to view messages.
              </div>
            ) : loading ? (
              <div className="muted">Loading…</div>
            ) : (
              <>
                {messages.map((m) => {
                  const mine = m.sender_id === me;
                  const uname = m.sender_username ?? profilesById.get(m.sender_id)?.username ?? "user";

                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      <div
                        style={{
                          maxWidth: "75%",
                          border: "1px solid var(--border)",
                          background: mine ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                          borderRadius: 16,
                          padding: 12,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div className="muted2" style={{ fontWeight: 900 }}>
                          @{uname}
                        </div>
                        <div>{m.body}</div>
                        <div className="muted2" style={{ textAlign: "right" }}>
                          {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>

        {/* Members / Invite */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Members</div>
          </div>
          <div className="cardBody" style={{ display: "grid", gap: 10 }}>
            {loading ? (
              <div className="muted">Loading…</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {members.map((m) => {
                  const uname = profilesById.get(m.user_id)?.username ?? "user";
                  return (
                    <div key={m.user_id} className="pill" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>@{uname}</span>
                      <span className="muted2">{m.role}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {conv?.is_group && isAdmin ? (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <div className="muted2" style={{ fontWeight: 900 }}>
                  Invite
                </div>

                <input
                  className="input"
                  placeholder="Search usernames…"
                  value={inviteSearch}
                  onChange={(e) => searchInvite(e.target.value)}
                  disabled={inviting}
                />

                {inviteResults.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {inviteResults.map((u) => (
                      <button
                        key={u.id}
                        className="btn"
                        onClick={() => invite(u.id)}
                        disabled={inviting || members.some((m) => m.user_id === u.id)}
                        style={{ textAlign: "left" }}
                      >
                        {members.some((m) => m.user_id === u.id)
                          ? `@${u.username} (already in group)`
                          : `Invite @${u.username} +`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="muted2">Type 2+ characters to search.</div>
                )}
              </div>
            ) : conv?.is_group ? (
              <div className="muted2" style={{ marginTop: 10 }}>
                Only admins can invite members.
              </div>
            ) : (
              <div className="muted2" style={{ marginTop: 10 }}>
                Direct message
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardBody" style={{ display: "grid", gap: 10 }}>
          <textarea className="input" rows={3} placeholder="Write a message…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!me || sending} />

          <div style={{ textAlign: "right" }}>
            <button className="btn btnPrimary" onClick={send} disabled={!me || sending || !draft.trim()}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}