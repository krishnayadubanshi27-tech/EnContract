import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  ChartPie,
  FolderKanban,
  ListChecks,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Splash } from "@/components/Splash";
import { UploadDropzone } from "@/components/UploadDropzone";
import { WorkspacePickerModal } from "@/components/WorkspacePickerModal";
import { Badge, Button } from "@/components/ui";
import { useAuth } from "@/services/auth";
import { contractStore } from "@/services/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EnContract — Your own contract and compliance manager" },
      {
        name: "description",
        content:
          "Drop in a contract PDF and get an AI risk analysis, clause breakdown, compliance checklist, and deadline tracking — organized in your own workspaces.",
      },
      { property: "og:title", content: "EnContract — Your own contract and compliance manager" },
      {
        property: "og:description",
        content:
          "Drop in a contract PDF and get an AI risk analysis, clause breakdown, compliance checklist, and deadline tracking — organized in your own workspaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI document analysis",
    text: "Every uploaded PDF is read end-to-end and summarized into plain language with an overall risk score.",
  },
  {
    icon: ChartPie,
    title: "Risk & clause charts",
    text: "Pie and bar views split clauses into positive impacts and risks — green for good, red for danger.",
  },
  {
    icon: ListChecks,
    title: "Compliance checklist",
    text: "Standard checks for your contract type — governing law, liability caps, data protection — marked pass, attention, or fail.",
  },
  {
    icon: CalendarClock,
    title: "Deadlines & renewals",
    text: "Renewal windows, notice periods, expiries and payment milestones extracted automatically.",
  },
  {
    icon: Bot,
    title: "AI assistant",
    text: "A chat copilot that has read your contract: recommendations, next steps, and risk warnings on demand.",
  },
  {
    icon: FolderKanban,
    title: "Workspaces",
    text: "Organize contracts by client, vendor, or deal. Add, rename, and remove files whenever you like.",
  },
];

const WHY_POINTS = [
  {
    title: "Catch risk before you sign",
    text: "Red-flag clauses surface immediately — unlimited liability, auto-renewals, one-sided termination — instead of after the dispute.",
  },
  {
    title: "Never miss a renewal again",
    text: "Every date-driven obligation is pulled out of the fine print and listed in one place.",
  },
  {
    title: "Compliance without the checklist fatigue",
    text: "The standard checks for each contract type run automatically on every upload.",
  },
  {
    title: "Your contracts, organized your way",
    text: "Workspaces keep vendor, client, and internal agreements separated and searchable.",
  },
];

function LandingPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Returning from sign-in with a stashed upload: reopen the picker.
  useEffect(() => {
    if (!ready || !user) return;
    const meta = contractStore.getPendingMeta();
    if (meta) {
      setPendingName(meta.name);
      setPickerOpen(true);
    }
  }, [ready, user]);

  const handleFile = async (file: File) => {
    if (!user) {
      try {
        await contractStore.stashPendingFile(file);
        toast.info("Sign in to save and analyze your PDF.");
        navigate({ to: "/auth", search: { redirect: "/" } });
      } catch {
        toast.error("Could not stage the file locally. Please sign in first, then upload.");
        navigate({ to: "/auth", search: { redirect: "/" } });
      }
      return;
    }
    setPendingFile(file);
    setPendingName(file.name);
    setPickerOpen(true);
  };

  const handlePickWorkspace = async (choice: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const workspaceId = choice.startsWith("new:")
        ? contractStore.createWorkspace(choice.slice(4)).id
        : choice;

      let blob: Blob | null = pendingFile;
      let name = pendingName ?? "Contract.pdf";
      if (!blob) {
        const pending = await contractStore.takePendingFile();
        if (!pending) {
          toast.error("The staged file expired — please pick the PDF again.");
          setPickerOpen(false);
          return;
        }
        blob = pending.file;
        name = pending.name;
      }

      const title = name.replace(/\.[^/.]+$/, "");
      const contract = await contractStore.addContract({ workspaceId, file: blob, title });
      toast.success(`Saved to workspace — analyzing “${contract.title}”.`);
      setPickerOpen(false);
      setPendingFile(null);
      setPendingName(null);
      navigate({ to: "/contract/$id", params: { id: contract.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Splash />

      {/* Header */}
      <header className="glass-strong sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex flex-col">
            <Logo />
            <span className="mt-0.5 hidden text-[11px] leading-none text-muted-foreground sm:block">
              your own contract and compliance manager
            </span>
          </div>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Sections">
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#why-us"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Why use us?
            </a>
            <Link
              to="/ai-assistant"
              className="text-sm text-primary transition-colors hover:text-primary/80 font-medium"
            >
              AI Assistant
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {!mounted || !ready ? (
              <div className="h-9 w-28 rounded-lg bg-secondary/50" aria-hidden />
            ) : user ? (
              <Link to="/dashboard">
                <Button>
                  Enter Workspace
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/auth" search={{ redirect: "/dashboard" }}>
                <Button>
                  Sign in
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 45% at 50% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <Badge className="mx-auto mb-5" tone="positive">
            <ShieldCheck className="size-3.5" />
            AI-powered contract intelligence
          </Badge>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
            Understand every contract
            <br />
            <span className="text-primary">before you sign it</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Upload a PDF and EnContract reads it for you — risks in red, wins in green, deadlines
            extracted, and an AI assistant that answers your questions.
          </p>
          <div className="mt-10 animate-rise">
            <UploadDropzone onFile={(f) => void handleFile(f)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">
            Your files stay in your browser for now — no demo documents, nothing is uploaded until
            you connect your own backend.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Features
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything between “we got a contract” and “we know exactly what we’re signing”.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="glass group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-105">
                  <f.icon className="size-5" strokeWidth={1.9} />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why use us */}
      <section id="why-us" className="scroll-mt-20 border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Why use us?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Contracts are written to be hard to read. EnContract is built to make them hard to
              misunderstand.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="glass rounded-2xl p-4">
                <p className="font-display text-3xl font-bold text-primary">30s</p>
                <p className="mt-1 text-xs text-muted-foreground">from upload to full risk brief</p>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="font-display text-3xl font-bold text-primary">100%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  of deadlines extracted, not skimmed
                </p>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="font-display text-3xl font-bold text-risk">0</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  red flags left hiding in clause 14(b)
                </p>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="font-display text-3xl font-bold text-foreground">∞</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  questions the AI assistant will answer
                </p>
              </div>
            </div>
          </div>
          <ul className="space-y-4">
            {WHY_POINTS.map((p, i) => (
              <li
                key={p.title}
                className="glass flex gap-4 rounded-2xl p-5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 font-display text-sm font-bold text-primary ring-1 ring-primary/20">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <Zap className="mx-auto size-8 text-primary" />
          <h2 className="mt-4 font-display text-2xl font-bold text-foreground sm:text-3xl">
            Drop in a contract. Know where you stand.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Upload your first PDF and get a full compliance brief in under a minute.
          </p>
          <a href="#top" className="mt-6 inline-block">
            <Button
              className="px-6 py-2.5"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <UploadCloud className="size-4" />
              Upload a contract
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p>EnContract — your own contract and compliance manager. Not legal advice.</p>
        </div>
      </footer>

      <WorkspacePickerModal
        open={pickerOpen}
        fileName={pendingName}
        onClose={() => {
          setPickerOpen(false);
          setPendingFile(null);
          setPendingName(null);
        }}
        onPick={(choice) => void handlePickWorkspace(choice)}
      />
    </div>
  );
}
