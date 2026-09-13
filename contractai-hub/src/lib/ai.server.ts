/**
 * AI provider module — server-only.
 *
 * Powered by a LOCAL Ollama instance. Defaults to http://localhost:11434,
 * configurable via the OLLAMA_BASE_URL env var (or VITE_OLLAMA_BASE_URL for dev).
 * Uses @ai-sdk/openai-compatible against Ollama's built-in OpenAI-compatible
 * /v1 endpoint, with streaming for chat and json mode for structured analysis.
 *
 * Model auto-detection prefers strong ones (deepseek-v3, qwen2.5, llama3.1,
 * phi4, gemma3, mistral) and falls back to the first available.
 *
 * PDF text extraction stays local too (unpdf — no network call needed).
 */
import { z } from "zod";
import type { ContractAnalysis } from "@/services/types";

const OLLAMA_BASE =
  process.env["OLLAMA_BASE_URL"] || process.env["VITE_OLLAMA_BASE_URL"] || "http://localhost:11434";
/** Keep prompts well inside phi4's 128K window; 24k chars is plenty & safe. */
const MAX_CONTRACT_CHARS = 24_000;

const analysisSchema = z.object({
  summary: z.string(),
  riskScore: z.number(),
  clauses: z.array(
    z.object({
      title: z.string(),
      category: z.string(),
      impact: z.enum(["positive", "negative", "neutral"]),
      note: z.string(),
    }),
  ),
  compliance: z.array(
    z.object({
      item: z.string(),
      status: z.enum(["pass", "attention", "fail"]),
      detail: z.string(),
    }),
  ),
  deadlines: z.array(
    z.object({
      label: z.string(),
      date: z.string(),
      kind: z.string(),
    }),
  ),
  recommendations: z.array(z.string()),
});

type CoreMessage = { role: "system" | "user" | "assistant"; content: string };

function truncate(text: string): string {
  return text.length > MAX_CONTRACT_CHARS
    ? `${text.slice(0, MAX_CONTRACT_CHARS)}\n\n[...document truncated for analysis...]`
    : text;
}

let cachedModel: string | null = null;

