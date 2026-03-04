"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetUser, safeSignOut } from "@/lib/safeAuth";

type ListingType = "single" | "pack" | "box";

type MarketProductRow = {
  id: number;
  type: ListingType;
  name: string;
  brand: string | null;
  set_name: string | null;
  image_url: string | null;
  created_at: string;
};

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

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pillForType(t: ListingType) {
  if (t === "box") return "Box";
  if (t === "pack") return "Pack";
  return "Single";
}

function typeLabel(t: ListingType) {
  if (t === "box") return "Box";
  if (t === "pack") return "Pack";
  return "Single";
}

export default function TradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const productIdParam = searchParams.get("productId");
  const productIdFilter = productIdParam ? Number(productIdParam) : null;
  const hasProductFilter =
    Number.isFinite(productIdFilter as any) && Number(productIdFilter) > 0;

  const [tab, setTab] = useState<"browse" | "sell">("browse");

  const [productsLoading, setProductsLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(true);

  const [products, setProducts] = useState<MarketProductRow[]>([]);
  const [listings, setListings] = useState<PublicListingRow[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ListingType>("all");

  // Sell form
  const [sellType, setSellType] = useState<ListingType>("single");
  const [sellProductId, setSellProductId] = useState<number>(0);
  const [sellTitle, setSellTitle] = useState("");
  const [sellDesc, setSellDesc] = useState("");
  const [sellPrice, setSellPrice] = useState<string>("");
  const [sellCondition, setSellCondition] = useState("");
  const [posting, setPosting] = useState(false);

  const productsLoadingRef = useRef(false);
  const listingsLoadingRef = useRef(false);

  const dump = (label: string, e: any) => {
    if (!e) return;
    console.error(label, e);
    console.error(label + " message:", e.message);
    console.error(label + " details:", e.details);
    console.error(label + " hint:", e.hint);
    console.error(label + " code:", e.code);
  };

  useEffect(() => {
    if (hasProductFilter) setTab("browse");
  }, [productIdParam, hasProductFilter]);

  async function loadProducts() {
    if (productsLoadingRef.current) return;
    productsLoadingRef.current = true;

    setProductsLoading(true);
    try {
      const { data, error } = await supabase
        .from("market_products")
        .select("id, type, name, brand, set_name, image_url, created_at")
        .order("created_at", { ascending: false });

      dump("TRADE loadProducts", error);

      if (error) {
        setProducts([]);
        return;
      }

      setProducts((data as MarketProductRow[]) ?? []);
    } catch (e: any) {
      console.error("TRADE loadProducts crashed:", e);
      setProducts([]);
    } finally {
      setProductsLoading(false);
      productsLoadingRef.current = false;
    }
  }

  async function loadListings() {
    if (listingsLoadingRef.current) return;
    listingsLoadingRef.current = true;

    setListingsLoading(true);
    try {
      // ✅ PRODUCTION: read from SAFE view
      let q = supabase
        .from("market_listings_public")
        .select(
          "id, seller_user_id, buyer_user_id, type, title, description, price, condition, status, product_id, sold_at, created_at, seller_username"
        )
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (hasProductFilter) {
        q = q.eq("product_id", Number(productIdFilter));
      }

      const { data, error } = await q;
      dump("TRADE loadListings", error);

      if (error) {
        setListings([]);
        return;
      }

      setListings((data as PublicListingRow[]) ?? []);
    } catch (e: any) {
      console.error("TRADE loadListings crashed:", e);
      setListings([]);
    } finally {
      setListingsLoading(false);
      listingsLoadingRef.current = false;
    }
  }

  useEffect(() => {
    loadProducts();
    loadListings();

    // reload on sign-in/sign-out/token refresh
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        loadProducts();
        loadListings();
      }, 50);
    });

    return () => sub?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdParam]);

  const productLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products) {
      const label = `${p.name}${p.brand ? ` • ${p.brand}` : ""}${
        p.set_name ? ` • ${p.set_name}` : ""
      }`;
      m.set(p.id, label);
    }
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      const matchesType = typeFilter === "all" ? true : l.type === typeFilter;
      const matchesSearch = !q
        ? true
        : `${l.title} ${l.description ?? ""}`.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [listings, search, typeFilter]);

  const productOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = products;

    let byType = all.filter((p) => p.type === sellType);
    if (byType.length === 0) byType = all;
    if (!q) return byType;

    const scored = byType
      .map((p) => {
        const label = `${p.name} ${p.brand ?? ""} ${p.set_name ?? ""}`.toLowerCase();
        const score = label.includes(q) ? 1 : 0;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.map((x) => x.p);
  }, [products, sellType, search]);

  function resetSellForm() {
    setSellType("single");
    setSellProductId(0);
    setSellTitle("");
    setSellDesc("");
    setSellPrice("");
    setSellCondition("");
  }

  async function createListing() {
    const { data: authData, error: authErr } = await safeGetUser();
    const user = authData?.user;

    if (authErr || !user) {
      alert("Please sign in first.");
      router.push("/login");
      router.refresh();
      return;
    }

    if (!sellProductId) {
      alert("Please select a product.");
      return;
    }

    const priceNum = Number(sellPrice);
    if (!sellTitle.trim()) {
      alert("Please enter a title.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      alert("Please enter a valid price greater than 0.");
      return;
    }

    setPosting(true);
    try {
      const { error } = await supabase.from("market_listings").insert({
        seller_user_id: user.id,
        type: sellType,
        title: sellTitle.trim(),
        description: sellDesc.trim() || null,
        price: priceNum,
        condition: sellCondition.trim() || null,
        status: "active",
        product_id: sellProductId,
        flagged: false,
      });

      dump("TRADE createListing", error);

      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes("row-level security"))
          alert("Posting blocked (RLS). Check your insert policy.");
        else alert(error.message);
        return;
      }

      alert("Listing posted!");
      resetSellForm();
      await loadListings();
      setTab("browse");
    } catch (e: any) {
      console.error("TRADE createListing crashed:", e);
      alert(e?.message ?? "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="h1">Marketplace</div>
        <div className="muted2" style={{ marginTop: 6 }}>
          Browse listings or post your own.
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <Link href="/my/listings">
            <button className="btn" type="button">
              My Listings
            </button>
          </Link>

          <Link href="/my/purchases">
            <button className="btn" type="button">
              My Purchases
            </button>
          </Link>

          <Link href="/my/sales">
            <button className="btn" type="button">
              My Sales
            </button>
          </Link>

          <button className="btn" type="button" onClick={loadListings}>
            Refresh Listings
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 12 }}>
        <button
          className={`btn ${tab === "browse" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => setTab("browse")}
        >
          Browse
        </button>
        <button
          className={`btn ${tab === "sell" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => setTab("sell")}
        >
          Sell
        </button>
      </div>

      {tab === "browse" ? (
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Browse listings</div>
          </div>
          <div className="cardBody" style={{ display: "grid", gap: 10 }}>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                placeholder="Search listings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: 240 }}
              />

              <select
                className="input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                style={{ minWidth: 160 }}
              >
                <option value="all">All types</option>
                <option value="single">Singles</option>
                <option value="pack">Packs</option>
                <option value="box">Boxes</option>
              </select>

              {hasProductFilter ? (
                <button className="btn" type="button" onClick={() => router.push("/trade")}>
                  Clear product filter
                </button>
              ) : null}
            </div>

            {listingsLoading ? (
              <div className="muted">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="muted">No listings found.</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 12,
                }}
              >
                {filtered.map((l) => (
                  <Link key={l.id} href={`/trade/${l.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        padding: 14,
                        background: "rgba(255,255,255,0.04)",
                        display: "grid",
                        gap: 10,
                        cursor: "pointer",
                      }}
                    >
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>{l.title}</div>
                        <div className="pill">
                          ${l.price ? fmtMoney(Number(l.price)) : "—"}
                        </div>
                      </div>

                      <div className="muted2">
                        <span className="pill">{pillForType(l.type)}</span>
                        {l.product_id
                          ? ` • ${productLabelById.get(l.product_id) ?? `Product #${l.product_id}`}`
                          : ""}
                        {l.condition ? ` • ${l.condition}` : ""}
                      </div>

                      <div className="muted2">
                        Seller: <b>@{l.seller_username ?? "user"}</b>
                      </div>

                      <div className="muted2">View details →</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="cardHeader">
            <div className="h2">Post a listing</div>
          </div>

          <div className="cardBody" style={{ display: "grid", gap: 10 }}>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
                <div className="muted2" style={{ fontWeight: 900 }}>
                  Type
                </div>
                <select
                  className="input"
                  value={sellType}
                  onChange={(e) => {
                    const t = e.target.value as ListingType;
                    setSellType(t);
                    setSellProductId(0);
                  }}
                >
                  <option value="single">{typeLabel("single")}</option>
                  <option value="pack">{typeLabel("pack")}</option>
                  <option value="box">{typeLabel("box")}</option>
                </select>
              </div>

              <div style={{ display: "grid", gap: 6, minWidth: 340, flex: 1 }}>
                <div className="muted2" style={{ fontWeight: 900 }}>
                  Product
                </div>
                <select
                  className="input"
                  value={sellProductId}
                  onChange={(e) => setSellProductId(Number(e.target.value))}
                  disabled={productsLoading}
                >
                  <option value={0}>
                    {productsLoading ? "Loading products..." : "Select a product"}
                  </option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.brand ? ` • ${p.brand}` : ""}
                      {p.set_name ? ` • ${p.set_name}` : ""}
                      {p.type ? ` (${p.type})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div className="muted2" style={{ fontWeight: 900 }}>
                Title
              </div>
              <input
                className="input"
                placeholder="Example: 2023 Prizm Blaster Box"
                value={sellTitle}
                onChange={(e) => setSellTitle(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div className="muted2" style={{ fontWeight: 900 }}>
                Description (optional)
              </div>
              <textarea
                className="input"
                placeholder="Add details: what's included, why it's special, shipping notes, etc."
                value={sellDesc}
                onChange={(e) => setSellDesc(e.target.value)}
                rows={4}
              />
            </div>

            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
                <div className="muted2" style={{ fontWeight: 900 }}>
                  Price (USD)
                </div>
                <input
                  className="input"
                  placeholder="e.g. 39.99"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gap: 6, minWidth: 220, flex: 1 }}>
                <div className="muted2" style={{ fontWeight: 900 }}>
                  Condition (optional)
                </div>
                <input
                  className="input"
                  placeholder="e.g. Sealed, Near Mint, Light wear"
                  value={sellCondition}
                  onChange={(e) => setSellCondition(e.target.value)}
                />
              </div>
            </div>

            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btn btnPrimary"
                type="button"
                onClick={createListing}
                disabled={posting}
              >
                {posting ? "Posting..." : "Post Listing"}
              </button>

              <button className="btn" type="button" onClick={resetSellForm} disabled={posting}>
                Clear
              </button>

              <div className="muted2" style={{ marginLeft: "auto" }}>
                Marketplace fee: <b>2%</b> is applied at checkout (buyer pays price, seller payout = price - fee).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}