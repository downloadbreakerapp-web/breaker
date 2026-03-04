"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetSession } from "@/lib/safeAuth";

type ProfileRow = {
  id: string;
  username: string | null;
};

type InboxRow = {
  conversation_id: string;
  is_group: boolean;
  title: string | null;
  created_at: string;
  last_message_id: number | null;
  last_message_body: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  unread_count: number;
};

export default function MessagesPage() {
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inbox, setInbox] = useState<InboxRow[]>([]);

  // start DM search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProfileRow[]>([]);

  // create group (uses your existing RPC create_group_conversation)
  const [groupTitle, setGroupTitle] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupResults, setGroupResults] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow[]>([]);
  const [creating, setCreating] = useState(false);

  async function loadMe() {
    const { data, error } = await safeGetSession();
    const uid = data.session?.user?.id ?? null;
    const finalUid = error ? null : uid;
    setMe(finalUid);
    return finalUid;
  }

  async function loadInbox() {
    setLoadingInbox(true);

    const uid = await loadMe();
    if (!uid) {
      setInbox([]);
      setLoadingInbox(false);
      return;
    }

    const { data, error } = await supabase
      .from("my_conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error(error);
      setInbox([]);
    } else {
      setInbox((data as InboxRow[]) ?? []);
    }

    setLoadingInbox(false);
  }

  useEffect(() => {
    loadInbox();

    const channel = supabase
      .channel("inbox-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "type=eq.dm_message" },
        () => loadInbox()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: "type=eq.dm_message" },
        () => loadInbox()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function titleForRow(r: InboxRow) {
    if (r.is_group) return r.title ?? "Group chat";
    return r.other_username ? `@${r.other_username}` : "Direct message";
  }

  async function searchUsers(q: string, setFn: (rows: ProfileRow[]) => void) {
    const s = q.trim();
    if (s.length < 2) {
      setFn([]);
      return;
    }

    const { data, error } = await supabase
      .from("profiles_public")
      .select("id, username")
      .ilike("username", `%${s}%`)
      .limit(10);

    if (error) return;

    setFn(((data ?? []) as any[]).map((r) => ({ id: r.id, username: r.username ?? null })));
  }

  async function startDM(otherUserId: string) {
    const uid = await loadMe();
    if (!uid) {
      alert("Please sign in.");
      router.push("/login");
      return;
    }

    const { data, error } = await supabase.rpc("get_or_create_dm", {
      p_other_user_id: otherUserId,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.push(`/messages/${data}`);
  }

  function addSelected(u: ProfileRow) {
    if (!u.id) return;
    if (selected.some((x) => x.id === u.id)) return;
    setSelected((prev) => [...prev, u]);
  }

  function removeSelected(userId: string) {
    setSelected((prev) => prev.filter((x) => x.id !== userId));
  }

  async function createGroup() {
    const title = groupTitle.trim();
    if (!title) {
      alert("Enter a group name.");
      return;
    }

    const uid = await loadMe();
    if (!uid) {
      alert("Please sign in.");
      router.push("/login");
      return;
    }

    const memberIds = selected.map((x) => x.id).filter(Boolean);

    setCreating(true);
    const { data, error } = await supabase.rpc("create_group_conversation", {
      p_title: title,
      p_member_ids: memberIds,
    });
    setCreating(false);

    if (error) {
      alert(error.message);
      return;
    }

    setGroupTitle("");
    setGroupSearch("");
    setGroupResults([]);
    setSelected([]);

    router.push(`/messages/${data}`);
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900, margin: "0 auto" }}>
      <div>
        <div className="h1">Messages</div>
        <div className="muted2">Direct messages and group chats.</div>
      </div>

      {/* Start DM */}
      <div className="card">
        <div className="cardHeader">
          <div className="h2">Start a DM</div>
        </div>
        <div className="cardBody" style={{ display: "grid", gap: 10 }}>
          <input
            className="input"
            placeholder="Search usernames… (type at least 2 chars)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              searchUsers(e.target.value, setResults);
            }}
          />

          {results.length === 0 ? (
            <div className="muted2">Search for someone to message.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {results.map((u) => (
                <button key={u.id} className="btn" onClick={() => startDM(u.id)} style={{ textAlign: "left" }}>
                  Message @{u.username ?? "user"} →
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create group */}
      <div className="card">
        <div className="cardHeader">
          <div className="h2">Create a group</div>
        </div>
        <div className="cardBody" style={{ display: "grid", gap: 10 }}>
          <input className="input" placeholder="Group name" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} />

          <input
            className="input"
            placeholder="Add members by username… (type at least 2 chars)"
            value={groupSearch}
            onChange={(e) => {
              setGroupSearch(e.target.value);
              searchUsers(e.target.value, setGroupResults);
            }}
          />

          {selected.length > 0 ? (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {selected.map((u) => (
                <div key={u.id} className="pill" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  @{u.username ?? "user"}
                  <button className="btn" style={{ padding: "4px 10px" }} onClick={() => removeSelected(u.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted2">No members selected yet (you will be included automatically).</div>
          )}

          {groupResults.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {groupResults.map((u) => (
                <button key={u.id} className="btn" onClick={() => addSelected(u)} style={{ textAlign: "left" }}>
                  Add @{u.username ?? "user"} +
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ textAlign: "right" }}>
            <button className="btn btnPrimary" onClick={createGroup} disabled={creating}>
              {creating ? "Creating..." : "Create Group"}
            </button>
          </div>
        </div>
      </div>

      {/* Inbox */}
      <div className="card">
        <div className="cardHeader">
          <div className="h2">Inbox</div>
          <button className="btn" onClick={loadInbox}>
            Refresh
          </button>
        </div>

        <div className="cardBody">
          {!me ? (
            <div className="muted">
              Please <Link href="/login">sign in</Link> to see your messages.
            </div>
          ) : loadingInbox ? (
            <div className="muted">Loading…</div>
          ) : inbox.length === 0 ? (
            <div className="muted">No conversations yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {inbox.map((r) => (
                <Link key={r.conversation_id} href={`/messages/${r.conversation_id}`} style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      padding: 14,
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 6,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{titleForRow(r)}</div>
                      {r.unread_count > 0 ? (
                        <span className="pill" style={{ padding: "3px 10px" }}>
                          {r.unread_count} new
                        </span>
                      ) : null}
                    </div>

                    <div className="muted2">
                      {r.last_message_body
                        ? `${r.last_message_body.slice(0, 120)}${r.last_message_body.length > 120 ? "…" : ""}`
                        : "No messages yet."}
                    </div>

                    <div className="muted2">{r.last_message_at ? new Date(r.last_message_at).toLocaleString() : ""}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="muted2" style={{ textAlign: "center" }}>
        Next: member list + invite inside the group.
      </div>
    </div>
  );
}