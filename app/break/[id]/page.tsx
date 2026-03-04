"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import { supabase } from "@/lib/supabaseClient";

type CardRow = {
  id: number;
  break_id: string;
  name: string;
  price: number;
  created_at: string;
};

type BreakRow = {
  id: string;
  title: string;
  stream_url: string;
  host_user_id?: string | null;
};

type BreakSlotRow = {
  id: number;
  break_id: string;
  slot_number: number;
  label: string | null;
  price: number; // numeric comes back as number in supabase-js usually; sometimes string depending on config
  buyer_user_id: string | null;
  created_at: string;
};

type MessageRow = {
  id: number;
  break_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export default function BreakRoom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: breakId } = use(params);

  // ---------------------------
  // Auth
  // ---------------------------
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) =>
      setSession(newSession)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signInWithPassword() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ---------------------------
  // Break info
  // ---------------------------
  const [breakInfo, setBreakInfo] = useState<BreakRow | null>(null);
  const [breakLoading, setBreakLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setBreakLoading(true);

      const { data, error } = await supabase
        .from("breaks")
        .select("*")
        .eq("id", breakId)
        .single();

      if (error) {
        console.error("BREAK LOAD ERROR:", error);
        setBreakInfo(null);
        setBreakLoading(false);
        return;
      }

      setBreakInfo(data as BreakRow);
      setBreakLoading(false);
    })();
  }, [breakId]);

  const isHost =
    !!session?.user?.id &&
    !!breakInfo?.host_user_id &&
    session.user.id === breakInfo.host_user_id;

  // ---------------------------
  // Cards (pulled)
  // ---------------------------
  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);

  async function loadCards() {
    setCardsLoading(true);

    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("break_id", breakId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("CARDS LOAD ERROR:", error);
      setCards([]);
      setCardsLoading(false);
      return;
    }

    setCards((data as CardRow[]) ?? []);
    setCardsLoading(false);
  }

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakId]);

  useEffect(() => {
    const channel = supabase
      .channel(`cards:${breakId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cards",
          filter: `break_id=eq.${breakId}`,
        },
        (payload) => {
          const newCard = payload.new as CardRow;
          setCards((prev) => {
            if (prev.some((c) => c.id === newCard.id)) return prev;
            return [newCard, ...prev];
          });
        }
      )
      .subscribe((status) => console.log("Cards realtime:", status));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [breakId]);

  const [cardName, setCardName] = useState("");
  const [cardPrice, setCardPrice] = useState("");

  async function addCard() {
    if (!session?.user?.id) return alert("Sign in first");
    if (!isHost) return alert("Only the host can add cards.");

    const name = cardName.trim();
    const price = Number(cardPrice);

    if (!name) return alert("Enter a card name");
    if (!Number.isFinite(price) || price < 0) return alert("Enter a valid price");

    const { error } = await supabase.from("cards").insert([
      {
        break_id: breakId,
        name,
        price,
      },
    ]);

    if (error) {
      console.error("INSERT ERROR:", error);
      alert("Insert error — check Console (F12)");
      return;
    }

    setCardName("");
    setCardPrice("");

    // Optional safety refresh (helps if realtime is blocked for some reason)
    setTimeout(() => {
      loadCards();
    }, 1000);
  }

  // ---------------------------
  // Break slots (purchasable spots)
  // ---------------------------
  const [slots, setSlots] = useState<BreakSlotRow[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  async function loadSlots() {
    setSlotsLoading(true);

    const { data, error } = await supabase
      .from("break_slots")
      .select("*")
      .eq("break_id", breakId)
      .order("slot_number", { ascending: true });

    if (error) {
      console.error("SLOTS LOAD ERROR:", error);
      setSlots([]);
      setSlotsLoading(false);
      return;
    }

    setSlots((data as BreakSlotRow[]) ?? []);
    setSlotsLoading(false);
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakId]);

  // Realtime for purchases (UPDATE when buyer_user_id changes)
  useEffect(() => {
    const channel = supabase
      .channel(`break_slots:${breakId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "break_slots",
          filter: `break_id=eq.${breakId}`,
        },
        (payload) => {
          const updated = payload.new as BreakSlotRow;

          setSlots((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          );
        }
      )
      .subscribe((status) => console.log("Slots realtime:", status));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [breakId]);

  async function buySlot(slotNumber: number) {
    if (!session?.user?.id) {
      alert("Sign in to buy a spot.");
      return;
    }

    // Atomic-ish claim: only succeeds if buyer_user_id is still null
    const { data, error } = await supabase
      .from("break_slots")
      .update({ buyer_user_id: session.user.id })
      .eq("break_id", breakId)
      .eq("slot_number", slotNumber)
      .is("buyer_user_id", null)
      .select("*");

    if (error) {
      console.error("BUY SLOT ERROR:", error);
      alert("Buy failed — check Console (F12). If you see 403, it’s RLS.");
      return;
    }

    if (!data || data.length === 0) {
      alert("That slot was already claimed.");
      return;
    }

    // Update UI immediately for this tab
    setSlots((prev) =>
      prev.map((s) =>
        s.slot_number === slotNumber ? { ...s, buyer_user_id: session.user.id } : s
      )
    );

    // Optional refresh in case of formatting differences
    setTimeout(() => {
      loadSlots();
    }, 800);
  }

// ---------------------------
// Chat (messages)
// ---------------------------
const [messages, setMessages] = useState<MessageRow[]>([]);
const [messagesLoading, setMessagesLoading] = useState(true);
const [chatText, setChatText] = useState("");
const [usernames, setUsernames] = useState<Record<string, string>>({});

async function loadMessages() {
  setMessagesLoading(true);

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("break_id", breakId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("MESSAGES LOAD ERROR:", error);
    setMessages([]);
    setMessagesLoading(false);
    return;
  }

  setMessages((data as MessageRow[]) ?? []);
  hydrateUsernames(((data as MessageRow[]) ?? []).map((m) => m.user_id));
  setMessagesLoading(false);
}

useEffect(() => {
  loadMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [breakId]);

useEffect(() => {
  const channel = supabase
    .channel(`messages:${breakId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `break_id=eq.${breakId}`,
      },
      (payload) => {
        const newMsg = payload.new as MessageRow;
        hydrateUsernames([newMsg.user_id]);
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    )
    .subscribe((status) => console.log("Messages realtime:", status));

  return () => {
    supabase.removeChannel(channel);
  };
}, [breakId]);

async function hydrateUsernames(userIds: string[]) {
  const missing = userIds.filter((id) => !usernames[id]);
  if (missing.length === 0) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", missing);

  if (error) {
    console.error("PROFILES LOAD ERROR:", error);
    return;
  }

  setUsernames((prev) => {
    const next = { ...prev };
    (data ?? []).forEach((p: any) => {
      next[p.id] = p.username ?? p.id.slice(0, 6);
    });
    return next;
  });
}

async function sendMessage() {
  if (!session?.user?.id) return alert("Sign in to chat.");

  const content = chatText.trim();
  if (!content) return;

  const { error } = await supabase.from("messages").insert([
    {
      break_id: breakId,
      user_id: session.user.id,
      content,
    },
  ]);

  if (error) {
    console.error("SEND MESSAGE ERROR:", error);
    alert("Message failed — check Console (F12).");
    return;
  }

  setChatText("");
}

  // ---------------------------
  // Render
  // ---------------------------
  const title = breakInfo?.title ?? `Break: ${breakId}`;
  const streamUrl =
    breakInfo?.stream_url ?? "https://www.youtube.com/embed/0e0pcCakZvg";

  return (
  <div>
    {/* Title */}
    <div style={{ marginBottom: 18 }}>
      <div className="h1">{title}</div>
      <div className="muted2" style={{ marginTop: 6 }}>
        Break ID: {breakId}
      </div>
    </div>

    {/* 2-column layout */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.25fr 0.75fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      {/* LEFT COLUMN */}
      <div style={{ display: "grid", gap: 16 }}>
        
        {/* Livestream */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Livestream</div>
          </div>
          <div className="cardBody">
            <iframe
              width="100%"
              height="460"
              src={streamUrl}
              title="Livestream"
              allow="autoplay; encrypted-media"
              allowFullScreen
              style={{ border: 0, borderRadius: 14 }}
            />
          </div>
        </div>

        {/* Host Panel */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Host Panel</div>
          </div>
          <div className="cardBody">
            {isHost ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="row" style={{ gap: 10 }}>
                  <input
                    className="input"
                    placeholder="Card name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Price"
                    value={cardPrice}
                    onChange={(e) => setCardPrice(e.target.value)}
                    style={{ width: 140 }}
                  />
                </div>
                <button className="btn btnPrimary" onClick={addCard}>
                  Add Card
                </button>
                <div className="muted2">You are the host.</div>
              </div>
            ) : (
              <div className="muted2">Only the host can add cards.</div>
            )}
          </div>
        </div>

        {/* Cards Pulled */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Cards Pulled</div>
          </div>
          <div className="cardBody">
            {cardsLoading ? (
              <div className="muted">Loading cards…</div>
            ) : cards.length === 0 ? (
              <div className="muted">No cards yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {cards.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ fontWeight: 750 }}>{c.name}</div>
                    <div className="pill">${c.price}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN */}
      <div style={{ display: "grid", gap: 16 }}>
        
        {/* Chat */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Chat</div>
          </div>
          <div className="cardBody">
            {messagesLoading ? (
              <div className="muted">Loading chat…</div>
            ) : (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 12,
                  height: 260,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {messages.length === 0 ? (
                  <div className="muted2">No messages yet.</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} style={{ fontSize: 14 }}>
                      <span style={{ opacity: 0.6 }}>
                        @{usernames[m.user_id] ?? m.user_id.slice(0, 6)}:
                      </span>{" "}
                      {m.content}
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <input
                className="input"
                placeholder={session ? "Type a message…" : "Sign in to chat"}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                disabled={!session}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
                style={{ flex: 1 }}
              />
              <button
                className="btn btnPrimary"
                onClick={sendMessage}
                disabled={!session}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Available Spots */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Available Spots</div>
          </div>
          <div className="cardBody">
            {slotsLoading ? (
              <div className="muted">Loading spots…</div>
            ) : slots.length === 0 ? (
              <div className="muted">No spots yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {slots.map((s) => {
                  const claimed = !!s.buyer_user_id;
                  const mine =
                    !!session?.user?.id && s.buyer_user_id === session.user.id;

                  return (
                    <div
                      key={s.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        opacity: claimed && !mine ? 0.7 : 1,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          #{s.slot_number}
                        </div>
                        <div className="muted2">
                          ${s.price}{" "}
                          {claimed ? (mine ? "• Yours" : "• Sold") : "• Available"}
                        </div>
                      </div>

                      {claimed ? (
                        <button className="btn" disabled>
                          {mine ? "Yours" : "Sold"}
                        </button>
                      ) : (
                        <button
                          className="btn btnPrimary"
                          onClick={() => buySlot(s.slot_number)}
                        >
                          Buy
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
);
}