# EnContract — Contract & Compliance Manager

A web app where users upload contract PDFs, save them into workspaces, and get an AI-powered dashboard with risk/clause charts, a compliance checklist, deadlines, and a chat assistant. **No mock/demo PDFs anywhere — everything starts from empty states.**

## Step 0 — Design directions (first action after approval)

No visual direction was specified, so the first build step is generating 3 rendered design directions (color, typography, layout, motion style) for you to pick from. The chosen direction then drives the whole app's look.

## Features

### 1. Splash / welcome animation

- App loads with a quick fade-in "pop" splash showing the EnContract logo, then smoothly transitions to the landing page. Returning signed-in users skip past it into their dashboard.

### 2. Authentication

- Public `/auth` page with:
  - **Sign in with Google** (fully managed, works immediately).
  - **Email** sign-in (email OTP).
  - **Sign in with Phone Number** with a full OTP input flow (enter phone → receive code → 6-digit OTP input). Phone SMS requires a provider (e.g. Twilio) — the UI and flow will be complete; it activates once SMS provider credentials are added in settings, and I'll flag this in the UI gracefully if not configured.
- Returning users with an active session are routed straight to their workspace dashboard.
- Basic profiles: display name + avatar stored in a `profiles` table, auto-created on signup, shown in the dashboard header.

### 3. Landing page (public home)

- Header: bold "EnContract" wordmark with sub-headline "your own contract and compliance manager"; center links **Features** and **Why use us?** that smooth-scroll to those sections lower on the page; right side shows **Enter Workspace** (signed-in) or **Sign in** (signed-out).
- Hero: large drag-and-drop "Select a PDF" upload box (also click-to-browse).
- Below: Features section and "Why use us?" benefits section (the scroll targets).

### 4. Workspace selection flow

- After a PDF is chosen on the home page: if not signed in, prompt sign-in first; then a modal offers **Create a New Workspace** (name field) or **Select an Existing Workspace** (list). The PDF uploads to storage attached to that workspace.

### 5. Dashboard & PDF analysis

- After placement, the workspace dashboard shows the contract's analysis:
  - AI-written **summary** of the document and an overall **risk score**.
  - **Charts**: pie chart of clauses by category, bar chart of positive vs. negative impacts. **Green = positive clauses/impacts, red = risks/negative** (enforced in the chart theme).
  - **Compliance checklist** with pass/attention status, and extracted **renewal dates / deadlines**.
- Analysis is produced by AI reading the actual uploaded PDF (structured output), stored per contract so revisits are instant.

### 6. AI assistant

- Chat panel on the dashboard that has the current contract's text as context: it proactively opens with recommendations, next steps, and risk warnings, then answers follow-up questions about the document.
- AI calls go through a thin provider module on the server (`Lovable AI` by default) behind a small interface, so swapping to a local model (e.g. WebLLM) later means changing one module.

### 7. Quick action buttons

- A one-click action row on the dashboard: **Send NDA**, **Sign Pending**, **Renewal Pending** — each marks the contract with that status/action (tracked and visible as status chips; no external email/signature service is wired, the buttons record the action).

### 8. Editable workspace

- Add new contracts (upload more PDFs), remove contracts (with file cleanup), and organize: rename workspaces/contracts, switch between contracts, and manage multiple workspaces.

## Backend — deferred (your own backend & database later)

No Lovable Cloud, no Supabase, no built-in database. The app is built frontend-first, ready to plug into your own backend.

- **Service layer**: all data access goes through a small typed service layer (`src/services/`) with three interfaces — `AuthService`, `ContractStore` (workspaces, contracts, analyses, chat history), and `AIService`. Swapping in your backend later means replacing the implementation of these interfaces, not touching screens.
- **Interim local implementation**: a browser-local implementation (localStorage/IndexedDB) powers the app today from clean empty states — workspaces, uploaded PDFs, analyses, and chat all work and persist locally per browser. No mock or demo PDFs are ever generated.
- **Auth**: the full auth UI is built (Google button, Email OTP, Phone number + OTP input flow). Until your backend is connected, sign-in runs in local session mode (name/email creates a local profile session); the OAuth/OTP buttons show a clear "connect your backend to enable" state instead of fake-working.
- **AI**: analysis and chat sit behind the `AIService` interface. The default implementation calls one minimal TanStack server route using Lovable AI Gateway (no database or Cloud project involved); it can later be repointed to your own backend endpoint or a local model (WebLLM) by changing that one module. PDF text is extracted server-side with a worker-compatible parser (`unpdf`).
- **API contract**: I'll document the exact endpoints and data shapes (auth, workspaces, contracts, analysis, chat) your backend should implement, so the swap is drop-in.

## Routes

```text
/                  Landing page (hero upload, Features, Why use us)
/auth              Sign in / sign up (Google, Email OTP, Phone OTP)
/dashboard         Workspace list + "Enter Workspace" target      (protected)
/workspace/$id     Workspace: contracts list, add/remove/organize (protected)
/contract/$id      Analysis dashboard: charts, checklist, AI chat (protected)
```

## Technical notes

- TanStack Start + Tailwind v4, charts with a lightweight chart setup styled to the green/red rule, smooth motion for the splash and page transitions.
- Protected routes live under the `_authenticated` gate; server functions use authenticated middleware; the PDF storage bucket is private with signed-URL access.
- Phone OTP note: the complete flow is built; live SMS delivery requires connecting an SMS provider (credentials) — I'll surface a clear "not configured" state until then.
- First turn delivers the full working app; you'll be able to sign in with Google and analyze a real PDF end to end.
