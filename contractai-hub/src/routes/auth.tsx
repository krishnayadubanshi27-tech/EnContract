import { useState } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { KeyRound, Mail, Phone, UserPlus, LogIn } from "lucide-react";
import { OTPInput, type SlotProps } from "input-otp";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/services/auth";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => {
    const redirect = search["redirect"];
    return { redirect: typeof redirect === "string" ? redirect : undefined };
  },
  head: () => ({
    meta: [
      { title: "Sign In or Sign Up — EnContract" },
      {
        name: "description",
        content:
          "Sign in or create an account to analyze contracts and documents with AI and manage your workspaces.",
      },
      { property: "og:title", content: "Sign in or Sign up — EnContract" },
      {
        property: "og:description",
        content:
          "Sign in to access your uploaded documents, contracts, and AI compliance insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
      />
    </svg>
  );
}

function OtpSlot(props: SlotProps) {
  return (
    <div
      className={`grid size-11 place-items-center rounded-lg border bg-background/60 text-lg font-semibold text-foreground transition-colors ${
        props.isActive ? "border-ring ring-1 ring-ring" : "border-input"
      }`}
    >
      {props.char ??
        (props.hasFakeCaret ? <span className="animate-pulse text-primary">|</span> : null)}
    </div>
  );
}

function AuthPage() {
  const { user, ready, signInWithEmail, signInWithGoogle, describeBackend } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dest = redirect && redirect !== "/auth" && redirect !== "/" ? redirect : "/dashboard";

  if (ready && user) {
    return <Navigate to={dest} />;
  }

  const destination = () => navigate({ to: dest });
  const backend = describeBackend();

  const submitEmail = async () => {
    if (mode === "signup" && !name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const displayName = name.trim() || email.split("@")[0] || "User";
      await signInWithEmail(displayName, email);
      toast.success(
        mode === "signup"
          ? `Welcome to EnContract, ${displayName}!`
          : `Welcome back, ${displayName}! Accessing your saved documents.`,
      );
      destination();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    setSubmitting(true);
    try {
      const u = await signInWithGoogle();
      toast.success(`Welcome, ${u.name}!`);
      destination();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const backendNotice =
    backend.kind === "supabase"
      ? "Supabase is active — accounts, contracts, and files sync to the cloud."
      : "This provider activates once Supabase is configured. For now, email sign-in works in local-only mode (see docs/backend-api.md).";
  const phoneNotice =
    backend.kind === "supabase"
      ? "Phone sign-in needs an SMS provider wired to Supabase Authentication (e.g. Twilio / MessageBird via Supabase Phone Auth)."
      : "SMS delivery needs your own backend with an SMS provider (e.g. Twilio). The OTP flow below is ready to wire up.";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex flex-col items-center gap-1">
          <Logo markClassName="size-11 rounded-xl" className="[&>span:last-child]:text-2xl" />
          <span className="text-xs text-muted-foreground">
            your own contract and compliance manager
          </span>
        </Link>

        <div className="glass-strong animate-rise rounded-2xl p-6">
          {/* Mode toggle: Sign Up vs Sign In */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-secondary/60 p-1">
            <button
              onClick={() => setMode("signup")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                mode === "signup"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="size-4 text-primary" />
              New User (Sign Up)
            </button>
            <button
              onClick={() => setMode("signin")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                mode === "signin"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="size-4 text-primary" />
              Existing User (Sign In)
            </button>
          </div>

          <h1 className="font-display text-xl font-semibold text-foreground">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Sign up to analyze Word, PDF, and PNG documents with AI."
              : "Sign in to access all your previously uploaded documents."}
          </p>

          <Button
            variant="outline"
            className="mt-6 w-full py-2.5"
            onClick={() => void submitGoogle()}
            disabled={submitting}
          >
            <GoogleMark />
            {submitting
              ? "Connecting…"
              : mode === "signup"
                ? "Sign up with Google"
                : "Sign in with Google"}
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-secondary/50 p-1">
            <button
              onClick={() => setMethod("email")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                method === "email"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="size-3.5" />
              Email
            </button>
            <button
              onClick={() => setMethod("phone")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                method === "phone"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Phone className="size-3.5" />
              Phone number
            </button>
          </div>

          {method === "email" ? (
            <div className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="mb-1 block text-xs font-medium text-muted-foreground"
                  >
                    Your full name
                  </label>
                  <Input
                    id="auth-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    autoComplete="name"
                  />
                </div>
              )}
              <div>
                <label
                  htmlFor="auth-email"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Email address
                </label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === "Enter" && submitEmail()}
                />
              </div>
              <Button
                className="w-full py-2.5"
                onClick={() => void submitEmail()}
                disabled={submitting}
              >
                {submitting
                  ? "Processing…"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in & access documents"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="auth-phone"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Phone number
                </label>
                <Input
                  id="auth-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </div>
              {!otpSent ? (
                <Button
                  className="w-full py-2.5"
                  disabled={phone.trim().length < 8}
                  onClick={() => {
                    setOtpSent(true);
                    toast.info(backendNotice);
                  }}
                >
                  <KeyRound className="size-4" />
                  Send OTP
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                    {phoneNotice}
                  </div>
                  <div className="flex justify-center">
                    <OTPInput
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      containerClassName="flex gap-2"
                      render={({ slots }) => (
                        <>
                          {slots.map((slot, i) => (
                            <OtpSlot key={i} {...slot} />
                          ))}
                        </>
                      )}
                    />
                  </div>
                  <Button
                    className="w-full py-2.5"
                    disabled={otp.length !== 6}
                    onClick={() => toast.info(backendNotice)}
                  >
                    Verify OTP
                  </Button>
                  <button
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                    }}
                  >
                    Use a different number
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground/70">
          {backend.kind === "supabase"
            ? `Connected to Supabase Server — accounts and documents are saved safely in the cloud.`
            : "Local session mode — your documents and workspaces live in this browser."}
        </p>
      </div>
    </div>
  );
}
