import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BLOCKED = [
  "/market",
  "/trade",
  "/my",
  "/break",
  "/breaks",
  "/host",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow Next internal + static
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/auth/callback")
  ) {
    return NextResponse.next();
  }

  // block old app routes
  for (const p of BLOCKED) {
    if (pathname === p || pathname.startsWith(p + "/")) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};