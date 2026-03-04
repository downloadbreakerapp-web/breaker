"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: number;
  type: "single" | "pack" | "box";
  name: string;
  brand: string | null;
  set_name: string | null;
  image_url: string | null;
  created_at: string;
};

type NewsRow = {
  id: number;
  category: "release" | "news";
  title: string;
  body: string | null;
  url: string | null;
  release_date: string | null;
  created_at: string;
};

type BreakerSalesRow = {
  product_id: number;
  sold_7d_count: number;
  sold_7d_low: number | null;
  sold_7d_high: number | null;
  sold_7d_median: number | null;
  last_sold_at: string | null;

  sold_7d_first_price: number | null;
  sold_7d_last_price: number | null;
  sold_7d_change_abs: number | null;
  sold_7d_change_pct: number | null;
};

type ActiveListingsRow = {
  product_id: number;
  active_count: number;
  active_low: number | null;
  active_median: number | null;
  last_listed_at: string | null;
};

type DailyMedianRow = {
  product_id: number;
  day: string; // YYYY-MM-DD
  median_price: number | null;
  sold_count: number;
};

type MarketCard = {
  product: ProductRow;
  sales: BreakerSalesRow | null;
  active: ActiveListingsRow | null;

  livePrice: number | null;
  score: number;

  rawMedian7d: (number | null)[];
  rawSoldCount7d: number[]; // volume per day (0..)
  chartMedian7d: number[]; // filled for graph
  chartSoldCount7d: number[]; // same as raw but guaranteed len 7

  category: "pokemon" | "sports" | "other";
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSignedMoney(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtMoney(n)}`;
}
function fmtSignedPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}
function pillForType(t: ProductRow["type"]) {
  if (t === "box") return "Box";
  if (t === "pack") return "Pack";
  return "Single";
}
function changeColor(pct: number | null | undefined) {
  if (pct == null) return "rgba(148,163,184,0.95)";
  if (pct > 0) return "#22c55e";
  if (pct < 0) return "#ef4444";
  return "rgba(148,163,184,0.95)";
}
function inferCategory(p: ProductRow): "pokemon" | "sports" | "other" {
  const text = `${p.name} ${p.brand ?? ""} ${p.set_name ?? ""}`.toLowerCase();
  if (
    text.includes("pokemon") ||
    text.includes("pokémon") ||
    text.includes("charizard") ||
    text.includes("pikachu") ||
    text.includes("scarlet") ||
    text.includes("violet") ||
    text.includes("booster")
  )
    return "pokemon";

  if (
    text.includes("panini") ||
    text.includes("topps") ||
    text.includes("prizm") ||
    text.includes("chrome") ||
    text.includes("bowman") ||
    text.includes("nba") ||
    text.includes("nfl") ||
    text.includes("mlb")
  )
    return "sports";

  return "other";
}

function isoDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}
function last7DaysUTC(): string[] {
  const base = new Date();
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(isoDayUTC(d));
  }
  return out;
}

function makeChartSeries(raw: (number | null)[], fallback: number | null): number[] {
  const fb = fallback ?? 0;
  const filled = raw.map((v) => (v == null || !Number.isFinite(v) ? null : Number(v)));

  let last: number | null = null;
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] != null) last = filled[i]!;
    else if (last != null) filled[i] = last;
  }
  let next: number | null = null;
  for (let i = filled.length - 1; i >= 0; i--) {
    if (filled[i] != null) next = filled[i]!;
    else if (next != null) filled[i] = next;
  }

  const allNull = filled.every((v) => v == null);
  const finalArr = (allNull ? Array(filled.length).fill(fb) : filled.map((v) => (v == null ? fb : v))) as number[];

  if (finalArr.length === 1) return [finalArr[0], finalArr[0]];
  return finalArr;
}

function SparklineWithVolume({
  values,
  volume,
  width = 160,
  height = 46,
  color = "rgba(148,163,184,0.95)",
  labelPrefix = "",
}: {
  values: number[];
  volume: number[];
  width?: number;
  height?: number;
  color?: string;
  labelPrefix?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const present = values.filter((v) => Number.isFinite(v));
  const min = present.length ? Math.min(...present) : 0;
  const max = present.length ? Math.max(...present) : 1;
  const range = max - min || 1;

  const vMax = Math.max(...(volume.length ? volume : [0])) || 1;

  const pad = 4;
  const n = Math.max(values.length, 2);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const linePts = values.map((v, i) => {
    const x = pad + (i * innerW) / (n - 1);
    const y = pad + (1 - (v - min) / range) * innerH;
    return { x, y, v, i };
  });

  const pointsStr = linePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const barW = innerW / Math.max(1, values.length) * 0.7;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rel = Math.min(Math.max(x - pad, 0), innerW);
    const idx = Math.round((rel / innerW) * (values.length - 1));
    setHoverIdx(Number.isFinite(idx) ? idx : null);
  };

  const onLeave = () => setHoverIdx(null);

  const hover = hoverIdx == null ? null : linePts[Math.min(Math.max(hoverIdx, 0), linePts.length - 1)];

  return (
    <div style={{ position: "relative", width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.03)",
          display: "block",
        }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* volume bars */}
        {values.map((_, i) => {
          const x = pad + (i * innerW) / Math.max(1, values.length);
          const h = (volume[i] / vMax) * (innerH * 0.35);
          return (
            <rect
              key={`b-${i}`}
              x={x + (innerW / Math.max(1, values.length) - barW) / 2}
              y={pad + innerH - h}
              width={barW}
              height={h}
              rx={2}
              opacity={hoverIdx === i ? 0.6 : 0.35}
              fill={color}
            />
          );
        })}

        {/* line */}
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pointsStr} />

        {/* hover marker */}
        {hover ? (
          <>
            <line x1={hover.x} y1={pad} x2={hover.x} y2={pad + innerH} stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
            <circle cx={hover.x} cy={hover.y} r={3} fill={color} />
          </>
        ) : null}
      </svg>

      {hover ? (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hover.x - 60, 6), width - 126),
            top: 6,
            padding: "6px 8px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "rgba(0,0,0,0.55)",
            fontSize: 12,
            lineHeight: 1.2,
            color: "rgba(226,232,240,0.95)",
            pointerEvents: "none",
            width: 120,
          }}
        >
          <div style={{ fontWeight: 900 }}>
            {labelPrefix}
            ${fmtMoney(hover.v)}
          </div>
          <div style={{ opacity: 0.9, marginTop: 3 }}>Sold: {volume[hover.i] ?? 0}</div>
        </div>
      ) : null}
    </div>
  );
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className="btn"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
        border: active ? "1px solid rgba(255,255,255,0.20)" : "1px solid var(--border)",
        fontWeight: 850,
      }}
    >
      {label}
    </button>
  );
}

export default function MarketPage() {
  const [loading, setLoading] = useState(true);
  const [silentLoading, setSilentLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales7d, setSales7d] = useState<BreakerSalesRow[]>([]);
  const [activeByProduct, setActiveByProduct] = useState<ActiveListingsRow[]>([]);
  const [daily7d, setDaily7d] = useState<DailyMedianRow[]>([]);
  const [news, setNews] = useState<NewsRow[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "single" | "pack" | "box">("all");
  const [category, setCategory] = useState<"all" | "pokemon" | "sports">("all");
  const [live, setLive] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const liveTimerRef = useRef<number | null>(null);
  const lastRefreshRef = useRef<number>(0);
  const debounceTimerRef = useRef<number | null>(null);

  const loadMarket = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    const now = Date.now();
    if (now - lastRefreshRef.current < 1200) return;
    lastRefreshRef.current = now;

    if (silent) setSilentLoading(true);
    else setLoading(true);

    setErr(null);

    try {
      const [pRes, sRes, aRes, dRes, nRes] = await Promise.all([
        supabase.from("market_products").select("id, type, name, brand, set_name, image_url, created_at").order("created_at", { ascending: false }),

        supabase
          .from("market_breaker_sales_7d")
          .select(
            [
              "product_id",
              "sold_7d_count",
              "sold_7d_low",
              "sold_7d_high",
              "sold_7d_median",
              "last_sold_at",
              "sold_7d_first_price",
              "sold_7d_last_price",
              "sold_7d_change_abs",
              "sold_7d_change_pct",
            ].join(",")
          ),

        supabase.from("market_active_listings_by_product").select("product_id, active_count, active_low, active_median, last_listed_at"),

        supabase.from("market_breaker_daily_median_7d").select("product_id, day, median_price, sold_count").order("day", { ascending: true }),

        supabase.from("market_news").select("id, category, title, body, url, release_date, created_at").order("created_at", { ascending: false }).limit(40),
      ]);

      if (pRes.error) throw pRes.error;
      if (sRes.error) throw sRes.error;
      if (aRes.error) throw aRes.error;
      if (dRes.error) throw dRes.error;
      if (nRes.error) throw nRes.error;

      setProducts((pRes.data ?? []) as ProductRow[]);
      setSales7d((sRes.data ?? []) as BreakerSalesRow[]);
      setActiveByProduct((aRes.data ?? []) as ActiveListingsRow[]);
      setDaily7d((dRes.data ?? []) as DailyMedianRow[]);
      setNews((nRes.data ?? []) as NewsRow[]);
    } catch (e: any) {
      console.error("MARKET LOAD ERROR:", e);
      setErr(e?.message ?? "Market failed to load.");
    } finally {
      if (silent) setSilentLoading(false);
      else setLoading(false);
    }
  }, []);

  const scheduleSilentRefresh = useCallback(() => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      loadMarket({ silent: true });
    }, 450);
  }, [loadMarket]);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    if (!live) {
      if (liveTimerRef.current) window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
      return;
    }
    if (liveTimerRef.current) window.clearInterval(liveTimerRef.current);
    liveTimerRef.current = window.setInterval(() => loadMarket({ silent: true }), 20000);

    return () => {
      if (liveTimerRef.current) window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    };
  }, [live, loadMarket]);

  useEffect(() => {
    const ch = supabase.channel("market-page-live").on("postgres_changes", { event: "*", schema: "public", table: "market_news" }, scheduleSilentRefresh).subscribe();
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [scheduleSilentRefresh]);

  const cards: MarketCard[] = useMemo(() => {
    const salesMap = new Map<number, BreakerSalesRow>();
    for (const s of sales7d) salesMap.set(s.product_id, s);

    const activeMap = new Map<number, ActiveListingsRow>();
    for (const a of activeByProduct) activeMap.set(a.product_id, a);

    const days = last7DaysUTC();
    const dayIndex = new Map<string, number>();
    days.forEach((d, i) => dayIndex.set(d, i));

    const rawMedianMap = new Map<number, (number | null)[]>();
    const rawSoldCountMap = new Map<number, number[]>();

    for (const row of daily7d) {
      const key = String(row.day).slice(0, 10);
      const idx = dayIndex.get(key);
      if (idx == null) continue;

      const mArr = rawMedianMap.get(row.product_id) ?? Array(7).fill(null);
      const vArr = rawSoldCountMap.get(row.product_id) ?? Array(7).fill(0);

      mArr[idx] = row.median_price == null ? null : Number(row.median_price);
      vArr[idx] = Number(row.sold_count ?? 0);

      rawMedianMap.set(row.product_id, mArr);
      rawSoldCountMap.set(row.product_id, vArr);
    }

    return products.map((p) => {
      const sales = salesMap.get(p.id) ?? null;
      const active = activeMap.get(p.id) ?? null;

      const livePrice =
        sales?.sold_7d_median != null
          ? Number(sales.sold_7d_median)
          : active?.active_median != null
          ? Number(active.active_median)
          : null;

      const soldCount = sales?.sold_7d_count ?? 0;
      const activeCount = active?.active_count ?? 0;
      const score = soldCount * 2 + activeCount;

      const rawMedian7d = rawMedianMap.get(p.id) ?? Array(7).fill(null);
      const rawSoldCount7d = rawSoldCountMap.get(p.id) ?? Array(7).fill(0);

      const chartMedian7d = makeChartSeries(rawMedian7d, livePrice);
      const chartSoldCount7d = rawSoldCount7d.length === 7 ? rawSoldCount7d : Array(7).fill(0);

      return {
        product: p,
        sales,
        active,
        livePrice,
        score,
        rawMedian7d,
        rawSoldCount7d,
        chartMedian7d,
        chartSoldCount7d,
        category: inferCategory(p),
      };
    });
  }, [products, sales7d, activeByProduct, daily7d]);

  const categoryFiltered = useMemo(() => {
    if (category === "all") return cards;
    return cards.filter((c) => c.category === category);
  }, [cards, category]);

  const trending = useMemo(() => {
    return [...categoryFiltered]
      .filter((c) => c.score > 0)
      .sort((a, b) => {
        const diff = b.score - a.score;
        if (diff !== 0) return diff;

        const bt = b.sales?.last_sold_at ? new Date(b.sales.last_sold_at).getTime() : b.active?.last_listed_at ? new Date(b.active.last_listed_at).getTime() : 0;
        const at = a.sales?.last_sold_at ? new Date(a.sales.last_sold_at).getTime() : a.active?.last_listed_at ? new Date(a.active.last_listed_at).getTime() : 0;
        return bt - at;
      })
      .slice(0, 6);
  }, [categoryFiltered]);

  const releases = useMemo(() => {
    return news
      .filter((n) => n.category === "release")
      .sort((a, b) => {
        const ad = a.release_date ? new Date(a.release_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.release_date ? new Date(b.release_date).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 6);
  }, [news]);

  const headlines = useMemo(() => news.filter((n) => n.category === "news").slice(0, 6), [news]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...categoryFiltered]
      .filter((c) => (typeFilter === "all" ? true : c.product.type === typeFilter))
      .filter((c) => {
        if (!q) return true;
        const hay = `${c.product.name} ${c.product.brand ?? ""} ${c.product.set_name ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const diff = b.score - a.score;
        if (diff !== 0) return diff;
        return new Date(b.product.created_at).getTime() - new Date(a.product.created_at).getTime();
      });
  }, [categoryFiltered, search, typeFilter]);

  const overview = useMemo(() => {
    let totalActive = 0;
    let totalSold7d = 0;
    for (const c of categoryFiltered) {
      totalActive += c.active?.active_count ?? 0;
      totalSold7d += c.sales?.sold_7d_count ?? 0;
    }
    const top = trending[0] ?? null;
    return { totalActive, totalSold7d, top };
  }, [categoryFiltered, trending]);

  useEffect(() => {
    if (selectedProductId != null) return;
    const first = filteredCards[0]?.product.id ?? null;
    if (first != null) setSelectedProductId(first);
  }, [filteredCards, selectedProductId]);

  const selectedCard = useMemo(() => {
    if (selectedProductId == null) return null;
    return cards.find((c) => c.product.id === selectedProductId) ?? null;
  }, [cards, selectedProductId]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <div>
            <div className="h1">Market</div>
            <div className="muted2" style={{ marginTop: 6 }}>
              Breaker live market: sold volume + active supply + news.
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {silentLoading ? (
            <div className="pill" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)" }}>
              Updating…
            </div>
          ) : null}
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <Tab active={category === "all"} label="All" onClick={() => setCategory("all")} />
          <Tab active={category === "pokemon"} label="Pokémon" onClick={() => setCategory("pokemon")} />
          <Tab active={category === "sports"} label="Sports" onClick={() => setCategory("sports")} />

          <div style={{ flex: 1 }} />

          <button
            className="btn"
            onClick={() => setLive((v) => !v)}
            style={{
              borderRadius: 999,
              background: live ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)",
              border: live ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(239,68,68,0.30)",
              fontWeight: 900,
            }}
            title="Auto-refresh market every 20 seconds"
          >
            {live ? "Live: ON" : "Live: OFF"}
          </button>

          <button className="btn" onClick={() => loadMarket()}>
            Refresh
          </button>
        </div>

        {err ? (
          <div style={{ marginTop: 12, borderRadius: 14, padding: 12, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}>
            <div style={{ fontWeight: 900 }}>Market load failed</div>
            <div className="muted2" style={{ marginTop: 6 }}>
              {err}
            </div>
          </div>
        ) : null}
      </div>

      {/* Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div className="cardBody">
            <div className="muted2">Active listings</div>
            <div style={{ fontWeight: 950, fontSize: 24, marginTop: 6 }}>{loading ? "—" : overview.totalActive}</div>
          </div>
        </div>

        <div className="card">
          <div className="cardBody">
            <div className="muted2">Sold (7 days)</div>
            <div style={{ fontWeight: 950, fontSize: 24, marginTop: 6 }}>{loading ? "—" : overview.totalSold7d}</div>
          </div>
        </div>

        <div className="card">
          <div className="cardBody">
            <div className="muted2">Hottest</div>

            {loading || !overview.top ? (
              <div style={{ marginTop: 6, fontWeight: 900 }}>—</div>
            ) : (
              <Link href={`/market/${overview.top.product.id}`} style={{ textDecoration: "none" }}>
                <div style={{ cursor: "pointer" }}>
                  <div style={{ fontWeight: 900, marginTop: 6 }}>{overview.top.product.name}</div>
                  <div className="muted2" style={{ marginTop: 6 }}>
                    {overview.top.livePrice != null ? `Live: $${fmtMoney(overview.top.livePrice)}` : "Live: —"}
                  </div>

                  <div className="muted2" style={{ marginTop: 6, fontWeight: 900, color: changeColor(overview.top.sales?.sold_7d_change_pct) }}>
                    {overview.top.sales?.sold_7d_change_pct == null ? "7d: —" : `7d: ${fmtSignedPct(Number(overview.top.sales.sold_7d_change_pct))}`}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <SparklineWithVolume
                      values={overview.top.chartMedian7d}
                      volume={overview.top.chartSoldCount7d}
                      width={220}
                      height={56}
                      color={changeColor(overview.top.sales?.sold_7d_change_pct)}
                    />
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Top grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, alignItems: "start", marginBottom: 16 }}>
        {/* Trending */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Trending</div>
            <div className="muted2" style={{ marginTop: 6 }}>
              Score = (sold 7d × 2) + active listings.
            </div>
          </div>

          <div className="cardBody">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : trending.length === 0 ? (
              <div className="muted">No activity yet. Create a few listings and buys in /trade.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {trending.map((c) => (
                  <Link key={c.product.id} href={`/market/${c.product.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(255,255,255,0.04)",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 12,
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 850 }}>{c.product.name}</div>
                        <div className="muted2" style={{ marginTop: 4 }}>
                          <span className="pill">{pillForType(c.product.type)}</span> {c.product.brand ? `• ${c.product.brand}` : ""}{" "}
                          {c.product.set_name ? `• ${c.product.set_name}` : ""}
                        </div>

                        <div className="muted2" style={{ marginTop: 6 }}>
                          Sold 7d: <b>{c.sales?.sold_7d_count ?? 0}</b> · Active: <b>{c.active?.active_count ?? 0}</b>
                        </div>

                        <div className="muted2" style={{ marginTop: 6, fontWeight: 900, color: changeColor(c.sales?.sold_7d_change_pct) }}>
                          {c.sales?.sold_7d_change_pct == null ? "7d: —" : `7d: ${fmtSignedPct(Number(c.sales.sold_7d_change_pct))}`}
                          {c.sales?.sold_7d_change_abs == null ? "" : ` (${fmtSignedMoney(Number(c.sales.sold_7d_change_abs))})`}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", display: "grid", gap: 8, justifyItems: "end" }}>
                        <div className="pill">{c.livePrice == null ? "Live: —" : `Live: $${fmtMoney(c.livePrice)}`}</div>

                        <SparklineWithVolume values={c.chartMedian7d} volume={c.chartSoldCount7d} width={180} height={56} color={changeColor(c.sales?.sold_7d_change_pct)} />

                        <div className="muted2">
                          Score: <b>{c.score}</b>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <div style={{ marginTop: 12 }} className="row">
              <Link href="/trade">
                <button className="btn btnPrimary">Open Marketplace</button>
              </Link>
            </div>
          </div>
        </div>

        {/* Releases + News */}
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <div className="cardHeader">
              <div className="h2">Upcoming Releases</div>
            </div>
            <div className="cardBody">
              {loading ? (
                <div className="muted">Loading…</div>
              ) : releases.length === 0 ? (
                <div className="muted">No releases yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {releases.map((r) => (
                    <a key={r.id} href={r.url ?? "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ fontWeight: 850 }}>{r.title}</div>
                        <div className="muted2" style={{ marginTop: 6 }}>
                          {r.release_date ? `Release: ${r.release_date}` : "Release date TBD"}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <div className="h2">Market News</div>
            </div>
            <div className="cardBody">
              {loading ? (
                <div className="muted">Loading…</div>
              ) : headlines.length === 0 ? (
                <div className="muted">No news yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {headlines.map((n) => (
                    <a key={n.id} href={n.url ?? "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ fontWeight: 850 }}>{n.title}</div>
                        {n.body ? <div className="muted2" style={{ marginTop: 6 }}>{n.body}</div> : null}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Price Explorer */}
      <div className="card">
        <div className="cardHeader">
          <div className="h2">Price Explorer</div>
          <div className="muted2" style={{ marginTop: 6 }}>
            Hover charts = see price + sold volume that day.
          </div>
        </div>

        <div className="cardBody">
          <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <input className="input" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 260 }} />

            <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} style={{ width: 160 }}>
              <option value="all">All</option>
              <option value="box">Boxes</option>
              <option value="pack">Packs</option>
              <option value="single">Singles</option>
            </select>

            <Link href="/trade">
              <button className="btn btnPrimary">Go to Marketplace</button>
            </Link>
          </div>

          {selectedCard ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.04)", marginBottom: 12, display: "grid", gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 950 }}>{selectedCard.product.name}</div>
                  <div className="muted2" style={{ marginTop: 4 }}>
                    <span className="pill">{pillForType(selectedCard.product.type)}</span> {selectedCard.product.brand ? `• ${selectedCard.product.brand}` : ""}{" "}
                    {selectedCard.product.set_name ? `• ${selectedCard.product.set_name}` : ""}
                  </div>
                </div>

                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div className="pill">{selectedCard.livePrice == null ? "Live: —" : `Live: $${fmtMoney(selectedCard.livePrice)}`}</div>
                  <div className="pill" style={{ color: changeColor(selectedCard.sales?.sold_7d_change_pct), borderColor: "var(--border)", background: "rgba(255,255,255,0.03)" }}>
                    {selectedCard.sales?.sold_7d_change_pct == null ? "7d: —" : `7d: ${fmtSignedPct(Number(selectedCard.sales.sold_7d_change_pct))}`}
                  </div>
                  <Link href={`/market/${selectedCard.product.id}`}>
                    <button className="btn">Open product</button>
                  </Link>
                </div>
              </div>

              <div className="muted2">
                Demand (sold 7d): <b>{selectedCard.sales?.sold_7d_count ?? 0}</b> · Supply (active): <b>{selectedCard.active?.active_count ?? 0}</b>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div className="muted2">7-day median sold + volume</div>
                <SparklineWithVolume values={selectedCard.chartMedian7d} volume={selectedCard.chartSoldCount7d} width={740} height={86} color={changeColor(selectedCard.sales?.sold_7d_change_pct)} />
                <div className="muted2">
                  Median sold (7d): <b>{selectedCard.sales?.sold_7d_median == null ? "—" : `$${fmtMoney(Number(selectedCard.sales.sold_7d_median))}`}</b> · Median listed:{" "}
                  <b>{selectedCard.active?.active_median == null ? "—" : `$${fmtMoney(Number(selectedCard.active.active_median))}`}</b> · Low/High sold:{" "}
                  <b>
                    {selectedCard.sales?.sold_7d_low == null ? "—" : `$${fmtMoney(Number(selectedCard.sales.sold_7d_low))}`} /{" "}
                    {selectedCard.sales?.sold_7d_high == null ? "—" : `$${fmtMoney(Number(selectedCard.sales.sold_7d_high))}`}
                  </b>
                </div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="muted">Loading…</div>
          ) : filteredCards.length === 0 ? (
            <div className="muted">No matches.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {filteredCards.map((c) => (
                <div
                  key={c.product.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    background: selectedProductId === c.product.id ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
                    display: "grid",
                    gap: 10,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedProductId(c.product.id)}
                  title="Click to preview chart above"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{c.product.name}</div>
                      <div className="muted2" style={{ marginTop: 6 }}>
                        <span className="pill">{pillForType(c.product.type)}</span> {c.product.brand ? `• ${c.product.brand}` : ""}{" "}
                        {c.product.set_name ? `• ${c.product.set_name}` : ""}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div className="pill">{c.livePrice == null ? "Live: —" : `Live: $${fmtMoney(c.livePrice)}`}</div>
                      <div className="muted2" style={{ marginTop: 6, fontWeight: 900, color: changeColor(c.sales?.sold_7d_change_pct) }}>
                        {c.sales?.sold_7d_change_pct == null ? "7d: —" : `7d: ${fmtSignedPct(Number(c.sales.sold_7d_change_pct))}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div className="muted2">
                      Demand (sold 7d): <b>{c.sales?.sold_7d_count ?? 0}</b> · Supply (active): <b>{c.active?.active_count ?? 0}</b>
                    </div>

                    <SparklineWithVolume values={c.chartMedian7d} volume={c.chartSoldCount7d} width={190} height={56} color={changeColor(c.sales?.sold_7d_change_pct)} />
                  </div>

                  <div className="row" style={{ gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                    <Link href={`/market/${c.product.id}`} style={{ textDecoration: "none" }}>
                      <button className="btn">Open product</button>
                    </Link>
                    <Link href="/trade" style={{ textDecoration: "none" }}>
                      <button className="btn">Go to marketplace</button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardHeader">
          <div className="h2">User Marketplace</div>
          <div className="muted2" style={{ marginTop: 6 }}>
            Buy, sell, and trade singles, packs, and boxes with other users.
          </div>
        </div>
        <div className="cardBody">
          <Link href="/trade">
            <button className="btn btnPrimary">Open Marketplace</button>
          </Link>
        </div>
      </div>
    </div>
  );
}