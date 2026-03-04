"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type CardStyle = "sports" | "pokemon";

function cx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

async function uploadAvatar(file: File, userId: string) {
  // Optional: create a Supabase Storage bucket named "avatars"
  // Supabase dashboard → Storage → Create bucket "avatars" (public = true)
  const ext = file.name.split(".").pop() || "png";
  const path = `${userId}/${Date.now()}.${ext}`;

  const up = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (up.error) throw up.error;

  const pub = supabase.storage.from("avatars").getPublicUrl(path);
  return pub.data.publicUrl;
}

export default function PrelaunchHome() {
  const router = useRouter();

  // Flow steps:
  // 0 = box closed
  // 1 = box opened, pack appears
  // 2 = pack ripped, card appears (signup)
  const [step, setStep] = useState<0 | 1 | 2>(0);

  // Pack “rip” tracking
  const [ripProgress, setRipProgress] = useState(0); // 0..1
  const ripDone = ripProgress >= 1;

  // Signup form on the “card”
  const [style, setStyle] = useState<CardStyle>("sports");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const locked = useMemo(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.get("locked") === "1";
  }, []);

  async function signUp() {
    setMsg(null);
    const u = username.trim();
    if (!u || u.length < 3) return setMsg("Username must be at least 3 characters.");
    if (!email.trim()) return setMsg("Enter your email.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");

    setBusy(true);
    try {
      // 1) Create auth user
      const res = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (res.error) throw res.error;
      const userId = res.data.user?.id;
      if (!userId) throw new Error("Sign up succeeded but user id is missing.");

      // 2) Set username via RPC (your production rule)
      // Must exist: update_my_profile(p_username)
      const up = await supabase.rpc("update_my_profile", { p_username: u });
      if (up.error) throw up.error;

      // 3) Optional avatar upload
      if (avatarFile) {
        try {
          const url = await uploadAvatar(avatarFile, userId);
          // If you have an RPC to set avatar_url, use it.
          // For now: direct update is okay if your RLS allows user updating their own profile avatar_url.
          const p = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
          if (p.error) console.warn("avatar update blocked:", p.error.message);
        } catch (e: any) {
          console.warn("avatar upload failed:", e?.message ?? e);
        }
      }

      // 4) “Slab” saved concept (for now: localStorage – we’ll move to DB next)
      try {
        localStorage.setItem(
          "breaker_slab",
          JSON.stringify({
            style,
            username: u,
            createdAt: new Date().toISOString(),
            grade: style === "sports" ? "9.5 GEM" : "10 GEM MINT",
            serial: Math.random().toString(16).slice(2, 10).toUpperCase(),
          })
        );
      } catch {}

      setMsg("Account created ✅ Welcome to Breaker prelaunch.");
      // Keep them on prelaunch page for hype, but you can send them to /profile if you want:
      // router.push("/profile");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 16px 56px" }}>
      {/* Header */}
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        <div style={{ fontWeight: 950, fontSize: 42, letterSpacing: -0.6 }}>Breaker</div>
        <div style={{ opacity: 0.85, fontSize: 16, lineHeight: 1.5, maxWidth: 760 }}>
          A social marketplace for trading card collectors — the hybrid of <b>Whatnot</b> + <b>TikTok</b> + <b>eBay</b> + <b>Instagram</b>.
          <br />
          Prelaunch is live: create your account, claim your username, and get your “slabbed” identity card.
        </div>

        {locked ? (
          <div
            style={{
              marginTop: 6,
              borderRadius: 14,
              padding: 12,
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              maxWidth: 760,
            }}
          >
            <div style={{ fontWeight: 900 }}>Prelaunch mode</div>
            <div style={{ opacity: 0.9, marginTop: 4 }}>
              The full app is locked while we build. You can still create an account and reserve your identity card.
            </div>
          </div>
        ) : null}
      </div>

      {/* Main stage */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        {/* Left: Animation stage */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 20,
            background: "rgba(255,255,255,0.03)",
            padding: 18,
            minHeight: 560,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 900, opacity: 0.92 }}>Prelaunch Drop</div>
            <div className="pill" style={{ background: "rgba(255,255,255,0.06)" }}>
              {step === 0 ? "Step 1: Open the box" : step === 1 ? "Step 2: Rip the pack" : "Step 3: Create your card"}
            </div>
          </div>

          <div style={{ height: 18 }} />

          {/* 3D Box */}
          <AnimatePresence>
            {step === 0 ? (
              <motion.div
                key="box-closed"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                style={{ display: "grid", placeItems: "center", marginTop: 30 }}
              >
                <div style={{ perspective: 1200 }}>
                  <motion.div
                    whileHover={{ rotateY: 10, rotateX: -6 }}
                    style={{
                      width: 320,
                      height: 240,
                      transformStyle: "preserve-3d",
                      borderRadius: 20,
                      position: "relative",
                    }}
                  >
                    {/* Box body */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 22,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background:
                          "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(59,130,246,0.22), rgba(236,72,153,0.16))",
                        boxShadow: "0 22px 60px rgba(0,0,0,0.45)",
                      }}
                    />
                    {/* Logo */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        padding: 18,
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 950, fontSize: 34, letterSpacing: -0.6 }}>BREAKER</div>
                        <div style={{ opacity: 0.85, marginTop: 6 }}>PRELAUNCH EDITION</div>
                        <div
                          style={{
                            marginTop: 14,
                            padding: "10px 14px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.06)",
                            display: "inline-block",
                            fontWeight: 850,
                          }}
                        >
                          1 SLABBED ID CARD INSIDE
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                <div style={{ height: 18 }} />

                <button className="btn btnPrimary" onClick={() => setStep(1)}>
                  Open the box →
                </button>

                <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                  This is your first “drop”. Open it to reveal your pack.
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Pack stage */}
          <AnimatePresence>
            {step === 1 ? (
              <motion.div
                key="pack"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                style={{ display: "grid", placeItems: "center", marginTop: 28 }}
              >
                <motion.div
                  initial={{ rotateX: 12, rotateY: -10 }}
                  animate={{ rotateX: 0, rotateY: 0 }}
                  transition={{ duration: 0.6 }}
                  style={{
                    width: 320,
                    height: 420,
                    borderRadius: 22,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background:
                      "linear-gradient(160deg, rgba(236,72,153,0.18), rgba(59,130,246,0.22), rgba(15,23,42,0.85))",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.50)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Foil stripes */}
                  <div
                    style={{
                      position: "absolute",
                      inset: -60,
                      background:
                        "repeating-linear-gradient(110deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.06) 18px, rgba(255,255,255,0.02) 36px)",
                      transform: "rotate(10deg)",
                      opacity: 0.25,
                    }}
                  />

                  {/* Pack top seam */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 0,
                      height: 70,
                      borderBottom: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(0,0,0,0.18)",
                    }}
                  />

                  <div style={{ position: "absolute", inset: 0, padding: 18, display: "grid" }}>
                    <div style={{ fontWeight: 950, letterSpacing: -0.4, fontSize: 26 }}>BREAKER PACK</div>
                    <div style={{ opacity: 0.85, marginTop: 6 }}>RIP TO REVEAL YOUR ID CARD</div>

                    <div style={{ flex: 1 }} />

                    {/* Rip overlay you drag */}
                    <motion.div
                      drag="x"
                      dragConstraints={{ left: 0, right: 220 }}
                      onDrag={(e, info) => {
                        const p = Math.min(Math.max(info.offset.x / 220, 0), 1);
                        setRipProgress(p);
                      }}
                      onDragEnd={() => {
                        if (ripProgress > 0.55) {
                          setRipProgress(1);
                          setTimeout(() => setStep(2), 550);
                        } else {
                          setRipProgress(0);
                        }
                      }}
                      style={{
                        height: 70,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(0,0,0,0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 14px",
                        cursor: "grab",
                        userSelect: "none",
                      }}
                      animate={{
                        opacity: ripDone ? 0.25 : 1,
                      }}
                      transition={{ duration: 0.25 }}
                    >
                      <div style={{ fontWeight: 900 }}>Drag to rip</div>
                      <div className="pill" style={{ background: "rgba(255,255,255,0.06)" }}>
                        {Math.round(ripProgress * 100)}%
                      </div>
                    </motion.div>

                    <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                      Tip: drag the rip bar to the right past 55%.
                    </div>
                  </div>
                </motion.div>

                <div style={{ height: 14 }} />

                <button className="btn" onClick={() => setStep(0)}>
                  ← Back
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Card reveal */}
          <AnimatePresence>
            {step === 2 ? (
              <motion.div
                key="card"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
                style={{ display: "grid", placeItems: "center", marginTop: 26 }}
              >
                <motion.div
                  initial={{ rotateY: 18 }}
                  animate={{ rotateY: 0 }}
                  transition={{ duration: 0.55 }}
                  style={{
                    width: 360,
                    height: 500,
                    borderRadius: 24,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.04)",
                    boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* “Slab” frame */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 10,
                      borderRadius: 20,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(0,0,0,0.22)",
                      backdropFilter: "blur(8px)",
                    }}
                  />
                  <div style={{ position: "absolute", inset: 24, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, letterSpacing: -0.4, fontSize: 18 }}>
                        {style === "sports" ? "BREAKER ROOKIE ID" : "BREAKER TRAINER ID"}
                      </div>
                      <div className="pill" style={{ background: "rgba(255,255,255,0.06)" }}>
                        {style === "sports" ? "9.5 GEM" : "10 GEM"}
                      </div>
                    </div>

                    {/* Card skin */}
                    <div
                      style={{
                        borderRadius: 18,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background:
                          style === "sports"
                            ? "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(15,23,42,0.85), rgba(236,72,153,0.12))"
                            : "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(15,23,42,0.85), rgba(250,204,21,0.14))",
                        padding: 14,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                        <button
                          className={cx("btn", style === "sports" && "btnPrimary")}
                          onClick={() => setStyle("sports")}
                          type="button"
                        >
                          Sports design
                        </button>
                        <button
                          className={cx("btn", style === "pokemon" && "btnPrimary")}
                          onClick={() => setStyle("pokemon")}
                          type="button"
                        >
                          Pokémon design
                        </button>
                      </div>

                      <div style={{ opacity: 0.92, fontWeight: 900 }}>Create your Breaker account</div>

                      <input
                        className="input"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={busy}
                      />
                      <input
                        className="input"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={busy}
                      />
                      <input
                        className="input"
                        placeholder="Password (6+ chars)"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                      />

                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800, opacity: 0.9 }}>Profile picture (optional)</div>
                        <input
                          className="input"
                          type="file"
                          accept="image/*"
                          disabled={busy}
                          onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                        />
                      </div>

                      {msg ? (
                        <div
                          style={{
                            borderRadius: 14,
                            padding: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.30)",
                            fontSize: 13,
                          }}
                        >
                          {msg}
                        </div>
                      ) : null}

                      <button className="btn btnPrimary" onClick={signUp} disabled={busy}>
                        {busy ? "Creating..." : "Slab my ID card →"}
                      </button>

                      <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
                        By signing up you’re reserving your username and getting early access.
                        <br />
                        The full app launches soon — stay tuned.
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <button className="btn" onClick={() => setStep(1)} type="button">
                        ← Back
                      </button>
                      <button className="btn" onClick={() => router.push("/login")} type="button">
                        Already have an account? Sign in →
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Right: Prelaunch info / hype */}
        <div style={{ display: "grid", gap: 12 }}>
          <div className="card">
            <div className="cardHeader">
              <div className="h2">What you get right now</div>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              <div>✅ Create an account + reserve your username</div>
              <div>✅ Your “slabbed” ID card (sports or Pokémon style)</div>
              <div>✅ Early access when we open the marketplace + breaks</div>
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <div className="h2">Launching soon</div>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              <div>• Social feed + clips</div>
              <div>• Marketplace + reputation</div>
              <div>• Pack breaks + live reveals</div>
              <div>• Messaging + notifications</div>
            </div>
          </div>

          <div className="card">
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Dev note</div>
              <div className="muted2" style={{ lineHeight: 1.5 }}>
                While prelaunch is ON, the rest of the app is locked for the public. You can keep building locally by setting:
                <br />
                <code>NEXT_PUBLIC_PRELAUNCH=0</code>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a href="https://x.com" target="_blank" rel="noreferrer">
                  <button className="btn">Follow on X</button>
                </a>
                <a href="https://instagram.com" target="_blank" rel="noreferrer">
                  <button className="btn">Follow on IG</button>
                </a>
                <button className="btn btnPrimary" onClick={() => setStep(0)}>
                  Replay drop
                </button>
              </div>
            </div>
          </div>

          <div className="muted2" style={{ textAlign: "center" }}>
            © {new Date().getFullYear()} Breaker — Prelaunch
          </div>
        </div>
      </div>
    </div>
  );
}