async function pickOllamaModel(): Promise<string> {
  const forced = process.env["OLLAMA_MODEL"] || process.env["VITE_OLLAMA_MODEL"];
  if (forced) return forced;
  if (cachedModel) return cachedModel;
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    if (!names.length)
      throw new Error("No models found in Ollama. Pull a model (e.g. `ollama pull phi4`).");

    const prefer = [
      /phi[-_]?4[-_]?mini/i,
      /phi[-_]?4/i,
      /deepseek[-_]v3/i,
      /qwen[-_]?2[._]?5/i,
      /llama[-_]?3[._]?1/i,
      /llama[-_]?3/i,
      /gemma[-_]?3/i,
      /mistral/i,
    ];
    for (const re of prefer) {
      const hit = names.find((n) => re.test(n));
      if (hit) {
        cachedModel = hit;
        return hit;
      }
    }
    const first = names[0] as string;
    cachedModel = first;
    return first;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach Ollama at ${OLLAMA_BASE}. Is the Ollama app running? (${msg})`);
  }
}

export type { CoreMessage };

function sanitizeAnalysis(raw: unknown): Omit<ContractAnalysis, "analyzedAt"> {
  const coerced = analysisSchema.safeParse(raw);
  if (coerced.success) return coerced.data;

  const fallback = analysisSchema.safeParse({
    summary:
      typeof (raw as { summary?: string })?.summary === "string"
        ? (raw as { summary: string }).summary
        : "Analysis extracted from the contract text by the local Ollama model.",
    riskScore: clampNumber((raw as { riskScore?: unknown })?.riskScore, 50),
    clauses: forceClauses((raw as { clauses?: unknown })?.clauses),
    compliance: forceCompliance((raw as { compliance?: unknown })?.compliance),
    deadlines: forceDeadlines((raw as { deadlines?: unknown })?.deadlines),
    recommendations: forceStrings((raw as { recommendations?: unknown })?.recommendations, [
      "Review high-risk clauses highlighted in the clause breakdown.",
      "Confirm renewal windows with the other party before the notice period.",
      "Consult legal counsel before signing — this analysis is not legal advice.",
    ]),
  });
  if (fallback.success) return fallback.data;

  throw new Error(
    `The local Ollama model returned output that didn't match the analysis schema. Try a stronger model or try again. Issues: ${coerced.error?.issues
      .map((i) => `${i.path.join(".")} ${i.message}`)
      .slice(0, 5)
      .join("; ")}`,
  );
}

function clampNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function forceClauses(v: unknown): Omit<ContractAnalysis, "analyzedAt">["clauses"] {
  if (!Array.isArray(v)) return [];
  const out: Omit<ContractAnalysis, "analyzedAt">["clauses"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const impact = (item as { impact?: string }).impact;
    const okImpact =
      impact === "positive" || impact === "negative" || impact === "neutral" ? impact : "neutral";
    const title = String((item as { title?: string }).title ?? "Clause").slice(0, 120);
    if (!title.trim()) continue;
    out.push({
      title,
      category: String((item as { category?: string }).category ?? "General").slice(0, 80),
      impact: okImpact,
      note: String((item as { note?: string }).note ?? "").slice(0, 400),
    });
  }
  return out;
}

function forceCompliance(v: unknown): Omit<ContractAnalysis, "analyzedAt">["compliance"] {
  if (!Array.isArray(v)) return [];
  const out: Omit<ContractAnalysis, "analyzedAt">["compliance"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const status = (item as { status?: string }).status;
    const okStatus =
      status === "pass" || status === "attention" || status === "fail" ? status : "attention";
    const it = String((item as { item?: string }).item ?? "").slice(0, 120);
    if (!it.trim()) continue;
    out.push({
      item: it,
      status: okStatus,
      detail: String((item as { detail?: string }).detail ?? "").slice(0, 400),
    });
  }
  return out;
}

function forceDeadlines(v: unknown): Omit<ContractAnalysis, "analyzedAt">["deadlines"] {
  if (!Array.isArray(v)) return [];
  const out: Omit<ContractAnalysis, "analyzedAt">["deadlines"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: string }).label ?? "").slice(0, 200);
    if (!label.trim()) continue;
    out.push({
      label,
      date: String((item as { date?: string }).date ?? "Unknown").slice(0, 40),
      kind: String((item as { kind?: string }).kind ?? "other").slice(0, 40),
    });
  }
  return out;
}

function forceStrings(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.map((x) => String(x ?? "").slice(0, 400)).filter((x) => x.trim().length > 0);
  return out.length ? out : fallback;
}

export async function extractTextFromDocumentBase64(input: {
  fileBase64: string;
  fileName?: string | undefined;
  mimeType?: string | undefined;
}): Promise<{ text: string }> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const fileName = (input.fileName || "").toLowerCase();
  const mimeType = (input.mimeType || "").toLowerCase();

  const isWord =
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc") ||
    mimeType.includes("word") ||
    mimeType.includes("officedocument");

  const isImage =
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".webp") ||
    mimeType.startsWith("image/");

  const isText =
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".rtf") ||
    mimeType.startsWith("text/");

  // 1. Word Document (.docx / .doc)
  if (isWord) {
    try {
      const mammoth = await import("mammoth");
      const buffer = Buffer.from(bytes);
      const result = await mammoth.extractRawText({ buffer });
      const cleaned = (result.value || "").trim();
      if (cleaned) return { text: cleaned };
    } catch (err) {
      console.warn("[ai.server] Mammoth extraction warning:", err);
    }
  }

  // 2. Image OCR (.png / .jpg / .webp)
  if (isImage) {
    try {
      const Tesseract = await import("tesseract.js");
      const buffer = Buffer.from(bytes);
      const { data } = await Tesseract.recognize(buffer, "eng");
      const cleaned = (data?.text || "").trim();
      if (cleaned) return { text: cleaned };
    } catch (err) {
      console.warn("[ai.server] Tesseract OCR warning:", err);
    }
  }

  // 3. Plain Text / Markdown (.txt / .md)
  if (isText) {
    try {
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(bytes).trim();
      if (text) return { text };
    } catch {
      /* fall through */
    }
  }

  // 4. Default: PDF extraction via unpdf
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(bytes, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    const cleaned = (text ?? "").trim();
    if (cleaned) return { text: cleaned };
  } catch (err) {
    console.warn("[ai.server] PDF extraction failed:", err);
  }

  // 5. Fallback string extraction for binary text
  const rawDecoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const printable = rawDecoded
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (printable.length > 50) {
    return { text: printable };
  }

  throw new Error(
    "Could not extract readable text from this file. Please make sure it contains clear text or scan.",
  );
}

export async function extractTextFromPdfBase64(pdfBase64: string): Promise<{ text: string }> {
  return extractTextFromDocumentBase64({ fileBase64: pdfBase64 });
}

const ANALYSIS_SCHEMA_DESC = `{
  summary: string (3-5 sentence plain-language summary),
  riskScore: number 0-100 (0=no risk, 100=severe, weigh liability/termination/payment/IP/ambiguity),
  clauses: Array<{ title: string, category: string, impact: "positive"|"negative"|"neutral", note: string (1 sentence) }> 6-12 most important,
  compliance: Array<{ item: string, status: "pass"|"attention"|"fail", detail: string }> 4-8 standard checks,
  deadlines: Array<{ label: string, date: string (YYYY-MM-DD or raw text), kind: "renewal"|"expiry"|"notice"|"payment"|"other" }>,
  recommendations: Array<string> 3-6 concrete next steps
}`;

const ANALYSIS_SYSTEM = `You are EnContract, a precise contract and compliance analysis engine running locally via Ollama.
Your ONLY output is a single valid JSON object matching this TypeScript shape — NO markdown fences, NO preamble, NO explanation, NO trailing text:

