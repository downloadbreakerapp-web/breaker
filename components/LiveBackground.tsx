"use client";

import { useEffect, useState } from "react";

type Dot = { id: number; left: number; top: number; size: number; opacity: number };

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function LiveBackground({ count = 44 }: { count?: number }) {
  const [mounted, setMounted] = useState(false);
  const [dots, setDots] = useState<Dot[]>([]);

  useEffect(() => {
    setMounted(true);

    // random ONLY after mount (client)
    setDots(
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: rand(2, 98),
        top: rand(2, 98),
        size: Math.round(rand(1, 3)),
        opacity: rand(0.06, 0.22),
      }))
    );
  }, [count]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "radial-gradient(1200px 700px at 50% 35%, rgba(255,255,255,0.06), rgba(0,0,0,1) 70%)",
      }}
    >
      {/* subtle glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(900px 500px at 50% 40%, rgba(99,102,241,0.08), transparent 60%)",
          opacity: 0.9,
        }}
      />

      {/* dots */}
      {dots.map((d) => (
        <div
          key={d.id}
          style={{
            position: "absolute",
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            borderRadius: 999,
            background: "white",
            opacity: d.opacity,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 18px rgba(255,255,255,0.20)",
          }}
        />
      ))}
    </div>
  );
}