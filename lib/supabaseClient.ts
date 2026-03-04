import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function getSupabaseEnvStatus() {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    ok: missing.length === 0,
    missing,
    supabaseUrlPreview: supabaseUrl ? `${supabaseUrl.slice(0, 28)}...` : "",
    anonKeyPreview: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 10)}...` : "",
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (input, init) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const mergedInit: RequestInit = { ...init, signal: controller.signal };
      return fetch(input, mergedInit).finally(() => clearTimeout(timeout));
    },
  },
});