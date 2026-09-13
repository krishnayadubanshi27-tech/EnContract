# EnContract — Backend API Contract

The app is frontend-first: all data flows through the service layer in `src/services/`
(`auth.ts`, `store.ts`, `ai.ts`). To connect your own backend, implement the endpoints
below and swap the local implementations for `fetch` calls — no screen code changes needed.

Base URL: your choice (e.g. `https://api.yourdomain.com`). All authenticated endpoints
expect `Authorization: Bearer <token>`.

## Auth (`AuthService` in `src/services/auth.ts`)

| Method | Endpoint             | Body                      | Returns                                               |
| ------ | -------------------- | ------------------------- | ----------------------------------------------------- |
| POST   | `/auth/email`        | `{ name, email }`         | `{ user: UserProfile, token }`                        |
| POST   | `/auth/google`       | OAuth code/token exchange | `{ user: UserProfile, token }`                        |
| POST   | `/auth/phone/otp`    | `{ phone }`               | `{ sent: true }` (SMS via your provider, e.g. Twilio) |
| POST   | `/auth/phone/verify` | `{ phone, otp }`          | `{ user: UserProfile, token }`                        |
| POST   | `/auth/sign-out`     | —                         | `204`                                                 |

```ts
interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}
```

## Workspaces & contracts (`ContractStore` in `src/services/store.ts`)

| Method | Endpoint                              | Notes                                                           |
| ------ | ------------------------------------- | --------------------------------------------------------------- |
| GET    | `/workspaces`                         | list caller's workspaces                                        |
| POST   | `/workspaces`                         | `{ name }` → `Workspace`                                        |
| PATCH  | `/workspaces/:id`                     | `{ name }` rename                                               |
| DELETE | `/workspaces/:id`                     | deletes contracts, files, chat                                  |
| GET    | `/workspaces/:id/contracts`           | list contracts                                                  |
| POST   | `/workspaces/:id/contracts`           | multipart PDF upload → `Contract`                               |
| PATCH  | `/contracts/:id`                      | `{ title }` rename                                              |
| DELETE | `/contracts/:id`                      | removes file + analysis + chat                                  |
| POST   | `/contracts/:id/actions`              | `{ action: "nda_sent" \| "sign_pending" \| "renewal_pending" }` |
| GET    | `/contracts/:id/messages` / POST same | chat history                                                    |

```ts
interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}
interface Contract {
  id: string;
  workspaceId: string;
  title: string;
  fileKey: string;
  size: number;
  status: "uploaded" | "analyzing" | "analyzed" | "analysis_failed";
  createdAt: string;
  text?: string;
  analysis?: ContractAnalysis;
  actions: Partial<Record<"nda_sent" | "sign_pending" | "renewal_pending", string>>;
}
interface ChatMessage {
  id: string;
  contractId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
```

## Analysis shape (`ContractAnalysis`)

```ts
interface ContractAnalysis {
  summary: string;
  riskScore: number; // 0-100
  clauses: {
    title: string;
    category: string;
    impact: "positive" | "negative" | "neutral";
    note: string;
  }[];
  compliance: { item: string; status: "pass" | "attention" | "fail"; detail: string }[];
  deadlines: { label: string; date: string; kind: string }[]; // date ISO YYYY-MM-DD preferred
  recommendations: string[];
  analyzedAt: string;
}
```

## AI (`AIService` in `src/services/ai.ts`)

Today AI runs through the app's server functions (`src/lib/ai.functions.ts`) on Lovable AI
Gateway. To move it to your backend, expose:

| Method | Endpoint      | Body                                             | Returns                                 |
| ------ | ------------- | ------------------------------------------------ | --------------------------------------- |
| POST   | `/ai/extract` | PDF file (multipart)                             | `{ text }`                              |
| POST   | `/ai/analyze` | `{ title, text }`                                | `ContractAnalysis` (minus `analyzedAt`) |
| POST   | `/ai/chat`    | `{ title, text, messages: { role, content }[] }` | `{ reply }`                             |

A local model (e.g. WebLLM) can implement the same three methods fully client-side —
only `src/services/ai.ts` changes.

## Notes

- PDF upload limit: 20 MB. Text is truncated to ~24k chars before AI calls.
- Until a backend is connected, everything persists in this browser
  (localStorage + IndexedDB). Signing out clears the session only; data stays local.
