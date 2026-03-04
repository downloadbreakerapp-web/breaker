"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PurchaseRow = {
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
  seller_username: string | null;
};

type ReviewRow = {
  id: number;
  transaction_id: number;
  reviewer_id: string;
  reviewed_user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
};

export default function MyPurchasesPage() {
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [myReviewsByTx, setMyReviewsByTx] = useState<Map<number, ReviewRow>>(new Map());

  const [reviewTxId, setReviewTxId] = useState<number | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [body, setBody] = useState<string>("");

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
    const txRes = await supabase
      .from("my_market_purchases")
      .select("transaction_id, listing_id, seller_user_id, buyer_user_id, price, fee_rate, fee_amount, payout_amount, created_at, title, type, product_id, seller_username")
      .order("created_at", { ascending: false });

    if (txRes.error) {
      alert(txRes.error.message);
      setLoading(false);
      return;
    }

    const data = (txRes.data ?? []) as PurchaseRow[];
    setRows(data);

    // reviews
    const txIds = data.map((r) => r.transaction_id);
    if (txIds.length > 0) {
      const rRes = await supabase
        .from("market_reviews")
        .select("id, transaction_id, reviewer_id, reviewed_user_id, rating, body, created_at")
        .in("transaction_id", txIds)
        .eq("reviewer_id", uid);

      if (!rRes.error && rRes.data) {
        const m = new Map<number, ReviewRow>();
        for (const r of rRes.data as any[]) m.set(r.transaction_id, r);
        setMyReviewsByTx(m);
      } else {
        setMyReviewsByTx(new Map());
      }
    } else {
      setMyReviewsByTx(new Map());
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const gross = rows.reduce((s, r) => s + Number(r.price ?? 0), 0);
    const fees = rows.reduce((s, r) => s + Number(r.fee_amount ?? 0), 0);
    return { gross, fees };
  }, [rows]);

  async function openReview(txId: number) {
    setReviewTxId(txId);
    const existing = myReviewsByTx.get(txId);
    if (existing) {
      setRating(existing.rating);
      setBody(existing.body ?? "");
    } else {
      setRating(5);
      setBody("");
    }
  }

  async function submitReview() {
    if (!reviewTxId) return;
    if (!me) {
      alert("Please sign in.");
      router.push("/login");
      return;
    }

    const { error } = await supabase.rpc("create_market_review", {
      p_transaction_id: reviewTxId,
      p_rating: rating,
      p_body: body,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Review saved!");
    setReviewTxId(null);
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 980, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">My Purchases</div>
          <div className="muted2">Your completed marketplace buys.</div>
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
        <>
          <div className="card">
            <div className="cardBody" style={{ display: "grid", gap: 12 }}>
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div className="pill">Total spent: <b>${fmtMoney(totals.gross)}</b></div>
                <div className="pill">Marketplace fees (2%): <b>${fmtMoney(totals.fees)}</b></div>
              </div>

              {loading ? (
                <div className="muted">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="muted">No purchases yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {rows.map((r) => {
                    const myReview = myReviewsByTx.get(r.transaction_id);

                    return (
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
                          Seller: <b>@{r.seller_username ?? "user"}</b> • {new Date(r.created_at).toLocaleString()}
                        </div>

                        <div className="muted2">
                          Fee: <b>${fmtMoney(Number(r.fee_amount ?? 0))}</b> (2%)
                        </div>

                        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                          <Link href={`/trade/${r.listing_id}`}>
                            <button className="btn">Open listing</button>
                          </Link>

                          <button className={`btn ${myReview ? "" : "btnPrimary"}`} onClick={() => openReview(r.transaction_id)}>
                            {myReview ? `Edit review (⭐ ${myReview.rating})` : "Leave a review"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {reviewTxId ? (
            <div className="card">
              <div className="cardHeader">
                <div className="h2">Review</div>
                <button className="btn" onClick={() => setReviewTxId(null)}>
                  Close
                </button>
              </div>
              <div className="cardBody" style={{ display: "grid", gap: 10 }}>
                <div className="muted2">Rating (1–5)</div>
                <input className="input" type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} />

                <div className="muted2">Comment (optional)</div>
                <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />

                <div style={{ textAlign: "right" }}>
                  <button className="btn btnPrimary" onClick={submitReview}>
                    Save review
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}