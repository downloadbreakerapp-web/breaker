"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  day: string; // date
  median_price: number | null;
  sold_count: number;
};

type ListingRow = {
  id: number;
  product_id: number | null;
  title: string;
  price: number | null;
  condition: string | null;
  status: "active" | "sold" | "removed";
  created_at: string;
  sold_at?: string | null;
  type: "single" | "pack" | "box";
  seller_user_id: string;
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

/** sparkline + volume bars + hover tooltip */
function Sparkline({
  values,
  volume,
  width = 420,
  height = 110,
  color = "rgba(148,163,184,0.95)",
}: {
  values: (number | null)[];
  volume: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const present = values.filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  if (present.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 14,
          border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.03)",
        }}
      />
    );
  }

  const min = Math.min(...present);
  const max = Math.max(...present);
  const range = max - min || 1;

  const pad = 10;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const n = Math.max(values.length, 2);

  const pts = values.map((v, i) => {
    const vv = v == null ? min : Number(v);
    const x = pad + (i * innerW) / (n - 1);
    const y = pad + (1 - (vv - min) / range) * innerH;
    return { x, y, v: vv, i };
  });

  const d = pts
    .map((p, i) =>
      i === 0
        ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
        : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    )
    .join(" ");

  const vMax = Math.max(...(volume.length ? volume : [0])) || 1;
  const band = innerW / Math.max(1, values.length);
  const barW = band * 0.75;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rel = Math.min(Math.max(x - pad, 0), innerW);
    const idx = Math.round((rel / innerW) * (values.length - 1));
    setHoverIdx(Number.isFinite(idx) ? idx : null);
  }
  function onLeave() {
    setHoverIdx(null);
  }

  const hover =
    hoverIdx == null
      ? null
      : pts[Math.min(Math.max(hoverIdx, 0), pts.length - 1)];

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
        padding: 10,
        position: "relative",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* volume bars */}
        {values.map((_, i) => {
          const x = pad + i * band;
          const h =
            (Number(volume[i] ?? 0) / vMax) * (innerH * 0.32);
          return (
            <rect
              key={`b-${i}`}
              x={x + (band - barW) / 2}
              y={pad + innerH - h}
              width={barW}
              height={h}
              rx={3}
              opacity={hoverIdx === i ? 0.65 : 0.35}
              fill={color}
            />
          );
        })}

        {/* line */}
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* hover marker */}
        {hover ? (
          <>
            <line
              x1={hover.x}
              y1={pad}
              x2={hover.x}
              y2={pad + innerH}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
            <circle cx={hover.x} cy={hover.y} r={4} fill={color} />
          </>
        ) : null}
      </svg>

      {/* tooltip */}
      {hover ? (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hover.x - 70, 8), width - 150),
            top: 8,
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "rgba(0,0,0,0.55)",
            color: "rgba(226,232,240,0.95)",
            fontSize: 12,
            pointerEvents: "none",
            width: 142,
          }}
        >
          <div style={{ fontWeight: 900 }}>${fmtMoney(hover.v)}</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            Sold: {volume[hover.i] ?? 0}
          </div>
        </div>
      ) : null}

      <div
        className="muted2"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <span>Low: ${fmtMoney(min)}</span>
        <span>High: ${fmtMoney(max)}</span>
      </div>
    </div>
  );
}

