// Quick Node test: mimic the ai.server.ts logic against live Ollama at localhost:11434
const OLLAMA_BASE = "http://localhost:11434";

async function pick() {
  const res = await fetch(OLLAMA_BASE + "/api/tags");
  const data = await res.json();
  const names = (data.models || []).map((m) => m.name);
  const prefer = [
    /deepseek[-_]v3/i,
    /qwen[-_]?2[._]?5/i,
    /llama[-_]?3[._]?1/i,
    /phi[-_]?4/i,
    /gemma[-_]?3/i,
    /mistral/i,
  ];
  for (const re of prefer) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return names[0];
}

async function chat({ messages, format, timeoutMs = 180_000 }) {
  const model = await pick();
  console.log(`[test] using model = ${model}`);
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OLLAMA_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        ...(format ? { format } : {}),
        options: { temperature: 0.2, top_p: 0.9 },
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status + ": " + (await res.text()).slice(0, 300));
    const data = await res.json();
    return (data.message?.content ?? "").trim();
  } finally {
    clearTimeout(to);
  }
}

const SAMPLE_CONTRACT = `SAMPLE SOFTWARE LICENSE AGREEMENT

This Agreement is entered into on 2026-01-15 by and between Acme Inc. ("Licensor") and Beta Corp ("Licensee").

1. LICENSE GRANT. Licensor hereby grants Licensee a non-exclusive, non-transferable license to use the Software internally for 24 months, effective 2026-02-01.

2. FEES. Licensee shall pay $24,000 annually, due 30 days before each 12-month period. Late payments incur 1.5% monthly interest. First payment due 2026-01-02.

3. TERM AND TERMINATION. Either party may terminate for convenience with 60 days written notice. Licensor may terminate immediately upon material breach that remains uncured for 15 days. On termination, Licensee must destroy all copies within 7 days.

4. CONFIDENTIALITY. Each party agrees to protect the other's Confidential Information for a period of 5 years.

5. INTELLECTUAL PROPERTY. Licensor retains all right, title, and interest in and to the Software. No ownership rights are transferred.

6. LIABILITY. IN NO EVENT SHALL LICENSOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES. LICENSOR'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE TOTAL FEES PAID IN THE PRECEDING 12 MONTHS.

7. INDEMNIFICATION. Licensee shall defend, indemnify, and hold harmless Licensor against any claim arising from Licensee's breach of this Agreement.

8. GOVERNING LAW. This Agreement shall be governed by the laws of the State of Delaware, USA. Disputes resolved by binding arbitration under AAA rules.

9. AUTO-RENEWAL. This Agreement automatically renews for successive 12-month terms unless either party provides written notice of non-renewal at least 90 days prior to expiration.

10. DATA PROTECTION. Licensee acknowledges that the Software may process personal data. The parties agree to comply with applicable law including GDPR and CCPA where relevant. No specific DPA is attached.

IN WITNESS WHEREOF, the parties hereto have executed this Agreement.
Signed:
Authorized Signatory (Licensor): Jane Doe     Date: 2026-01-15
Authorized Signatory (Licensee): John Smith   Date: 2026-01-15`;

console.log("[test] Step 1: structured analysis (JSON)");
const analysisStart = Date.now();
const analysisResp = await chat({
  format: "json",
  messages: [
    {
      role: "system",
      content: `You are EnContract, a contract analysis engine.
Return ONLY a single JSON object of shape:
{
  summary: string,
  riskScore: number 0-100,
  clauses: Array<{ title: string, category: string, impact: "positive"|"negative"|"neutral", note: string }>,
  compliance: Array<{ item: string, status: "pass"|"attention"|"fail", detail: string }>,
  deadlines: Array<{ label: string, date: string, kind: "renewal"|"expiry"|"notice"|"payment"|"other" }>,
  recommendations: Array<string>
}
No markdown fences, no preamble, no extra text.`,
    },
    {
      role: "user",
      content: `Analyze:

Contract title: "Sample Software License Agreement (Acme -> Beta Corp)"

Contract text:
---
${SAMPLE_CONTRACT}
---`,
    },
  ],
  timeoutMs: 10 * 60_000,
});

const analysisElapsed = ((Date.now() - analysisStart) / 1000).toFixed(1);
console.log(`[test] analysis raw length = ${analysisResp.length} chars (${analysisElapsed}s)`);

let parsed;
try {
  parsed = JSON.parse(analysisResp);
} catch (e) {
  const s = analysisResp.indexOf("{");
  const E = analysisResp.lastIndexOf("}");
  parsed = JSON.parse(analysisResp.slice(s, E + 1));
}
console.log(
  "[test] analysis.summary =",
  parsed.summary?.slice(0, 140) + (parsed.summary?.length > 140 ? "…" : ""),
);
console.log("[test] analysis.riskScore =", parsed.riskScore);
console.log(
  "[test] analysis.clauses.length =",
  Array.isArray(parsed.clauses) ? parsed.clauses.length : "BAD",
);
console.log(
  "[test] analysis.compliance.length =",
  Array.isArray(parsed.compliance) ? parsed.compliance.length : "BAD",
);
console.log(
  "[test] analysis.deadlines.length =",
  Array.isArray(parsed.deadlines) ? parsed.deadlines.length : "BAD",
);
console.log(
  "[test] analysis.recommendations.length =",
  Array.isArray(parsed.recommendations) ? parsed.recommendations.length : "BAD",
);
if (Array.isArray(parsed.deadlines)) {
  console.log("[test] sample deadlines:", parsed.deadlines.slice(0, 3));
}

console.log("\n[test] Step 2: chat Q&A");
const chatStart = Date.now();
const chatResp = await chat({
  messages: [
    {
      role: "system",
      content: `You are EnContract's AI assistant — a precise contract copilot running locally via Ollama.
Ground answers in the contract text. Use short markdown. Flag risks plainly. Not a lawyer: remind user to consult counsel when discussing significant legal risk.`,
    },
    {
      role: "user",
      content: `Reference contract for this conversation:

Title: "Sample Software License Agreement (Acme -> Beta Corp)"

Text:
---
${SAMPLE_CONTRACT}
---

Answer strictly based on the text above.

Question: What are the biggest risks to Licensee (Beta Corp) in this agreement? Give 3 concise, specific bullets quoting clauses where relevant.`,
    },
  ],
  timeoutMs: 5 * 60_000,
});
const chatElapsed = ((Date.now() - chatStart) / 1000).toFixed(1);
console.log(`[test] chat answer (${chatElapsed}s):`);
console.log(chatResp);

console.log("\n✅ Ollama integration test PASSED");
