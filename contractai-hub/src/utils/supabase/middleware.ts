import { createServerClient } from "@supabase/ssr";

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

export const createClient = (request: Request) => {
  const cookiesHeader = request.headers.get("cookie") ?? "";
  const cookiePairs = cookiesHeader.split(";").map((p) => p.trim()).filter(Boolean);
  const cookies = cookiePairs.map((pair) => {
    const [name, ...rest] = pair.split("=");
    return { name: name || "", value: decodeURIComponent(rest.join("=")) };
  });

  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return cookies;
        },
        setAll(_cookiesToSet) {
          // Can be attached to response headers in HTTP middleware
        },
      },
    },
  );
};