${ANALYSIS_SCHEMA_DESC}

Rules:
- impact "positive" = protects/benefits the party signing, "negative" = creates risk/obligation, else "neutral".
- compliance examples you should adapt to the contract type: governing law, termination notice period, liability cap, data protection terms, auto-renewal, payment terms, IP ownership, dispute resolution.
- recommendations must be concrete action items for the reviewing party, not generic statements.
- If something is genuinely absent from the text, still return it with honest status/date (don't fabricate values).`;

export async function analyzeContractText(
  title: string,
  text: string,
): Promise<Omit<ContractAnalysis, "analyzedAt">> {
  const modelName = await pickOllamaModel();
  const prompt = `Analyze this contract and return ONLY a JSON object matching the required schema.

Contract title: "${title}"

Contract text:
---
${truncate(text)}
---`;

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        system: ANALYSIS_SYSTEM,
        prompt: prompt,
        format: "json",
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Ollama returned HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { response?: string };
    const rawText = (data.response || "").trim();

    if (!rawText)
      throw new Error("The local Ollama model returned an empty analysis. Please try again.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start < 0 || end <= start) {
        throw new Error(
          "The local Ollama model didn't return valid JSON. Try again or try a stronger model.",
        );
      }
      parsed = JSON.parse(rawText.slice(start, end + 1));
    }

    return sanitizeAnalysis(parsed);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("valid JSON") || err.message.includes("empty analysis"))
    ) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Ollama analysis failed — is the Ollama app running with a model pulled? (${msg})`,
    );
  }
}

const CHAT_SYSTEM = `You are EnContract's local AI assistant — a precise contract and compliance copilot running on the user's machine via Ollama.
Ground EVERY answer in the contract text provided. Quote or reference specific clauses or sections when relevant.
Flag risks plainly (red-flag language). If something is NOT mentioned in the document, say so clearly instead of guessing.
Use short markdown: **bold** for clause names, - bullet lists for steps.
You are NOT a lawyer — end any answer that discusses significant legal risk with a brief note to consult licensed counsel.`;

export async function chatAboutContract(
  title: string,
  text: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply: string }> {
  const modelName = await pickOllamaModel();
  const context = `Reference contract for this conversation:

