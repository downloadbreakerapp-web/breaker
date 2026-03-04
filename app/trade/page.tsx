import { Suspense } from "react";
import TradeClient from "./TradeClient";

export const dynamic = "force-dynamic";

export default function TradePage() {
  return (
    <Suspense fallback={<div className="muted">Loading…</div>}>
      <TradeClient />
    </Suspense>
  );
}