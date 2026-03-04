"use client";

export default function SportsCard(props: {
  displayName: string;
  username: string;
  bio: string;

  sport: string;
  team: string;
  position: string;
  rookieYear: string;
  favoritePlayer: string;

  setSport: (v: string) => void;
  setTeam: (v: string) => void;
  setPosition: (v: string) => void;
  setRookieYear: (v: string) => void;
  setFavoritePlayer: (v: string) => void;
}) {
  const { displayName, username, bio } = props;

  return (
    <div style={{ width: "min(720px, 100%)" }}>
      {/* slab */}
      <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.55)", overflow: "hidden", boxShadow: "0 26px 110px rgba(0,0,0,0.70)" }}>
        {/* label */}
        <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))", borderBottom: "1px solid rgba(255,255,255,0.12)", padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: 0.3, fontSize: 14 }}>BREAKER ROOKIE — SPORTS CARD</div>
              <div style={{ opacity: 0.86, fontWeight: 850, marginTop: 4, fontSize: 12 }}>
                {displayName || "Your Name"} {username ? `• @${username.replace("@", "")}` : ""}
              </div>
            </div>
            <div style={{ fontWeight: 950, opacity: 0.9 }}>ID #{String((displayName || "000000").length).padStart(7, "0")}</div>
          </div>
        </div>

        {/* “card” */}
        <div style={{ padding: 14, background: "radial-gradient(900px 340px at 50% 30%, rgba(59,130,246,0.18), transparent 60%)" }}>
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", padding: 14 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 22 }}>{displayName || "Display Name"}</div>
                  <div style={{ opacity: 0.85, fontWeight: 850, marginTop: 4 }}>{bio ? bio : "Write a short bio (optional)"} </div>
                </div>
                <div style={{ justifySelf: "end", textAlign: "right" }}>
                  <div style={{ fontWeight: 950, opacity: 0.95 }}>ROOKIE YEAR</div>
                  <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{props.rookieYear || "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>SPORT</div>
                  <input className="input" value={props.sport} onChange={(e) => props.setSport(e.target.value)} placeholder="MLB / NBA / NFL / etc" />
                </div>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>TEAM</div>
                  <input className="input" value={props.team} onChange={(e) => props.setTeam(e.target.value)} placeholder="Yankees, Lakers, etc" />
                </div>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>POSITION</div>
                  <input className="input" value={props.position} onChange={(e) => props.setPosition(e.target.value)} placeholder="OF, QB, PG, etc" />
                </div>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>FAVORITE PLAYER</div>
                  <input className="input" value={props.favoritePlayer} onChange={(e) => props.setFavoritePlayer(e.target.value)} placeholder="Ken Griffey Jr, etc" />
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>ROOKIE YEAR</div>
                <input className="input" value={props.rookieYear} onChange={(e) => props.setRookieYear(e.target.value)} placeholder="2026" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          padding: 11px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.35);
          color: rgba(226, 232, 240, 0.95);
          outline: none;
          font-weight: 850;
        }
        .input::placeholder {
          color: rgba(226, 232, 240, 0.55);
        }
      `}</style>
    </div>
  );
}