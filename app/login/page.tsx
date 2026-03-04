"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setErrorText(null);

    try {
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) {
        setErrorText("Enter email and password.");
        return;
      }

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        router.push("/");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });
      if (error) throw error;

      alert("Account created. If email confirmation is on, check your inbox.");
      router.push("/");
    } catch (err: any) {
      console.error("Auth error:", err);
      setErrorText(err?.message ?? "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="cardHeader">
        <div className="h2">{mode === "signin" ? "Sign in" : "Create account"}</div>
      </div>

      <div className="cardBody" style={{ display: "grid", gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <button
            className={`btn ${mode === "signin" ? "btnPrimary" : ""}`}
            onClick={() => setMode("signin")}
            disabled={loading}
          >
            Sign in
          </button>
          <button
            className={`btn ${mode === "signup" ? "btnPrimary" : ""}`}
            onClick={() => setMode("signup")}
            disabled={loading}
          >
            Sign up
          </button>
        </div>

        <input
          className="input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <input
          className="input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />

        <button className="btn btnPrimary" onClick={submit} disabled={loading}>
          {loading ? "Loading..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        {errorText && <div style={{ color: "#ff6b6b", fontWeight: 800 }}>{errorText}</div>}
      </div>
    </div>
  );
}