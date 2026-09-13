import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  FileSearch,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Mail,
  PenLine,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { CategoryBars, ImpactPie, RiskGauge } from "@/components/charts";
import { ChatPanel } from "@/components/ChatPanel";
import { Badge, Button, Card, Modal } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/format";
import { aiService } from "@/services/ai";
import { contractStore, useContracts, useWorkspaces } from "@/services/store";
import {
  QUICK_ACTIONS,
  QUICK_ACTION_LABELS,
  type ComplianceItem,
  type QuickAction,
} from "@/services/types";

export const Route = createFileRoute("/_authenticated/contract/$id")({
  head: () => ({
    meta: [
      { title: "Contract Analysis — EnContract" },
      {
        name: "description",
        content:
          "AI contract analysis: risk score, clause charts, compliance checklist, deadlines, and an AI assistant that has read the document.",
      },
      { property: "og:title", content: "Contract Analysis — EnContract" },
      {
        property: "og:description",
        content:
          "AI contract analysis: risk score, clause charts, compliance checklist, deadlines, and an AI assistant that has read the document.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractPage,
});

const ACTION_ICONS: Record<QuickAction, typeof Mail> = {
  nda_sent: Mail,
  sign_pending: PenLine,
  renewal_pending: CalendarClock,
};

function complianceIcon(status: ComplianceItem["status"]) {
  if (status === "pass") return <CheckCircle2 className="size-4 shrink-0 text-positive" />;
  if (status === "attention") return <CircleAlert className="size-4 shrink-0 text-neutral-chart" />;
  return <TriangleAlert className="size-4 shrink-0 text-risk" />;
}

function ContractPage() {
  const { id } = Route.useParams();
  const contracts = useContracts();
  const workspaces = useWorkspaces();
  const contract = contracts.find((c) => c.id === id);
  const workspace = workspaces.find((w) => w.id === contract?.workspaceId);

  const [step, setStep] = useState<"extract" | "analyze">("extract");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const runningRef = useRef(false);

  const analysis = contract?.analysis;
  const takenActions = Object.keys(contract?.actions ?? {}) as QuickAction[];

  // Determine file type
  const fileExt = contract?.fileKey.split(".").pop()?.toLowerCase() || "pdf";
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(fileExt);
  const isPdf = fileExt === "pdf";
  const isWord = ["docx", "doc"].includes(fileExt);

  // Load preview URL when preview modal is opened
  useEffect(() => {
    let active = true;
    if (previewOpen && contract) {
      contractStore.getContractFile(contract.id).then((blob) => {
        if (active && blob) {
          const url = URL.createObjectURL(blob);
          setFileUrl(url);
        }
      });
    }
    return () => {
      active = false;
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [previewOpen, contract]);

  useEffect(() => {
    if (!contract) return;
    if (contract.status === "analyzed" && contract.analysis) return;
    if (contract.status === "analysis_failed") return;
    if (runningRef.current) return;
    runningRef.current = true;

    const run = async () => {
      contractStore.setContractStatus(id, "analyzing");
      try {
        setStep("extract");
        let text = contract.text;
        if (!text) {
          const blob = await contractStore.getContractFile(id);
          if (!blob) throw new Error("The uploaded document could not be found in storage.");
          text = await aiService.extractText(blob, contract.fileKey);
          contractStore.setContractText(id, text);
        }
        setStep("analyze");
        const analysisResult = await aiService.analyze(contract.title, text);
        contractStore.setContractAnalysis(id, {
          ...analysisResult,
          analyzedAt: new Date().toISOString(),
        });
        toast.success("AI Document analysis complete.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Analysis failed.";
        setErrorMessage(msg);
        contractStore.setContractStatus(id, "analysis_failed");
        toast.error(msg);
      } finally {
        runningRef.current = false;
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, contract?.status, contract?.analysis]);

  if (!contract) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Document not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been removed or belongs to a different user session.
          </p>
          <Link to="/dashboard" className="mt-6 inline-block">
            <Button variant="outline">
              <ArrowLeft className="size-4" />
              Back to workspaces
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const retry = () => {
    contractStore.setContractStatus(id, "uploaded");
  };

  const markAction = (action: QuickAction) => {
    contractStore.markAction(id, action);
    toast.success(`Marked: ${QUICK_ACTION_LABELS[action]}`);
  };

  const handleDownload = async () => {
    const blob = await contractStore.getContractFile(contract.id);
    if (!blob) {
      toast.error("File not available for download.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contract.title}.${fileExt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          to="/workspace/$id"
          params={{ id: contract.workspaceId }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {workspace?.name ?? "Workspace"}
        </Link>

        {/* Title + quick actions */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {contract.title}
              </h1>
              <Badge tone="neutral" className="uppercase text-xs font-semibold">
                {fileExt}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatBytes(contract.size)} · added {formatDate(contract.createdAt)}
              {analysis && ` · analyzed ${formatDate(analysis.analyzedAt)}`}
            </p>
            {takenActions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {takenActions.map((a) => (
                  <Badge key={a} tone="positive">
                    {QUICK_ACTION_LABELS[a]} · {formatDate(contract.actions[a]!)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="size-4" />
              View Document
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <Download className="size-4" />
              Download
            </Button>
            {QUICK_ACTIONS.map((qa) => {
              const Icon = ACTION_ICONS[qa.id];
              const taken = !!contract.actions[qa.id];
              return (
                <Button
                  key={qa.id}
                  variant={taken ? "ghost" : "outline"}
                  disabled={taken}
                  onClick={() => markAction(qa.id)}
                  className={taken ? "text-positive" : undefined}
                >
                  <Icon className="size-4" />
                  {taken ? QUICK_ACTION_LABELS[qa.id] : qa.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        {contract.status === "analyzing" || (contract.status === "uploaded" && !analysis) ? (
          <Card className="mt-8 flex flex-col items-center gap-4 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25 animate-glow-pulse">
              <FileSearch className="size-7" />
            </span>
            <h2 className="font-display text-lg font-semibold text-foreground">
              {step === "extract"
                ? `Extracting text from your ${fileExt.toUpperCase()} document…`
                : "AI Ollama model is analyzing the document…"}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {step === "extract"
                ? "Parsing paragraphs, clauses, and text content."
                : "Calculating risk score, checking compliance rules, and extracting deadlines."}
            </p>
            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: step === "extract" ? "35%" : "75%" }}
              />
            </div>
          </Card>
        ) : contract.status === "analysis_failed" ? (
          <Card className="mt-8 flex flex-col items-center gap-4 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-risk/12 text-risk ring-1 ring-risk/25">
              <TriangleAlert className="size-7" />
            </span>
            <h2 className="font-display text-lg font-semibold text-foreground">
              The analysis didn't complete
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {errorMessage ||
                "This can happen if the Ollama local AI server is starting up or processing a heavy file. Your document is saved safely in the cloud."}
            </p>
            <Button onClick={retry}>
              <RefreshCw className="size-4" />
              Retry analysis
            </Button>
          </Card>
        ) : analysis ? (
          <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_360px]">
            {/* Bento analysis grid */}
            <div className="grid content-start gap-5 sm:grid-cols-2">
              <Card className="sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Executive Summary
                  </h2>
                </div>
                <p className="mt-3 leading-relaxed text-foreground">{analysis.summary}</p>
              </Card>

              {/* Risk Gauge */}
              <Card>
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Overall Risk Score
                </h2>
                <div className="mt-4">
                  <RiskGauge score={analysis.riskScore} />
                </div>
              </Card>

              {/* Impact Pie / Donut Chart */}
              <Card>
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Clause Impact Distribution
                </h2>
                <div className="mt-2">
                  <ImpactPie clauses={analysis.clauses} />
                </div>
              </Card>

              {/* Positive vs Risk Category Bar Chart */}
              <Card className="sm:col-span-2">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Clause Categories: Protections vs. Risks
                </h2>
                <div className="mt-2">
                  <CategoryBars clauses={analysis.clauses} />
                </div>
              </Card>

              {/* Compliance Checklist */}
              <Card>
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Compliance Checklist
                  </h2>
                </div>
                <ul className="mt-3 space-y-3">
                  {analysis.compliance.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      {complianceIcon(item.status)}
                      <div>
                        <p className="font-medium text-foreground">{item.item}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Deadlines & Key Milestones */}
              <Card>
                <div className="flex items-center gap-2">
                  <CalendarX2 className="size-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Deadlines &amp; Renewals
                  </h2>
                </div>
                {analysis.deadlines.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No explicit date-driven obligations found in this document.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {analysis.deadlines.map((d, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{d.label}</p>
                          <p className="text-xs capitalize text-muted-foreground">{d.kind}</p>
                        </div>
                        <Badge tone="neutral" className="shrink-0">
                          {formatDate(d.date)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Actionable Suggestions & Recommendations */}
              <Card className="sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Effective AI Suggestions &amp; Next Steps
                  </h2>
                </div>
                <ol className="mt-3 space-y-2.5">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/12 font-display text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-foreground">{rec}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            {/* AI Assistant Chat Panel */}
            <div className="lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
              <ChatPanel contract={contract} />
            </div>
          </div>
        ) : (
          <Card className="mt-8 flex flex-col items-center gap-4 py-16 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <Button onClick={retry}>Start AI Analysis</Button>
          </Card>
        )}
      </main>

      {/* Multi-Format Document Preview Modal */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`Document Preview — ${contract.title}`}
        wide
      >
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-card p-4">
          {isImage && fileUrl ? (
            <div className="flex justify-center">
              <img
                src={fileUrl}
                alt={contract.title}
                className="max-h-[60vh] rounded-md object-contain shadow-md"
              />
            </div>
          ) : isPdf && fileUrl ? (
            <iframe
              src={fileUrl}
              title={contract.title}
              className="h-[60vh] w-full rounded-md border-0"
            />
          ) : contract.text ? (
            <div className="space-y-4 font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
              <div className="flex items-center gap-2 border-b border-border pb-2 font-sans font-medium text-muted-foreground">
                <FileText className="size-4 text-primary" />
                <span>Extracted Document Content ({fileExt.toUpperCase()})</span>
              </div>
              {contract.text}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading document preview…
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