export default function MarketProductPage() {
  const params = useParams();
  const idStr = (params?.id as string) ?? "";
  const productId = Number(idStr);

  const [loading, setLoading] = useState(true);

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [sales, setSales] = useState<BreakerSalesRow | null>(null);
  const [active, setActive] = useState<ActiveListingsRow | null>(null);
  const [daily7d, setDaily7d] = useState<DailyMedianRow[]>([]);
  const [activeListings, setActiveListings] = useState<ListingRow[]>([]);
  const [soldListings, setSoldListings] = useState<ListingRow[]>([]);

  const dump = (label: string, e: any) => {
    if (!e) return;
    console.error(label, e);
    console.error(label + " message:", e.message);
    console.error(label + " details:", e.details);
    console.error(label + " hint:", e.hint);
    console.error(label + " code:", e.code);
  };

  async function load() {
    if (!Number.isFinite(productId)) return;

    setLoading(true);

    const [pRes, sRes, aRes, dRes, activeRes, soldRes] =
      await Promise.all([
        supabase
          .from("market_products")
          .select("id, type, name, brand, set_name, image_url, created_at")
          .eq("id", productId)
          .maybeSingle(),

        supabase
          .from("market_breaker_sales_7d")
          .select("*")
          .eq("product_id", productId)
          .maybeSingle(),

        supabase
          .from("market_active_listings_by_product")
          .select("*")
          .eq("product_id", productId)
          .maybeSingle(),

        supabase
          .from("market_breaker_daily_median_7d")
          .select("product_id, day, median_price, sold_count")
          .eq("product_id", productId)
          .order("day", { ascending: true }),

        // ✅ Client-safe listing reads (views)
        supabase
          .from("market_listings_public")
          .select(
            "id, product_id, title, price, condition, status, created_at, sold_at, type, seller_user_id"
          )
          .eq("status", "active")
          .eq("product_id", productId)
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("market_listings_public")
          .select(
            "id, product_id, title, price, condition, status, created_at, sold_at, type, seller_user_id"
          )
          .eq("status", "sold")
          .eq("product_id", productId)
          .order("sold_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    dump("PRODUCT ERROR", pRes.error);
    dump("SALES 7D ERROR", sRes.error);
    dump("ACTIVE BY PRODUCT ERROR", aRes.error);
    dump("DAILY 7D ERROR", dRes.error);
    dump("ACTIVE LISTINGS ERROR", activeRes.error);
    dump("SOLD LISTINGS ERROR", soldRes.error);

    setProduct((pRes.data ?? null) as ProductRow | null);
    setSales((sRes.data ?? null) as BreakerSalesRow | null);
    setActive((aRes.data ?? null) as ActiveListingsRow | null);
    setDaily7d((dRes.data ?? []) as DailyMedianRow[]);
    setActiveListings((activeRes.data ?? []) as ListingRow[]);
    setSoldListings((soldRes.data ?? []) as ListingRow[]);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const { priceSeries, volumeSeries } = useMemo(() => {
    const prices = daily7d.map((d) =>
      d.median_price == null ? null : Number(d.median_price)
    );
    const vols = daily7d.map((d) => Number(d.sold_count ?? 0));

    const pOut = [...prices];
    const vOut = [...vols];

    while (pOut.length < 7) pOut.unshift(null);
    while (vOut.length < 7) vOut.unshift(0);

    return {
      priceSeries: pOut.slice(-7),
      volumeSeries: vOut.slice(-7),
    };
  }, [daily7d]);

  const livePrice = useMemo(() => {
    if (sales?.sold_7d_median != null) return Number(sales.sold_7d_median);
    if (active?.active_median != null) return Number(active.active_median);
    return null;
  }, [sales, active]);

  const changePct =
    sales?.sold_7d_change_pct == null
      ? null
      : Number(sales.sold_7d_change_pct);
  const changeAbs =
    sales?.sold_7d_change_abs == null
      ? null
      : Number(sales.sold_7d_change_abs);

  if (!Number.isFinite(productId)) {
    return (
      <div className="card">
        <div className="cardBody">Invalid product id.</div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Link href="/market">
          <button className="btn">← Back to Market</button>
        </Link>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={load}>
            Refresh
          </button>

          <Link href="/trade">
            <button className="btn btnPrimary">View in Marketplace</button>
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cardBody" style={{ display: "grid", gap: 12 }}>
          {loading ? (
            <div className="muted">Loading…</div>
          ) : !product ? (
            <div className="muted">Product not found.</div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: product.image_url
                    ? "88px 1fr auto"
                    : "1fr auto",
                  gap: 14,
                  alignItems: "start",
                }}
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    style={{
                      width: 88,
                      height: 88,
                      objectFit: "cover",
                      borderRadius: 16,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  />
                ) : null}

                <div>
                  <div
                    style={{
                      fontWeight: 950,
                      fontSize: 28,
                      lineHeight: 1.1,
                    }}
                  >
                    {product.name}
                  </div>
                  <div className="muted2" style={{ marginTop: 10 }}>
                    <span className="pill">{pillForType(product.type)}</span>{" "}
                    {product.brand ? `• ${product.brand}` : ""}{" "}
                    {product.set_name ? `• ${product.set_name}` : ""}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div className="muted2">Live price</div>
                  <div
                    style={{
                      fontWeight: 950,
                      fontSize: 28,
                      marginTop: 6,
                    }}
                  >
                    {livePrice == null ? "—" : `$${fmtMoney(livePrice)}`}
                  </div>
                  <div
                    className="muted2"
                    style={{
                      marginTop: 6,
                      fontWeight: 900,
                      color: changeColor(changePct),
                    }}
                  >
                    {changePct == null
                      ? "7d: —"
                      : `7d: ${fmtSignedPct(changePct)}`}
                    {changeAbs == null
                      ? ""
                      : ` (${fmtSignedMoney(changeAbs)})`}
                  </div>
                </div>
              </div>

              <Sparkline
                values={priceSeries}
                volume={volumeSeries}
                color={changeColor(changePct)}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                  marginTop: 6,
                }}
              >
                <div
                  className="card"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="cardBody">
                    <div className="muted2">Sold (7d)</div>
                    <div
                      style={{
                        fontWeight: 950,
                        fontSize: 22,
                        marginTop: 6,
                      }}
                    >
                      {sales?.sold_7d_count ?? 0}
                    </div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      Median:{" "}
                      <b>
                        {sales?.sold_7d_median == null
                          ? "—"
                          : `$${fmtMoney(Number(sales.sold_7d_median))}`}
                      </b>
                    </div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      Low/High:{" "}
                      <b>
                        {sales?.sold_7d_low == null
                          ? "—"
                          : `$${fmtMoney(Number(sales.sold_7d_low))}`}{" "}
                        /{" "}
                        {sales?.sold_7d_high == null
                          ? "—"
                          : `$${fmtMoney(Number(sales.sold_7d_high))}`}
                      </b>
                    </div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      Last sold:{" "}
                      <b>
                        {sales?.last_sold_at
                          ? new Date(sales.last_sold_at).toLocaleString()
                          : "—"}
                      </b>
                    </div>
                  </div>
                </div>

                <div
                  className="card"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="cardBody">
                    <div className="muted2">Active listings</div>
                    <div
                      style={{
                        fontWeight: 950,
                        fontSize: 22,
                        marginTop: 6,
                      }}
                    >
                      {active?.active_count ?? 0}
                    </div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      Median:{" "}
                      <b>
                        {active?.active_median == null
                          ? "—"
                          : `$${fmtMoney(Number(active.active_median))}`}
                      </b>
                    </div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      Low:{" "}
                      <b>
                        {active?.active_low == null
                          ? "—"
                          : `$${fmtMoney(Number(active.active_low))}`}
                      </b>
                    </div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      Last listed:{" "}
                      <b>
                        {active?.last_listed_at
                          ? new Date(active.last_listed_at).toLocaleString()
                          : "—"}
                      </b>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Comps */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Active */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">For Sale Now</div>
            <div className="muted2" style={{ marginTop: 6 }}>
              Active listings on Breaker for this product.
            </div>
          </div>
          <div className="cardBody">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : activeListings.length === 0 ? (
              <div className="muted">No active listings yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {activeListings.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 850 }}>{l.title}</div>
                    <div className="muted2">
                      Price:{" "}
                      <b>
                        {l.price == null
                          ? "—"
                          : `$${fmtMoney(Number(l.price))}`}
                      </b>{" "}
                      {l.condition ? `• ${l.condition}` : ""}
                    </div>
                    <div className="muted2">
                      Posted: {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sold */}
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Recent Sold</div>
            <div className="muted2" style={{ marginTop: 6 }}>
              Most recent sold listings on Breaker for this product.
            </div>
          </div>
          <div className="cardBody">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : soldListings.length === 0 ? (
              <div className="muted">No sold comps yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {soldListings.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 850 }}>{l.title}</div>
                    <div className="muted2">
                      Sold:{" "}
                      <b>
                        {l.price == null
                          ? "—"
                          : `$${fmtMoney(Number(l.price))}`}
                      </b>{" "}
                      {l.condition ? `• ${l.condition}` : ""}
                    </div>
                    <div className="muted2">
                      Sold at:{" "}
                      {l.sold_at
                        ? new Date(l.sold_at).toLocaleString()
                        : new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardHeader">
          <div className="h2">Trade this item</div>
          <div className="muted2" style={{ marginTop: 6 }}>
            Post a listing or buy one now in the marketplace.
          </div>
        </div>
        <div
          className="cardBody"
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <Link href="/trade">
            <button className="btn btnPrimary">Open Marketplace</button>
          </Link>
          <Link href="/market">
            <button className="btn">Back to Market</button>
          </Link>
        </div>
      </div>
    </div>
  );
}