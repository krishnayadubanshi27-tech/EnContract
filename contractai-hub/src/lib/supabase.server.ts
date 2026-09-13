/**
 * Supabase server utilities — SERVER-ONLY.
 *
 * Uses @supabase/server and @supabase/supabase-js with SUPABASE_SECRET_KEY,
 * SUPABASE_URL, and SUPABASE_JWKS_URL to verify requests, perform server-side
 * privileged actions, and manage resources securely.
 */
import { createAdminClient, createContextClient, verifyAuth } from "@supabase/server/core";
import type { SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export const SUPABASE_URL =
  env("SUPABASE_URL") ||
  env("VITE_SUPABASE_URL") ||
  env("NEXT_PUBLIC_SUPABASE_URL") ||
  "https://qqmtpizpukqrxwezlfea.supabase.co";

export const SUPABASE_SECRET_KEY = env("SUPABASE_SECRET_KEY");
export const SUPABASE_PUBLISHABLE_KEY =
  env("SUPABASE_PUBLISHABLE_KEY") ||
  env("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
  "sb_publishable_JhzqMEIsQ6x6kZW0QAf02A_Ww5B_1ox";
export const SUPABASE_JWKS_URL =
  env("SUPABASE_JWKS_URL") || `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

export const isSupabaseServerEnabled = Boolean(
  SUPABASE_URL && (SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY),
);

/**
 * Creates an admin client that bypasses RLS (service role).
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseServerEnabled) return null;
  try {
    return createAdminClient();
  } catch (err) {
    console.warn("[supabase.server] Could not create admin client:", err);
    return null;
  }
}

/**
 * Creates a client scoped to a user's JWT token (respects RLS).
 */
export function getSupabaseUserClient(jwtToken?: string): SupabaseClient | null {
  if (!isSupabaseServerEnabled) return null;
  try {
    return createContextClient(jwtToken ? { auth: { token: jwtToken } } : undefined);
  } catch (err) {
    console.warn("[supabase.server] Could not create context client:", err);
    return null;
  }
}

/**
 * Verifies the auth state of an incoming HTTP Request.
 */
export async function verifySupabaseRequest(req: Request) {
  try {
    return await verifyAuth(req, { auth: "user" });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Returns diagnostic details about Supabase server configuration.
 */
export function describeSupabaseServerStatus() {
  return {
    enabled: isSupabaseServerEnabled,
    url: SUPABASE_URL,
    hasSecretKey: Boolean(SUPABASE_SECRET_KEY && !SUPABASE_SECRET_KEY.includes("••")),
    hasPublishableKey: Boolean(
      SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes("••"),
    ),
    jwksUrl: SUPABASE_JWKS_URL,
  };
}
