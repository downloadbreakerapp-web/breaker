import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Prelaunch gate:
 * - If NEXT_PUBLIC_PRELAUNCH === "1", only allow a small set of routes.
 * - Everything else redirects to "/".
 *
 * This is NOT security (client-only). This is just a prelaunch UX lock.
 * Real security still comes from RLS + RPC on the DB.
 */

const ALLOWED_PREFIXES = [
  "/", // our prelaunch homepage
  "/login",
  "/auth", // supabase callback routes if you have them
  "/api",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export function middleware(req: NextRequest) {
  const prelaunch = process.env.NEXT_PUBLIC_PRELAUNCH === "1";
  if (!prelaunch) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Allow exact "/" and any allowed prefixes
  const allowed =
    pathname === "/" ||
    ALLOWED_PREFIXES.some((p) => (p !== "/" ? pathname.startsWith(p) : false));

  // Also allow static assets
  if (pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map)$/)) {
    return NextResponse.next();
  }

  if (allowed) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("locked", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"], // run on all routes except files; we also explicitly allow assets above
};