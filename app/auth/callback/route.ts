import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Supabase handles token exchange on client in most setups,
  // but keeping a dedicated callback route is still good for redirects.
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/profile";
  return NextResponse.redirect(new URL(next, url.origin));
}