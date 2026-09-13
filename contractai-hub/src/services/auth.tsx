/**
 * AuthService — hybrid Supabase Auth + graceful local fallback.
 *
 * When Supabase keys are configured, the sign-in methods use Supabase Auth
 * (email authentication + Google OAuth) and automatically persist sessions.
 * When Supabase is offline or in local mode, session state persists reliably
 * in localStorage so the user remains logged in across refreshes and page transitions.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "./types";
import { describeSupabaseStatus, getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

const SESSION_KEY = "encontract:session";
const PLACEHOLDER_PWD_SALT = "EnContract_Auth_2026";

export interface AuthService {
  getUser(): UserProfile | null;
  signInWithEmail(name: string, email: string): Promise<UserProfile>;
  signInWithGoogle(): Promise<UserProfile>;
  signOut(): Promise<void>;
  /**
   * Subscribes to auth state changes.
   */
  onAuthStateChange(cb: (user: UserProfile | null) => void): () => void;
  /** Returns a short diagnostic about which auth backend is active. */
  describeBackend(): { kind: "supabase" | "local"; details: unknown };
}

function toProfile(user: User | null): UserProfile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    typeof meta["name"] === "string"
      ? meta["name"]
      : typeof meta["full_name"] === "string"
        ? meta["full_name"]
        : user.email?.split("@")[0] || "Anonymous";
  const avatarUrl =
    typeof meta["avatar_url"] === "string"
      ? meta["avatar_url"]
      : typeof meta["picture"] === "string"
        ? meta["picture"]
        : undefined;

  const profile: UserProfile = {
    id: user.id,
    name,
    email: user.email ?? `${user.id}@unknown.local`,
    createdAt: user.created_at || new Date().toISOString(),
  };
  if (avatarUrl) {
    profile.avatarUrl = avatarUrl;
  }
  return profile;
}

