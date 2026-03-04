"use client";

export default function PokemonCard(props: {
  displayName: string;
  username: string;
  bio: string;

  pokemonFavorite: string;
  pokemonType: string;
  pokemonTrainer: string;
  pokemonRegion: string;

  setPokemonFavorite: (v: string) => void;
  setPokemonType: (v: string) => void;
  setPokemonTrainer: (v: string) => void;
  setPokemonRegion: (v: string) => void;
}) {
  const { displayName, username, bio } = props;

  return (
    <div style={{ width: "min(720px, 100%)" }}>
      <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.55)", overflow: "hidden", boxShadow: "0 26px 110px rgba(0,0,0,0.70)" }}>
        {/* label */}
        <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))", borderBottom: "1px solid rgba(255,255,255,0.12)", padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: 0.3, fontSize: 14 }}>BREAKER ROOKIE — POKÉMON CARD</div>
              <div style={{ opacity: 0.86, fontWeight: 850, marginTop: 4, fontSize: 12 }}>
                {displayName || "Your Name"} {username ? `• @${username.replace("@", "")}` : ""}
              </div>
            </div>
            <div style={{ fontWeight: 950, opacity: 0.9 }}>ID #{String((displayName || "000000").length + 42).padStart(7, "0")}</div>
          </div>
        </div>

        {/* card */}
        <div style={{ padding: 14, background: "radial-gradient(900px 340px at 50% 30%, rgba(245,158,11,0.22), transparent 60%)" }}>
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", padding: 14 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 22 }}>{displayName || "Display Name"}</div>
                  <div style={{ opacity: 0.85, fontWeight: 850, marginTop: 4 }}>{bio ? bio : "Write a short bio (optional)"} </div>
                </div>

                <div style={{ justifySelf: "end", textAlign: "right" }}>
                  <div style={{ fontWeight: 950, opacity: 0.95 }}>TYPE</div>
                  <div style={{ fontSize: 22, fontWeight: 950, marginTop: 2 }}>{props.pokemonType || "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>FAVORITE POKÉMON</div>
                  <input className="input" value={props.pokemonFavorite} onChange={(e) => props.setPokemonFavorite(e.target.value)} placeholder="Charizard, Pikachu, etc" />
                </div>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>TYPE</div>
                  <input className="input" value={props.pokemonType} onChange={(e) => props.setPokemonType(e.target.value)} placeholder="Fire, Water, etc" />
                </div>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>TRAINER</div>
                  <input className="input" value={props.pokemonTrainer} onChange={(e) => props.setPokemonTrainer(e.target.value)} placeholder="Ash, Misty, etc" />
                </div>
                <div>
                  <div style={{ fontWeight: 950, opacity: 0.9, marginBottom: 6 }}>REGION</div>
                  <input className="input" value={props.pokemonRegion} onChange={(e) => props.setPokemonRegion(e.target.value)} placeholder="Kanto, Johto, etc" />
                </div>
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