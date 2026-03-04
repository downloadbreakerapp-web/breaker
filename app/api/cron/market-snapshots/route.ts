import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function okAuth(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allows local testing
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function pickTcgDexUsdMarketPrice(card: any): number | null {
  const tp = card?.pricing?.tcgplayer;
  if (!tp) return null;

  const candidates = [
    tp?.normal?.marketPrice,
    tp?.holo?.marketPrice,
    tp?.reverse?.marketPrice,
    tp?.normal?.midPrice,
    tp?.holo?.midPrice,
    tp?.reverse?.midPrice,
  ].filter((x: any) => typeof x === "number" && isFinite(x));

  return candidates.length ? Number(candidates[0]) : null;
}

function pickSportsCardsProPriceUSD(json: any): number | null {
  const pennies =
    json?.["loose-price"] ??
    json?.["cib-price"] ??
    json?.["graded-price"] ??
    json?.["new-price"];

  if (typeof pennies !== "number") return null;
  return pennies / 100;
}

export async function GET(req: Request) {
  if (!okAuth(req)) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // SERVER ONLY
  );

  const { data: products, error: pErr } = await supabase
    .from("market_products")
    .select("id, external_source, external_id, search_query")
    .not("external_source", "is", null);

  if (pErr) return new Response(`Products error: ${pErr.message}`, { status: 500 });
  if (!products?.length) return new Response("No mapped products", { status: 200 });

  let inserted = 0;
  const nowIso = new Date().toISOString();

  for (const p of products) {
    try {
      let price: number | null = null;
      let source: string | null = null;

      // Pokemon: TCGdex
      if (p.external_source === "tcgdex") {
        if (!p.external_id) continue;

        const url = `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(p.external_id)}`;
        const res = await fetch(url, { headers: { "user-agent": "breaker-market/1.0" } });
        if (!res.ok) continue;

        const card = await res.json();
        price = pickTcgDexUsdMarketPrice(card);
        source = "tcgdex";
      }

      // Sports: SportsCardsPro
      if (p.external_source === "sportscardspro") {
        const token = process.env.SPORTSCARDSPRO_TOKEN;
        if (!token) continue;

        const qp = p.external_id
          ? `id=${encodeURIComponent(p.external_id)}`
          : p.search_query
            ? `q=${encodeURIComponent(p.search_query)}`
            : null;

        if (!qp) continue;

        const url = `https://www.sportscardspro.com/api/product?t=${encodeURIComponent(token)}&${qp}`;
        const res = await fetch(url, { headers: { "user-agent": "breaker-market/1.0" } });
        if (!res.ok) continue;

        const json = await res.json();
        if (json?.status !== "success") continue;

        price = pickSportsCardsProPriceUSD(json);
        source = "sportscardspro";
      }

      if (price == null || !isFinite(price) || price <= 0) continue;

      const { error: iErr } = await supabase.from("market_price_snapshots").insert({
        product_id: p.id,
        price,
        source,
        captured_at: nowIso,
      });

      if (!iErr) inserted++;
    } catch {
      continue;
    }
  }

  return new Response(`OK inserted=${inserted}`, { status: 200 });
}