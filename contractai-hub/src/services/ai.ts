/**
 * AIService — client-side facade for all AI features.
 *
 * Screens only talk to this module. Backed by server functions that route
 * to a local Ollama instance via @ai-sdk/openai-compatible. To move AI
 * elsewhere, reimplement these methods as fetch() calls — the screens
 * do not need to change.
 */
import {
  analyzeContract,
  chatGeneral,
  chatWithContract,
  extractDocumentText,
  extractPdfText,
  getAiStatus,
  listAiModels,
} from "@/lib/ai.functions";
import type {
  ChatMessage,
  ContractAnalysis,
  GeneralChatMessage,
  OllamaModelList,
  OllamaStatus,
} from "./types";

export type RevealCallback = (partial: string, done: boolean) => void;

export interface AIService {
  extractText(fileBlob: Blob, fileName?: string): Promise<string>;
  analyze(title: string, text: string): Promise<Omit<ContractAnalysis, "analyzedAt">>;
  chat(title: string, text: string, history: ChatMessage[]): Promise<string>;
  chatStreaming(
    title: string,
    text: string,
    history: ChatMessage[],
    onReveal: RevealCallback,
  ): Promise<string>;
  generalChat(history: GeneralChatMessage[], documentContext?: string): Promise<string>;
  generalChatStreaming(
    history: GeneralChatMessage[],
    onReveal: RevealCallback,
    documentContext?: string,
  ): Promise<string>;
  getStatus(): Promise<OllamaStatus>;
  listModels(): Promise<OllamaModelList>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== "undefined") {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64 || "");
      };
      reader.onerror = () => {
        blob
          .arrayBuffer()
          .then((buf) => {
            const bytes = new Uint8Array(buf);
            let binary = "";
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            resolve(btoa(binary));
          })
          .catch(reject);
      };
      reader.readAsDataURL(blob);
    } else {
      blob
        .arrayBuffer()
        .then((buf) => {
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          resolve(btoa(binary));
        })
        .catch(reject);
    }
  });
}

async function revealProgressively(
  full: string,
  onReveal: RevealCallback,
  charsPerTick = 12,
  tickMs = 12,
): Promise<void> {
  return new Promise((resolve) => {
    if (!full) {
      onReveal("", true);
      resolve();
      return;
    }
    let i = 0;
    const tick = () => {
      i = Math.min(full.length, i + charsPerTick + Math.floor(Math.random() * 8));
      onReveal(full.slice(0, i), i >= full.length);
      if (i >= full.length) {
        resolve();
      } else {
        setTimeout(tick, tickMs + Math.floor(Math.random() * 8));
      }
    };
    setTimeout(tick, 0);
  });
}

async function streamDirectOllama(
  promptOrMessages: string | { role: string; content: string }[],
  onReveal: RevealCallback,
  systemPrompt?: string,
): Promise<string> {
  const isChat = Array.isArray(promptOrMessages);
  const endpoint = isChat
    ? "http://localhost:11434/api/chat"
    : "http://localhost:11434/api/generate";

  let bodyData: unknown;
  if (isChat) {
    const messages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...promptOrMessages]
      : promptOrMessages;
    bodyData = {
      model: "phi4-mini",
      messages,
      stream: true,
    };
  } else {
    bodyData = {
      model: "phi4-mini",
      prompt: promptOrMessages,
      system: systemPrompt,
      stream: true,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama direct API error: status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        const token = isChat ? parsed.message?.content : parsed.response;
        if (token) {
          fullText += token;
          onReveal(fullText, false);
        }
        if (parsed.done) {
          break;
        }
      } catch {
        /* ignore incomplete chunk */
      }
    }
  }

  onReveal(fullText, true);
  return fullText;
}

class GatewayAIService implements AIService {
  async extractText(fileBlob: Blob, fileName?: string): Promise<string> {
    const fileBase64 = await blobToBase64(fileBlob);
    const result = await extractDocumentText({
      data: {
        fileBase64,
        fileName,
        mimeType: fileBlob.type,
      },
    });
    return result.text;
  }

  async analyze(title: string, text: string): Promise<Omit<ContractAnalysis, "analyzedAt">> {
    return analyzeContract({ data: { title, text } });
  }

  async chat(title: string, text: string, history: ChatMessage[]): Promise<string> {
    const recent = history.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    const { reply } = await chatWithContract({ data: { title, text, messages: recent } });
    return reply;
  }

  async chatStreaming(
    title: string,
    text: string,
    history: ChatMessage[],
    onReveal: RevealCallback,
  ): Promise<string> {
    onReveal("", false);
    try {
      const recent = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = `You are EnContract's AI contract copilot powered by phi4-mini. Reference contract: "${title}". Document text: ${text.slice(0, 24000)}. Ground all answers in this text. Use clear markdown.`;
      return await streamDirectOllama(recent, onReveal, systemPrompt);
    } catch {
      const reply = await this.chat(title, text, history);
      await revealProgressively(reply, onReveal);
      return reply;
    }
  }

  async generalChat(history: GeneralChatMessage[], documentContext?: string): Promise<string> {
    const recent = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-40)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const { reply } = await chatGeneral({ data: { messages: recent, documentContext } });
    return reply;
  }

  async generalChatStreaming(
    history: GeneralChatMessage[],
    onReveal: RevealCallback,
    documentContext?: string,
  ): Promise<string> {
    onReveal("", false);
    const baseSystem =
      "You are EnContract AI, a precise legal and compliance copilot powered by phi4-mini running locally. You have direct access to the user's uploaded documents and contracts.";
    const docSection = documentContext
      ? `\n\n--- CONNECTED USER DOCUMENTS & KNOWLEDGE BASE ---\n${documentContext}\n--- END OF DOCUMENTS ---\n\nYou have direct access to the documents above. When the user asks about their contracts, documents, risk scores, clauses, or obligations, fetch and analyze the text above directly and accurately.`
      : "";
    const systemPrompt = `${baseSystem}${docSection}`;

    try {
      const recent = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-40)
        .map((m) => ({ role: m.role, content: m.content }));
      return await streamDirectOllama(recent, onReveal, systemPrompt);
    } catch {
      const reply = await this.generalChat(history, documentContext);
      await revealProgressively(reply, onReveal);
      return reply;
    }
  }

  async getStatus(): Promise<OllamaStatus> {
    return getAiStatus();
  }

  async listModels(): Promise<OllamaModelList> {
    return listAiModels();
  }
}

export const aiService: AIService = new GatewayAIService();
