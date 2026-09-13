/**
 * Shared domain types for EnContract.
 * These shapes mirror the API contract in docs/backend-api.md — when you
 * connect your own backend, keep these shapes and only swap the
 * implementations in src/services/.
 */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export type ClauseImpact = "positive" | "negative" | "neutral";

export interface ClauseItem {
  title: string;
  category: string;
  impact: ClauseImpact;
  note: string;
}

export type ComplianceStatus = "pass" | "attention" | "fail";

export interface ComplianceItem {
  item: string;
  status: ComplianceStatus;
  detail: string;
}

export interface DeadlineItem {
  label: string;
  date: string;
  kind: string;
}

export interface ContractAnalysis {
  summary: string;
  /** 0 (no risk) – 100 (severe risk) */
  riskScore: number;
  clauses: ClauseItem[];
  compliance: ComplianceItem[];
  deadlines: DeadlineItem[];
  recommendations: string[];
  analyzedAt: string;
}

export type QuickAction = "nda_sent" | "sign_pending" | "renewal_pending";

export const QUICK_ACTIONS: { id: QuickAction; label: string }[] = [
  { id: "nda_sent", label: "Send NDA" },
  { id: "sign_pending", label: "Sign Pending" },
  { id: "renewal_pending", label: "Renewal Pending" },
];

export const QUICK_ACTION_LABELS: Record<QuickAction, string> = {
  nda_sent: "NDA sent",
  sign_pending: "Sign pending",
  renewal_pending: "Renewal pending",
};

export type ContractStatus = "uploaded" | "analyzing" | "analyzed" | "analysis_failed";

export interface Contract {
  id: string;
  workspaceId: string;
  title: string;
  /** Key of the PDF blob in the file store (IndexedDB locally, object storage later). */
  fileKey: string;
  size: number;
  status: ContractStatus;
  createdAt: string;
  /** Extracted PDF text (capped). Needed by the AI assistant for follow-ups. */
  text?: string;
  analysis?: ContractAnalysis;
  /** Quick actions the user has triggered, action -> ISO timestamp. */
  actions: Partial<Record<QuickAction, string>>;
}

export interface ChatMessage {
  id: string;
  contractId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface GeneralChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface OllamaStatus {
  ok: boolean;
  baseUrl: string;
  modelCount: number;
  activeModel: string | null;
  error?: string;
}

export interface OllamaModelList {
  models: string[];
  preferred: string | null;
}
