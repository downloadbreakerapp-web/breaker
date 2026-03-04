"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ListingType = "single" | "pack" | "box";

type PublicListingRow = {
  id: number;
  seller_user_id: string;
  buyer_user_id: string | null;
  type: ListingType;
  title: string;
  description: string | null;
  price: number | null;
  condition: string | null;
  status: "active" | "sold" | "removed";
  product_id: number | null;
  sold_at: string | null;
  created_at: string;
  seller_username: string | null;
};

type MarketProductRow = {
  id: number;
  type: ListingType;
  name: string;
  brand: string | null;
  set_name: string | null;
  image_url: string | null;
  created_at: string;
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pillForType(t: ListingType) {
  if (t === "box") return "Box";
  if (t === "pack") return "Pack";
  return "Single";
}

function errText(error: any) {
  return (
    error?.message ||
    error?.details ||
    error?.hint ||
    error?.code ||
    (typeof error === "string" ? error : JSON.stringify(error))
  );
}

export default function TradeListingPage() {
  const params = useParams();
  const router = useRouter();
  const idStr = (params?.id as string) ?? "";
  const listingId = Number(idStr);

  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  const [listing, setListing] = useState<PublicListingRow | null>(null);
  const [product, setProduct] = useState<MarketProductRow | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  async function load() {
    if (!Number.isFinite(listingId)) return;

    setLoading(true);

    const lRes = await supabase
      .from("market_listings_public")
      .select("id, seller_user_id, buyer_user_id, type, title, description, price, condition, status, product_id, sold_at, created_at, seller_username")
      .eq("id", listingId)
      .maybeSingle();

    if (lRes.error) {
      alert(errText(lRes.error));
      setListing(null);
      setProduct(null);
      setLoading(false);
      return;
    }

    const l = (lRes.data ?? null) as PublicListingRow | null;
    setListing(l);

    if (l?.product_id) {
      const pRes = await supabase
        .from("market_products")
        .select("id, type, name, brand, set_name, image_url, created_at")
        .eq("id", l.product_id)
        .maybeSingle();

      if (pRes.error) {
        console.warn("product load:", pRes.error);
        setProduct(null);
      } else {
        setProduct((pRes.data ?? null) as MarketProductRow | null);
      }
    } else {
      setProduct(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const feeRate = 0.02;

  const canBuy = useMemo(() => {
    if (!listing) return false;
    if (listing.status !== "active") return false;
    if (listing.buyer_user_id) return false;
    if (myUserId && listing.seller_user_id === myUserId) return false;
    if (buying) return false;
    return true;
  }, [listing, myUserId, buying]);

  function buyButtonText() {
    if (!listing) return "Buy Now";
    if (buying) return "Buying…";
    if (listing.status !== "active" || listing.buyer_user_id) return "Not Available";
    if (myUserId && listing.seller_user_id === myUserId) return "Your Listing";
    return "Buy Now";
  }

  async function buy() {
    if (!listing) return;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      alert("Please sign in to buy.");
      router.push("/login");
      return;
    }

    if (!canBuy) return;

    setBuying(true);

    const { error } = await supabase.rpc("buy_listing_atomic", {
      p_listing_id: listing.id,
    });

    setBuying(false);

    if (error) {
      alert(errText(error));
      await load();
      return;
    }

    // refresh local UI in case the user stays
    await load();

    alert("Purchased!");
    router.push("/my/purchases");
  }

  if (!Number.isFinite(listingId)) {
    return (
      <div className="card">
        <div className="cardBody">Invalid listing id.</div>
      </div>
    );
  }

  const price = listing?.price == null ? null : Number(listing.price);
  const estFee = price == null ? null : Math.round(price * feeRate * 100) / 100;
  const estPayout = price == null || estFee == null ? null : Math.round((price - estFee) * 100) / 100;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Link href="/trade">
          <button className="btn">← Back to Marketplace</button>
        </Link>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={load}>
            Refresh
          </button>

          {listing?.product_id && (
            <Link href={`/market/${listing.product_id}`}>
              <button className="btn">View Product</button>
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : !listing ? (
            <div className="muted">Listing not found.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 950, fontSize: 26 }}>{listing.title}</div>

                <div className="muted2">
                  <span className="pill">{pillForType(listing.type)}</span>
                  {listing.condition ? ` • ${listing.condition}` : ""}
                </div>

                <div className="muted2">
                  Seller: <b>@{listing.seller_username ?? "user"}</b>
                </div>

                <div style={{ fontWeight: 950, fontSize: 28 }}>
                  {listing.price == null ? "—" : `$${fmtMoney(Number(listing.price))}`}
                </div>

                {price != null ? (
                  <div className="muted2">
                    Marketplace fee: <b>2%</b> (est. fee: <b>${fmtMoney(estFee ?? 0)}</b> · seller payout: <b>${fmtMoney(estPayout ?? 0)}</b>)
                  </div>
                ) : null}

                <button className={`btn ${canBuy ? "btnPrimary" : ""}`} disabled={!canBuy} onClick={buy}>
                  {buyButtonText()}
                </button>

                {!canBuy && listing.status !== "active" ? <div className="muted2">This listing has already been sold or removed.</div> : null}

                {listing.description ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 900 }}>Description</div>
                    <div className="muted2" style={{ marginTop: 6 }}>
                      {listing.description}
                    </div>
                  </div>
                ) : null}
              </div>

              {product ? (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontWeight: 900 }}>Product</div>
                  <div className="muted2" style={{ marginTop: 6 }}>
                    {product.name}
                    {product.brand ? ` • ${product.brand}` : ""}
                    {product.set_name ? ` • ${product.set_name}` : ""}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}