class SupabaseAuthService implements AuthService {
  private localUser: UserProfile | null = null;
  private listeners = new Set<(user: UserProfile | null) => void>();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        this.localUser = raw ? (JSON.parse(raw) as UserProfile) : null;
      } catch {
        this.localUser = null;
      }
    }
    this.setupSupabaseListener();
  }

  private notifyListeners() {
    this.listeners.forEach((l) => {
      try {
        l(this.localUser);
      } catch (err) {
        console.warn("[auth] Error in auth listener:", err);
      }
    });
  }

  private syncProfileToSupabase(profile: UserProfile | null) {
    if (!profile) return;
    const client = getSupabaseClient();
    if (!client || !isSupabaseEnabled) return;
    void Promise.resolve(
      client
        .from("profiles")
        .upsert({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          avatar_url: profile.avatarUrl,
        }),
    )
      .then((res) => {
        if (res && "error" in res && res.error) {
          console.warn("[auth] Profile sync notice:", res.error.message);
        }
      })
      .catch(() => {});
  }

  private setupSupabaseListener() {
    const client = getSupabaseClient();
    if (!client) return;

    // Listen to Supabase auth events
    client.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const profile = toProfile(session.user);
        this.localUser = profile;
        if (typeof window !== "undefined" && profile) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
        }
        this.syncProfileToSupabase(profile);
        this.notifyListeners();
      } else if (event === "SIGNED_OUT") {
        this.localUser = null;
        if (typeof window !== "undefined") {
          localStorage.removeItem(SESSION_KEY);
        }
        this.notifyListeners();
      } else if (event === "INITIAL_SESSION") {
        if (session?.user) {
          const profile = toProfile(session.user);
          this.localUser = profile;
          if (typeof window !== "undefined" && profile) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
          }
          this.syncProfileToSupabase(profile);
          this.notifyListeners();
        }
        // If session is null on INITIAL_SESSION, preserve the localStorage user if one exists
      }
    });
  }

  getUser(): UserProfile | null {
    if (!this.localUser && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        this.localUser = raw ? (JSON.parse(raw) as UserProfile) : null;
      } catch {
        this.localUser = null;
      }
    }
    return this.localUser;
  }

  async signInWithEmail(name: string, email: string): Promise<UserProfile> {
    const client = getSupabaseClient();
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedName = name.trim() || cleanedEmail.split("@")[0] || "User";
    const fallbackPassword = `${cleanedEmail}_${PLACEHOLDER_PWD_SALT}`;

    if (!client) {
      return this.signInWithEmailLocal(cleanedName, cleanedEmail);
    }

    try {
      // 1. Try sign up with Supabase Auth
      const { data: signUpData, error: signUpErr } = await client.auth.signUp({
        email: cleanedEmail,
        password: fallbackPassword,
        options: {
          data: {
            name: cleanedName,
          },
        },
      });

      let supaUser = signUpData?.user;

      // 2. If user already registered or email exists, sign in with password
      if (
        signUpErr &&
        (signUpErr.message.includes("already registered") ||
          signUpErr.message.includes("already in use") ||
          signUpErr.status === 422 ||
          signUpErr.status === 400)
      ) {
        const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
          email: cleanedEmail,
          password: fallbackPassword,
        });

        if (signInErr) {
          console.warn("[auth] Supabase sign-in fallback to local:", signInErr.message);
          return this.signInWithEmailLocal(cleanedName, cleanedEmail);
        }
        supaUser = signInData.user;
      } else if (signUpErr) {
        console.warn("[auth] Supabase sign-up fallback to local:", signUpErr.message);
        return this.signInWithEmailLocal(cleanedName, cleanedEmail);
      }

      if (!supaUser) {
        return this.signInWithEmailLocal(cleanedName, cleanedEmail);
      }

      const profile = toProfile(supaUser)!;
      if (cleanedName && profile.name !== cleanedName) {
        profile.name = cleanedName;
      }

      this.localUser = profile;
      if (typeof window !== "undefined") {
        localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      }
      this.notifyListeners();
      return profile;
    } catch (err) {
      console.warn("[auth] Supabase email auth error, using local:", err);
      return this.signInWithEmailLocal(cleanedName, cleanedEmail);
    }
  }

  private signInWithEmailLocal(name: string, email: string): UserProfile {
    const user: UserProfile = {
      id: crypto.randomUUID(),
      name: name.trim() || "User",
      email: email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }
    this.localUser = user;
    this.notifyListeners();
    return user;
  }

  async signInWithGoogle(): Promise<UserProfile> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        "Google sign-in requires Supabase. Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.",
      );
    }
    try {
      const redirectUrl =
        typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined;

      const options: { redirectTo?: string } = {};
      if (redirectUrl) options.redirectTo = redirectUrl;

      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options,
      });

      if (error) {
        throw new Error(error.message);
      }

      return (
        this.localUser || {
          id: crypto.randomUUID(),
          name: "Google User",
          email: "google.user@example.com",
          createdAt: new Date().toISOString(),
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg);
    }
  }

  async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch {
        /* continue clearing local session */
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(SESSION_KEY);
    }
    this.localUser = null;
    this.notifyListeners();
  }

  onAuthStateChange(cb: (user: UserProfile | null) => void): () => void {
    this.listeners.add(cb);
    // Immediately notify subscriber of current status
    cb(this.getUser());
    return () => {
      this.listeners.delete(cb);
    };
  }

  describeBackend(): { kind: "supabase" | "local"; details: unknown } {
    const enabled = isSupabaseEnabled;
    return {
      kind: enabled ? "supabase" : "local",
      details: describeSupabaseStatus(),
    };
  }
}

export const authService: AuthService = new SupabaseAuthService();

interface AuthContextValue {
  user: UserProfile | null;
  /** False until the session has been read from storage / Supabase. */
  ready: boolean;
  signInWithEmail: (name: string, email: string) => Promise<UserProfile>;
  signInWithGoogle: () => Promise<UserProfile>;
  signOut: () => Promise<void>;
  describeBackend: () => { kind: "supabase" | "local"; details: unknown };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => authService.getUser());
  const [ready, setReady] = useState(true);
  const unsubRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    unsubRef.current = authService.onAuthStateChange((u) => {
      setUser(u);
      setReady(true);
    });
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    ready,
    signInWithEmail: authService.signInWithEmail.bind(authService),
    signInWithGoogle: authService.signInWithGoogle.bind(authService),
    signOut: authService.signOut.bind(authService),
    describeBackend: authService.describeBackend.bind(authService),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
