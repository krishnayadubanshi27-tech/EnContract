import { createServerClient, type CookieOptions } from "@supabase/ssr";

function getEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  return undefined;
}

const supabaseUrl =
  getEnv("NEXT_PUBLIC_SUPABASE_URL") ||
  getEnv("SUPABASE_URL") ||
  getEnv("VITE_SUPABASE_URL") ||
  "https://qqmtpizpukqrxwezlfea.supabase.co";

const supabaseKey =
  getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
  getEnv("SUPABASE_PUBLISHABLE_KEY") ||
  getEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  "sb_publishable_JhzqMEIsQ6x6kZW0QAf02A_Ww5B_1ox";

export interface CookieStoreLike {
  getAll: () => { name: string; value: string }[];
  set?: (name: string, value: string, options?: CookieOptions) => void;
}

export const createClient = (cookieStore?: CookieStoreLike) => {
  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return cookieStore?.getAll() ?? [];
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore?.set?.(name, value, options)
            );
          } catch {
            // Handled or ignored in server contexts
          }
        },
      },
    },
  );
};

