"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthBar() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        setOkMsg("Signed in.");
        // optional: you can navigate if you want
        // window.location.href = "/profile";
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      setOkMsg("Signed up. Check your email if confirmation is enabled.");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setMode("signin")} disabled={loading}>
          Sign in
        </button>
        <button onClick={() => setMode("signup")} disabled={loading}>
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />

        <button type="submit" disabled={loading || !email || !password}>
          {loading ? "Loading..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>

        {errorMsg && <div style={{ color: "salmon" }}>{errorMsg}</div>}
        {okMsg && <div style={{ color: "lightgreen" }}>{okMsg}</div>}
      </form>
    </div>
  );
}