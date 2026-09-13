import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  ChevronDown,
  Eraser,
  FileCheck,
  FileText,
  FolderOpen,
  Paperclip,
  RefreshCw,
  SendHorizonal,
  Sparkles,
  StopCircle,
  UploadCloud,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button, Card } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { aiService, type RevealCallback } from "@/services/ai";
import {
  contractStore,
  useContracts,
  useGeneralChatMessages,
  useWorkspaces,
} from "@/services/store";
import type { GeneralChatMessage, OllamaStatus } from "@/services/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-assistant")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AI Assistant — EnContract" },
      {
        name: "description",
        content:
          "Chat with EnContract's local AI assistant about contracts, compliance, negotiation strategy, and legal questions — all powered by your own Ollama model with full access to your uploaded documents.",
      },
      { property: "og:title", content: "AI Assistant — EnContract" },
      {
        property: "og:description",
        content:
          "Chat with EnContract's local AI assistant with direct document fetching and analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiAssistantPage,
});

const DEFAULT_SUGGESTIONS = [
  "What's the difference between an NDA and a confidentiality agreement?",
  "Help me draft a short termination clause for a SaaS contract",
  "What red flags should I look for in a vendor MSA?",
  "Explain limitation of liability like I'm not a lawyer",
  "Give me 5 negotiation tips for a software license",
  "What compliance risks should I audit in a contract?",
];

const DOCUMENT_SUGGESTIONS = [
  "Summarize all my uploaded contracts and key obligations",
  "Which of my uploaded documents has the highest risk score?",
  "Audit compliance rules across my agreements",
  "Extract all renewal dates and notice deadlines from my contracts",
  "Compare liability and termination terms across my documents",
  "Are there any indemnification or IP risks in my uploaded contracts?",
];

function AiAssistantPage() {
  const messages = useGeneralChatMessages();
  const contracts = useContracts();
  const workspaces = useWorkspaces();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string>("all");
  const [uploading, setUploading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const s = await aiService.getStatus();
      setStatus(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({
        ok: false,
        baseUrl: "unknown",
        modelCount: 0,
        activeModel: null,
        error: msg,
      });
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, sending, streamingId]);

  // Build document knowledge base context for Ollama
  const buildDocumentContext = (): string => {
    if (contracts.length === 0) return "";

    if (selectedDocId !== "all") {
      const c = contracts.find((doc) => doc.id === selectedDocId);
      if (!c) return "";
      const ext = c.fileKey.split(".").pop()?.toUpperCase() || "PDF";
      return `TARGET DOCUMENT SELECTED: "${c.title}"
Format: ${ext}
Status: ${c.status}
Risk Score: ${c.analysis?.riskScore ?? "Pending"}/100
Executive Summary:
${c.analysis?.summary ?? "Not yet generated"}

Key Clauses Identified:
${
  c.analysis?.clauses
    .map((cl) => `- [${cl.category}] ${cl.title} (${cl.impact}): ${cl.note}`)
    .join("\n") ?? "None"
}

Compliance Checklist:
${
  c.analysis?.compliance
    .map((comp) => `- [${comp.status.toUpperCase()}] ${comp.item}: ${comp.detail}`)
    .join("\n") ?? "None"
}

Deadlines & Expiration:
${c.analysis?.deadlines.map((d) => `- ${d.label} (${d.kind}): ${d.date}`).join("\n") ?? "None"}

Recommendations:
${c.analysis?.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n") ?? "None"}

FULL EXTRACTED DOCUMENT TEXT:
---
${c.text ? c.text.slice(0, 18000) : "(Document text not yet extracted)"}
---`;
    }

    // "All" documents knowledge base
    return contracts
      .map((c, idx) => {
        const ext = c.fileKey.split(".").pop()?.toUpperCase() || "DOC";
        const risk =
          c.analysis?.riskScore !== undefined ? `${c.analysis.riskScore}/100` : "Pending";
        const summary = c.analysis?.summary || "Summary pending";
        const clauses =
          c.analysis?.clauses
            .slice(0, 5)
            .map((cl) => `${cl.title} (${cl.impact})`)
            .join("; ") || "None";
        const snippet = c.text ? c.text.slice(0, 3500) : "";

        return `[DOCUMENT ${idx + 1}: "${c.title}" | Format: ${ext} | Risk: ${risk}]
Summary: ${summary}
Clauses: ${clauses}
Excerpt:
${snippet}`;
      })
      .join("\n\n====================\n\n");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Find or create workspace
    let ws = workspaces[0];
    if (!ws) {
      ws = contractStore.createWorkspace("My Documents");
    }

    setUploading(true);
    toast.info(`Extracting text from ${file.name}…`);

    try {
      const text = await aiService.extractText(file, file.name);
      const contract = await contractStore.addContract({
        workspaceId: ws.id,
        file,
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      contractStore.setContractText(contract.id, text);

      setSelectedDocId(contract.id);
      toast.success(
        `Added "${file.name}" to Ollama knowledge base! Asking a question will now reference it.`,
      );

      // Trigger automatic background analysis if not already analyzed
      void aiService
        .analyze(contract.title, text)
        .then((res) => {
          contractStore.setContractAnalysis(contract.id, {
            ...res,
            analyzedAt: new Date().toISOString(),
          });
        })
        .catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse document.";
      toast.error(`Document upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async (rawContent?: string) => {
    const content = (rawContent ?? draft).trim();
    if (!content || sending) return;
    setDraft("");
    setSending(true);
    cancelRef.current = false;
    contractStore.addGeneralMessage("user", content);

    const pending = contractStore.addGeneralMessage("assistant", "");
    setStreamingId(pending.id);

    try {
      const history = contractStore
        .getGeneralMessages()
        .filter((m) => m.id !== pending.id)
        .slice(-40);

      const documentContext = buildDocumentContext();

      const onReveal: RevealCallback = (partial, done) => {
        if (cancelRef.current) return;
        contractStore.updateGeneralMessage(pending.id, { content: partial });
        if (done) {
          setStreamingId(null);
          setSending(false);
        }
      };

      await aiService.generalChatStreaming(history, onReveal, documentContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI assistant failed to reply.";
      toast.error(message);
      contractStore.updateGeneralMessage(pending.id, {
        content: `⚠️ I couldn't answer just now: ${message}\n\nPlease verify that Ollama is running (\`ollama run phi4-mini\`) and try again.`,
      });
      setStreamingId(null);
      setSending(false);
    }
  };

  const clear = () => {
    contractStore.clearGeneralMessages();
    toast.success("Conversation cleared.");
  };

  const stop = () => {
    cancelRef.current = true;
    if (streamingId) {
      setStreamingId(null);
      setSending(false);
    }
  };

  const firstMessage = messages.length === 0;
  const suggestions = contracts.length > 0 ? DOCUMENT_SUGGESTIONS : DEFAULT_SUGGESTIONS;
  const selectedDoc = contracts.find((c) => c.id === selectedDocId);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 py-4 sm:px-6">
        {/* Top Header Controls */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                AI Assistant
              </h1>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                phi4-mini
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Connected to your local Ollama engine with direct document fetching and analysis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {status && (
              <div
                className={cn(
                  "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs sm:flex",
                  status.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-400",
                )}
                title={status.ok ? status.baseUrl : status.error}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    status.ok ? "bg-emerald-400" : "bg-amber-400 animate-pulse",
                  )}
                />
                {status.ok ? "phi4-mini online" : "Ollama offline"}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadStatus()}
              disabled={statusLoading}
              aria-label="Refresh Ollama status"
              title="Check connection to Ollama"
            >
              <RefreshCw className={cn("size-3.5", statusLoading && "animate-spin")} />
              <span className="hidden sm:inline">Check</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clear}
              disabled={firstMessage || sending}
              aria-label="Clear conversation"
            >
              <Eraser className="size-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>

        {/* Document Knowledge Base Bar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-secondary/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Document Context:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:border-ring focus:outline-none"
            >
              <option value="all">📚 All Documents ({contracts.length} connected to Ollama)</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  📄 {c.title} (
                  {c.analysis?.riskScore !== undefined
                    ? `Risk: ${c.analysis.riskScore}/100`
                    : "Extracted"}
                  )
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-7 text-xs"
            >
              <Paperclip className="size-3" />
              {uploading ? "Extracting text…" : "Attach Document to AI"}
            </Button>
          </div>
        </div>

        {/* Chat Area Card */}
        <Card className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {firstMessage ? (
              <div className="mx-auto max-w-xl py-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 text-primary ring-1 ring-primary/20">
                  <Sparkles className="size-7" />
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                  EnContract Document Copilot
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Powered by your local <strong>phi4-mini</strong> model. Ollama has direct access
                  to your {contracts.length} uploaded documents to answer questions, audit risks,
                  and compare agreements.
                </p>

                {contracts.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {contracts.slice(0, 4).map((c) => (
                      <Badge
                        key={c.id}
                        variant="outline"
                        className="cursor-pointer border-border bg-secondary/40 py-1 text-xs hover:border-primary/50"
                        onClick={() => setSelectedDocId(c.id)}
                      >
                        <FileText className="mr-1 size-3 text-primary" />
                        {c.title}
                      </Badge>
                    ))}
                    {contracts.length > 4 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        +{contracts.length - 4} more
                      </Badge>
                    )}
                  </div>
                )}

                {!status?.ok && (
                  <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left text-sm text-amber-400">
                    <p className="font-semibold">Can't reach local Ollama</p>
                    <p className="mt-1 text-xs text-amber-400/80">
                      To use the assistant, start Ollama in your terminal:
                    </p>
                    <pre className="mt-2 rounded bg-black/40 p-2 font-mono text-xs text-amber-200">
                      $env:OLLAMA_ORIGINS="*" ; ollama run phi4-mini
                    </pre>
                  </div>
                )}

                <div className="mt-8">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Try asking about your documents:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void sendMessage(s)}
                        disabled={sending}
                        className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50 sm:text-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <MessageBubble key={m.id} message={m} streaming={streamingId === m.id && sending} />
              ))
            )}
          </div>

          {/* Bottom Chat Input */}
          <div className="border-t border-border p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
                title="Attach a contract or document to analyze"
                className="grid size-11 place-items-center rounded-xl border border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
              >
                <Paperclip className="size-4" />
              </button>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                placeholder={
                  sending && streamingId
                    ? "Generating answer with phi4-mini…"
                    : selectedDoc
                      ? `Ask anything about "${selectedDoc.title}"…`
                      : "Ask Ollama to analyze, compare, or summarize your documents…"
                }
                aria-label="Message the AI assistant"
                disabled={sending && !!streamingId}
                className="max-h-40 min-h-[44px] flex-1 resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              />

              {sending && streamingId ? (
                <Button
                  onClick={stop}
                  variant="outline"
                  className="h-11 px-3"
                  aria-label="Stop generating"
                >
                  <StopCircle className="size-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim() || sending}
                  className="h-11 px-3"
                  aria-label="Send message"
                >
                  <SendHorizonal className="size-4" />
                </Button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground/80">
              <span>
                Connected to:{" "}
                <strong className="text-foreground">
                  {selectedDocId === "all"
                    ? `All Documents (${contracts.length} indexed)`
                    : selectedDoc?.title}
                </strong>
              </span>
              <span>Runs 100% locally via Ollama — zero data leakage.</span>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: GeneralChatMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          isUser ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary/15 text-foreground" : "bg-secondary/60 text-foreground",
          streaming && "ring-1 ring-primary/30",
        )}
      >
        {message.role === "assistant" ? (
          message.content ? (
            <div className="prose-sm max-w-none [&_a]:text-primary [&_a]:underline-offset-2 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s]" />
              <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
              <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary/70" />
            </div>
          )
        ) : (
          message.content
        )}
        {streaming && message.content && (
          <span className="ml-1 inline-block size-3 translate-y-0.5 animate-pulse rounded-sm bg-primary/70" />
        )}
      </div>
    </div>
  );
}
