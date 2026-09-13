/**
 * Server functions for EnContract AI. Thin wrappers only — all runtime
 * logic lives in ./ai.server.ts (never imported by client code directly).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  analyzeContractText,
  chatAboutContract,
  extractTextFromDocumentBase64,
  extractTextFromPdfBase64,
  generalChat,
  getOllamaStatus,
  listOllamaModels,
} from "./ai.server";

export const extractDocumentText = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        fileBase64: z.string(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return extractTextFromDocumentBase64(data);
  });

export const extractPdfText = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ pdfBase64: z.string() }).parse(input))
  .handler(async ({ data }) => {
    return extractTextFromPdfBase64(data.pdfBase64);
  });

const AnalyzeInput = z.object({
  title: z.string(),
  text: z.string(),
});

export const analyzeContract = createServerFn({ method: "POST" })
  .validator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data }) => {
    return analyzeContractText(data.title, data.text);
  });

const ChatInput = z.object({
  title: z.string(),
  text: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
});

export const chatWithContract = createServerFn({ method: "POST" })
  .validator((input: unknown) => ChatInput.parse(input))
  .handler(async ({ data }) => {
    return chatAboutContract(data.title, data.text, data.messages);
  });

const GeneralChatInput = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  documentContext: z.string().optional(),
});

export const chatGeneral = createServerFn({ method: "POST" })
  .validator((input: unknown) => GeneralChatInput.parse(input))
  .handler(async ({ data }) => {
    return generalChat(data.messages, data.documentContext);
  });

export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => {
  return getOllamaStatus();
});

export const listAiModels = createServerFn({ method: "GET" }).handler(async () => {
  return listOllamaModels();
});
