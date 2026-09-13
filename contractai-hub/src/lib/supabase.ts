/**
 * Supabase client SDK configuration.
 *
 * Uses the VITE_SUPABASE_* / SUPABASE_* env vars exposed by Vite to the browser.
 * If the required keys are not set, `isSupabaseEnabled` reports false and the
 * app falls back to local storage (localStorage + IndexedDB + local auth) transparently.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string | undefined {
  return (
    (import.meta.env?.[name] as string | undefined) ??
    (typeof process !== "undefined"
      ? ((process as unknown as { env: Record<string, string | undefined> }).env[name] as
          string | undefined)
      : undefined)
  );
}

export const SUPABASE_URL =
  env("VITE_SUPABASE_URL") ||
  env("NEXT_PUBLIC_SUPABASE_URL") ||
  env("SUPABASE_URL") ||
  "https://qqmtpizpukqrxwezlfea.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  env("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
  env("SUPABASE_PUBLISHABLE_KEY") ||
  env("VITE_SUPABASE_ANON_KEY") ||
  env("SUPABASE_ANON_KEY") ||
  "sb_publishable_JhzqMEIsQ6x6kZW0QAf02A_Ww5B_1ox";

export const isSupabaseEnabled = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes("••"),
);

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseEnabled) return null;
  if (cachedClient) return cachedClient;
  try {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.warn("[supabase] Failed to initialize Supabase client:", err);
    cachedClient = null;
  }
  return cachedClient;
}

export const supabase = getSupabaseClient();

/**
 * Diagnostics helper. Returns a summary of Supabase config status.
 * Never logs sensitive secrets.
 */
export function describeSupabaseStatus(): {
  enabled: boolean;
  url?: string;
  hasKey: boolean;
} {
  return {
    enabled: isSupabaseEnabled,
    url: SUPABASE_URL,
    hasKey: Boolean(SUPABASE_PUBLISHABLE_KEY),
  };
}