Title: "${title}"

Full text (truncated if very long):
---
${truncate(text)}
---

Answer the user's questions strictly based on the text above.`;

  const chatMessages = [
    { role: "system", content: CHAT_SYSTEM },
    { role: "user", content: `Here is the contract you must analyze:\n${context}` },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: chatMessages,
        stream: false,
        options: {
          temperature: 0.3,
          top_p: 0.9,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Ollama returned HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const reply = (data.message?.content || "").trim();
    if (!reply)
      throw new Error("The local Ollama assistant returned an empty reply. Please try again.");
    return { reply };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ollama chat failed — is the Ollama app running with a model pulled? (${msg})`);
  }
}

export async function listOllamaModels(): Promise<{ models: string[]; preferred: string | null }> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);

    const prefer = [
      /phi[-_]?4[-_]?mini/i,
      /phi[-_]?4/i,
      /deepseek[-_]v3/i,
      /qwen[-_]?2[._]?5/i,
      /llama[-_]?3[._]?1/i,
      /llama[-_]?3/i,
      /gemma[-_]?3/i,
      /mistral/i,
    ];
    let preferred: string | null = null;
    for (const re of prefer) {
      const hit = names.find((n) => re.test(n));
      if (hit) {
        preferred = hit;
        break;
      }
    }
    return { models: names, preferred };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot list Ollama models at ${OLLAMA_BASE}: ${msg}`);
  }
}

const GENERAL_CHAT_SYSTEM = `You are EnContract AI — a friendly, knowledgeable assistant running locally via Ollama.
You help users with contracts, compliance, legal document review, negotiation strategy, and general business questions.
Keep answers concise and practical. Use short markdown: **bold** for emphasis, - bullet lists for points.
When discussing legal topics, remind the user you are not licensed counsel and recommend professional review for high-stakes decisions.`;

export async function generalChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  documentContext?: string,
): Promise<{ reply: string }> {
  const modelName = await pickOllamaModel();
  const docSection = documentContext
    ? `\n\n--- CONNECTED USER DOCUMENTS & KNOWLEDGE BASE ---\n${documentContext}\n--- END OF DOCUMENTS ---\n\nYou have full access to the user's uploaded documents above. When the user asks about their contracts, documents, risk scores, clauses, obligations, or deadlines, fetch and analyze the text above directly and accurately.`
    : "";

  const systemContent = `${GENERAL_CHAT_SYSTEM}${docSection}`;

  const chatMessages = [
    { role: "system", content: systemContent },
    ...messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: chatMessages,
        stream: false,
        options: {
          temperature: 0.4,
          top_p: 0.9,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Ollama returned HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const reply = (data.message?.content || "").trim();
    if (!reply)
      throw new Error("The local Ollama assistant returned an empty reply. Please try again.");
    return { reply };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Ollama chat failed — is the Ollama app running with a model pulled? (${msg})`);
  }
}

export async function getOllamaStatus(): Promise<{
  ok: boolean;
  baseUrl: string;
  modelCount: number;
  activeModel: string | null;
  error?: string;
}> {
  try {
    const { models } = await listOllamaModels();
    const active = await pickOllamaModel().catch(() => cachedModel ?? "phi4-mini:latest");
    return {
      ok: true,
      baseUrl: OLLAMA_BASE,
      modelCount: models.length,
      activeModel: active,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      baseUrl: OLLAMA_BASE,
      modelCount: 0,
      activeModel: null,
      error: msg,
    };
  }
}
