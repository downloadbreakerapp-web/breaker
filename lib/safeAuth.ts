import { supabase } from "@/lib/supabaseClient";

export async function safeGetSession() {
  try {
    return await supabase.auth.getSession(); // ✅ returns { session: null } when logged out
  } catch (e: any) {
    return { data: { session: null }, error: e };
  }
}

export async function safeGetUser() {
  // Only call getUser if session exists
  const s = await safeGetSession();
  const access_token = s.data.session?.access_token;
  if (!access_token) return { data: { user: null }, error: null };

  try {
    return await supabase.auth.getUser(access_token);
  } catch (e: any) {
    return { data: { user: null }, error: e };
  }
}

export async function safeSignOut() {
  try {
    await supabase.auth.signOut();
  } catch {}
}