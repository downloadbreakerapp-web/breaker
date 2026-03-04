"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { safeGetUser, safeSignOut } from "@/lib/safeAuth";

type ListingType = "single" | "pack" | "box";

type MyListingRow = {
  id: number;
  type: ListingType;
  title: string;
  description: string | null;
  price: number | null;
  condition: string | null;
  status: "active" | "sold" | "removed";
  created_at: string;
  sold_at: string | null;
  product_id: number | null;
  buyer_user_id: string | null;

  product_name: string | null;
  product_brand: string | null;
  product_set_name: string | null;
  product_image_url: string | null;
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export default function MyListingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "sold" | "removed">("active");
  const [rows, setRows] = useState<MyListingRow[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const loadingRef = useRef(false);

  const dump = (label: string, e: any) => {
    if (!e) return;
    console.error(label, e);
    console.error(label + " message:", e.message);
    console.error(label + " details:", e.details);
    console.error(label + " hint:", e.hint);
    console.error(label + " code:", e.code);
  };

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    try {
      const { data: authData, error: authErr } = await safeGetUser();
      dump("MY LISTINGS authErr", authErr);

      const user = authData?.user;
      if (authErr || !user) {
        setRows([]);
        setMyUserId(null);
        router.push("/login");
        router.refresh();
        return;
      }

      setMyUserId(user.id);

      // ✅ RPC-only
      const { data, error } = await supabase.rpc("get_my_market_listings");
      dump("MY LISTINGS rpc error", error);

      if (error) {
        setRows([]);
        alert(errText(error));
        return;
      }

      setRows((data ?? []) as MyListingRow[]);
    } catch (e: any) {
      console.error("MY LISTINGS load crashed:", e);
      setRows([]);
      alert(e?.message ?? "Failed to load listings");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load();

    // reload on sign-in/sign-out/token refresh
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(load, 50);
    });

    return () => sub?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);

  async function removeListing(listingId: number) {
    const confirmed = confirm("Are you sure you want to remove this listing?");
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc("remove_my_listing", {
        p_listing_id: listingId,
      });

      dump("MY LISTINGS remove error", error);

      if (error) {
        alert(errText(error));
        return;
      }

      await load();
    } catch (e: any) {
      console.error("MY LISTINGS remove crashed:", e);
      alert(e?.message ?? "Failed to remove listing");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <div className="h1">My Listings</div>
          <div className="muted2">Manage your marketplace listings.</div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <Link href="/trade">
            <button className="btn" type="button">
              Back to Marketplace
            </button>
          </Link>

          <button className="btn" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button
          className={`btn ${tab === "active" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => setTab("active")}
        >
          Active
        </button>
        <button
          className={`btn ${tab === "sold" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => setTab("sold")}
        >
          Sold
        </button>
        <button
          className={`btn ${tab === "removed" ? "btnPrimary" : ""}`}
          type="button"
          onClick={() => setTab("removed")}
        >
          Removed
        </button>
      </div>

      <div className="card">
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="muted">No {tab} listings.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {filtered.map((l) => (
                <div
                  key={l.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{l.title}</div>

                    <div className="muted2" style={{ marginTop: 6 }}>
                      {l.type.toUpperCase()} •{" "}
                      {l.price == null ? "—" : `$${fmtMoney(Number(l.price))}`}
                      {l.condition ? ` • ${l.condition}` : ""}
                    </div>

                    {(l.product_name || l.product_brand || l.product_set_name) && (
                      <div className="muted2" style={{ marginTop: 6 }}>
                        {[l.product_brand, l.product_set_name, l.product_name]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    )}

                    <div className="muted2" style={{ marginTop: 6 }}>
                      Listed: {new Date(l.created_at).toLocaleString()}
                    </div>

                    {l.sold_at && (
                      <div className="muted2" style={{ marginTop: 6 }}>
                        Sold: {new Date(l.sold_at).toLocaleString()}
                      </div>
                    )}

                    <div style={{ marginTop: 8 }} className="row">
                      <Link
                        href={`/trade/${l.id}`}
                        style={{ textDecoration: "underline" }}
                      >
                        View listing
                      </Link>

                      {l.product_id && (
                        <Link
                          href={`/market/${l.product_id}`}
                          style={{
                            textDecoration: "underline",
                            marginLeft: 12,
                          }}
                        >
                          View product
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    {l.status === "active" ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => removeListing(l.id)}
                      >
                        Remove
                      </button>
                    ) : (
                      <div className="muted2">{l.status.toUpperCase()}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {myUserId && (
            <div className="muted2" style={{ marginTop: 16 }}>
              Signed in as: {myUserId}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}