"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SaleRow = {
  transaction_id: number;
  listing_id: number;
  seller_user_id: string;
  buyer_user_id: string;
  price: number;
  fee_rate: number;
  fee_amount: number;
  payout_amount: number;
  created_at: string;

  title: string | null;
  type: string | null;
  product_id: number | null;
  buyer_username: string | null;
};

export default function MySalesPage() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState<SaleRow[]>([]);

  function fmtMoney(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function load() {
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;
    setMe(uid);

    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    // ✅ PRODUCTION: read from user-scoped view
    const res = await supabase
      .from("my_market_sales")
      .select("transaction_id, listing_id, seller_user_id, buyer_user_id, price, fee_rate, fee_amount, payout_amount, created_at, title, type, product_id, buyer_username")
      .order("created_at", { ascending: false });

    if (res.error) {
      alert(res.error.message);
      setLoading(false);
      return;
    }

    setRows((res.data ?? []) as SaleRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const gross = rows.reduce((s, r) => s + Number(r.price ?? 0), 0);
    const fees = rows.reduce((s, r) => s + Number(r.fee_amount ?? 0), 0);
    const payout = rows.reduce((s, r) => s + Number(r.payout_amount ?? 0), 0);
    return { gross, fees, payout };
  }, [rows]);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 980, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">My Sales</div>
          <div className="muted2">Your completed marketplace sales.</div>
        </div>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      {!me ? (
        <div className="card">
          <div className="cardBody">
            Please <Link href="/login">sign in</Link>.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="cardBody" style={{ display: "grid", gap: 12 }}>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <div className="pill">Gross sales: <b>${fmtMoney(totals.gross)}</b></div>
              <div className="pill">Fees (2%): <b>${fmtMoney(totals.fees)}</b></div>
              <div className="pill">Your payout: <b>${fmtMoney(totals.payout)}</b></div>
            </div>

            {loading ? (
              <div className="muted">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="muted">No sales yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {rows.map((r) => (
                  <div
                    key={r.transaction_id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      padding: 14,
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>{r.title ?? `Listing #${r.listing_id}`}</div>
                      <div className="pill">${fmtMoney(Number(r.price ?? 0))}</div>
                    </div>

                    <div className="muted2">
                      Buyer: <b>@{r.buyer_username ?? "user"}</b> • {new Date(r.created_at).toLocaleString()}
                    </div>

                    <div className="muted2">
                      Fee: <b>${fmtMoney(Number(r.fee_amount ?? 0))}</b> • Payout: <b>${fmtMoney(Number(r.payout_amount ?? 0))}</b>
                    </div>

                    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/trade/${r.listing_id}`}>
                        <button className="btn">Open listing</button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}