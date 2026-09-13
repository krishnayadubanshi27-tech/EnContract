import { createBrowserClient } from "@supabase/ssr";

function getEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  if (typeof import.meta !== "undefined" && (import.meta as unknown as { env?: Record<string, string> }).env?.[name]) {
    return (import.meta as unknown as { env: Record<string, string> }).env[name];
  }
  return undefined;
}

const supabaseUrl =
  getEnv("NEXT_PUBLIC_SUPABASE_URL") ||
  getEnv("VITE_SUPABASE_URL") ||
  getEnv("SUPABASE_URL") ||
  "https://qqmtpizpukqrxwezlfea.supabase.co";

const supabaseKey =
  getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
  getEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  getEnv("SUPABASE_PUBLISHABLE_KEY") ||
  "sb_publishable_JhzqMEIsQ6x6kZW0QAf02A_Ww5B_1ox";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );

