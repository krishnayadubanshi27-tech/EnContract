import { useEffect, useRef, useState } from "react";
import { Bot, SendHorizonal, StopCircle, Trash2, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { aiService, type RevealCallback } from "@/services/ai";
import { contractStore, useChatMessages } from "@/services/store";
import type { ChatMessage, Contract } from "@/services/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

function openingMessage(contract: Contract): string {
  const a = contract.analysis;
  if (!a) return "";
  const risks = a.clauses.filter((c) => c.impact === "negative").slice(0, 3);
  const lines: string[] = [
    `I've finished reading **${contract.title}**. Overall risk score: **${a.riskScore}/100**.`,
  ];
  if (risks.length > 0) {
    lines.push("", "**Top risk warnings:**");
    for (const r of risks) lines.push(`- **${r.title}** — ${r.note}`);
  }
  if (a.recommendations.length > 0) {
    lines.push("", "**Recommended next steps:**");
    a.recommendations.slice(0, 4).forEach((rec, i) => lines.push(`${i + 1}. ${rec}`));
  }
  lines.push("", "Ask me anything about this contract — clauses, deadlines, or what to negotiate.");
  return lines.join("\n");
}

export function ChatPanel({ contract }: { contract: Contract }) {
  const allMessages = useChatMessages();
  const messages: ChatMessage[] = allMessages.filter((m) => m.contractId === contract.id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    if (contract.status !== "analyzed" || !contract.analysis) return;
    if (contractStore.getMessages().some((m) => m.contractId === contract.id)) {
      openedRef.current = true;
      return;
    }
    openedRef.current = true;
    contractStore.addMessage(contract.id, "assistant", openingMessage(contract));
  }, [contract]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending, streamingId]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    if (!contract.text) {
      toast.error("The contract text is not available yet — run the analysis first.");
      return;
    }
    setDraft("");
    setSending(true);
    cancelRef.current = false;
    contractStore.addMessage(contract.id, "user", content);

    const pending = contractStore.addMessage(contract.id, "assistant", "");
    setStreamingId(pending.id);

    try {
      const history = contractStore
        .getMessages()
        .filter((m) => m.contractId === contract.id && m.id !== pending.id)
        .slice(-20);

      const onReveal: RevealCallback = (partial, done) => {
        if (cancelRef.current) return;
        contractStore.updateMessage(pending.id, { content: partial });
        if (done) {
          setStreamingId(null);
          setSending(false);
        }
      };

      await aiService.chatStreaming(contract.title, contract.text, history, onReveal);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI assistant failed to reply.";
      toast.error(message);
      contractStore.updateMessage(pending.id, {
        content: `⚠️ I couldn't answer just now: ${message}\n\nPlease try again.`,
      });
      setStreamingId(null);
      setSending(false);
    }
  };

  const clear = () => {
    contractStore.clearMessages(contract.id);
    openedRef.current = false;
    toast.success("Conversation cleared.");
  };

  const stop = () => {
    cancelRef.current = true;
    if (streamingId) {
      setStreamingId(null);
      setSending(false);
    }
  };

  return (
    <div className="glass flex h-full min-h-[420px] flex-col rounded-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Bot className="size-4" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-display text-sm font-semibold text-foreground">AI Assistant</p>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                phi4-mini
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {sending ? "Generating…" : "Has read this contract"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={clear}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            The assistant will brief you once the analysis completes.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
                m.role === "assistant"
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {m.role === "assistant" ? (
                <Bot className="size-3.5" />
              ) : (
                <User className="size-3.5" />
              )}
            </span>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                m.role === "assistant"
                  ? "bg-secondary/60 text-foreground"
                  : "bg-primary/15 text-foreground",
                streamingId === m.id && sending && "ring-1 ring-primary/30",
              )}
            >
              {m.role === "assistant" ? (
                m.content ? (
                  <div className="prose-sm [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_li]:my-0.5">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
                    <span className="inline-block size-1.5 animate-bounce rounded-full bg-primary/70" />
                  </div>
                )
              ) : (
                m.content
              )}
              {streamingId === m.id && sending && (
                <span className="ml-1 inline-block size-3 translate-y-0.5 animate-pulse rounded-sm bg-primary/70" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about this contract…"
            aria-label="Message the AI assistant"
            disabled={sending && !!streamingId}
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          />
          {sending && streamingId ? (
            <Button onClick={stop} variant="outline" className="px-3" aria-label="Stop generating">
              <StopCircle className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={() => void send()}
              disabled={!draft.trim() || sending}
              className="px-3"
              aria-label="Send message"
            >
              <SendHorizonal className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
