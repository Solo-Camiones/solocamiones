# Feature 17 — AI Assistant (hybrid RAG)

## Status and authority

**CONFIRMED (documentation).** This file is the implementation source of truth for requirement IDs: `AI-001, AI-002, AI-003, AI-004, AI-005, AI-006, AI-007, AI-008, AI-009, AI-010`.

These IDs were added 2026-09-22 for the Administrator-only hybrid assistant sequenced in `docs/chatbot_implementation/IMPLEMENTATION_PLAN.md`. That plan is technical sequencing and progress only. **Do not implement behavior from the plan file when an AI-* ID exists here.**

Owner decisions recorded for documentation confirmation (2026-09-22):

1. Delivery is a **pilot after** the current pre-production stabilization; Feature 17 **does not** block or amend the first-production / environment gate.
2. Access is exclusive to `ADMINISTRATOR`.
3. Operations are read-only against commercial data; creating and deleting the actor's own conversations is allowed.
4. Knowledge combines an approved curated Markdown corpus (RAG) with live commercial query tools.
5. Live data domains: customers, quotes, conduces, invoices, payments, CxC, and profitability aggregates.
6. Exclusions: users, sessions, credentials, general audit surfaces, and inventory / hierarchy / Work Order mock modules.
7. Provider is OpenAI behind project-owned interfaces; SDK types must not leak into domain services.
8. Privacy minimization to the provider follows the field matrix in this file (no RNC, contacts, address, notes, line acquisition cost, or NCF/RNC snapshots).
9. Conversation history is PostgreSQL-backed, auditable, and retained for 90 days.
10. Consumption limits are configurable; evaluation is mandatory before production enablement.

Checklist items below stay `[ ]` until the owning milestones deliver implementation **and** tests. Do not mark them complete from documentation alone.

If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Post-stabilization pilot** (after Paso 10 / pre-production stabilization). Sequenced as milestones M0–M9 in `docs/chatbot_implementation/IMPLEMENTATION_PLAN.md`.

**Not required** for the first production release or the current pre-production environment gate. Feature 16 and Paso 10 remain the blocking pre-production work. Ship with `ASSISTANT_ENABLED=false` until evaluation and owner enablement.

**Implementation:** M1 adapters → M2 persistence → M3 corpus sync → M4 read-only tools → M5 orchestrator → M6 HTTP/SSE → M7 web panel → M8 hardening/ops → M9 evaluation and rollout.

## What this feature does

Give Administrators a global side-panel assistant that answers operational “how do I use Solo Camiones?” questions from an approved document corpus and factual commercial questions from live read-only tools. Every factual answer must show evidence (document and/or tool sources), respect Administrator authorization, minimize data sent to the provider, refuse unsupported or future/mock topics, and degrade safely when the provider is unavailable—without affecting commercial APIs or readiness.

## Architecture ownership

Primary logical module: **assistant**, with read-only public projections from customers, sales, payments/receivables, and profitability. OpenAI adapters live under shared infrastructure behind `LanguageModelGateway` and `KnowledgeRetriever` ports.

Follow the project-wide convention:

```text
feature/
  routes
  controller
  service
  repository
  validation
  types
```

Controllers translate HTTP/SSE only. Business rules belong in services. Prisma access for assistant tables belongs in assistant repositories. Assistant must not call other modules' Prisma repositories directly. Domain services must not import the OpenAI SDK.

## How to implement it

### Recommended implementation shape

```text
Administrator
  -> AssistantPanel
  -> AssistantRepository (web)
  -> /api/assistant
  -> AssistantController
  -> AssistantService
     -> Conversation / Message / Run repositories
     -> KnowledgeRetriever
     -> AssistantToolRegistry (read-only projections)
     -> LanguageModelGateway
  -> SSE metadata / delta / sources / done / error
```

- Feature flag `ASSISTANT_ENABLED` defaults to `false`; missing credentials must not prevent app boot when disabled.
- Tools are allowlisted, Zod-validated, re-authorize as Administrator, return `asOf` / `sourceKey`, and never mutate commercial data.
- Document chunks and tool outputs are untrusted data, never instructions.
- No web search, code interpreter, computer use, external MCP, or write tools.
- Web capability `assistant` is independent of Release 1–8 presets; off in mock mode (no full chatbot mock).

### Planned HTTP surface (implementation detail in M6)

All routes: `requireAuth`, `requireAdministrator`, `Cache-Control: no-store`, dedicated rate limit, CSRF on POST/DELETE.

| Method | Endpoint | Result |
|---|---|---|
| `POST` | `/api/assistant/conversations` | Create conversation; `201` |
| `GET` | `/api/assistant/conversations?page=1` | Own conversations (20/page) |
| `GET` | `/api/assistant/conversations/:id/messages?page=1` | Own messages (50/page) |
| `POST` | `/api/assistant/conversations/:id/messages` | Persist question; stream SSE |
| `DELETE` | `/api/assistant/conversations/:id` | Delete own conversation; `204` |

SSE events after stream start: `metadata`, `delta`, `sources`, `done`, `error`, plus 15s heartbeat. Pre-stream failures use normal HTTP errors (`503 ASSISTANT_DISABLED` when off).

### Supported questions

**Supported (examples):**

- How do I issue a conduce, convert to invoice, or apply ITBIS? (document corpus with sources)
- Find customer by name; summarize commercial type/limit/term without PII contacts.
- Locate quote/conduce/invoice by number; summarize totals, lines, payments, balance.
- Open CxC / overdue summary for a customer or cut-off date.
- Profitability aggregates for a date range (max 366 days).
- Hybrid: “what is a conduce?” plus “show CON-000123”.

**Not supported (must refuse or declare insufficient evidence):**

- Any write/mutation of commercial data (create customer, confirm sale, record payment, cancel, refund).
- Users, sessions, passwords, credentials, recovery, or general audit dumps.
- Inventory, quantity stock, hierarchy, reservations, or Work Orders while those modules remain mock / not production API.
- Future roadmap items as if they were available.
- Seller or Mechanic use of the assistant.
- Questions requiring fields forbidden by the matrix below.
- Answers that invent facts without document or tool evidence.

### Allowed tools and field matrix

| Tool | Allowed inputs | Allowed output fields | Forbidden |
|---|---|---|---|
| `searchCustomers` | query, optional type, limit ≤ 20 | `id`, `name`, `customerType`, `isDefault`, `appPath`, `asOf`, `sourceKey` | RNC, contacts, phone, email, address, notes, credit fields in search list |
| `getCustomerCommercialSummary` | `customerId` | `id`, `name`, `customerType`, `isDefault`, `creditLimitDop`, `creditTermDays`, allowed aggregates, `appPath`, `asOf`, `sourceKey` | RNC, contacts, phone, email, address, notes |
| `searchSalesDocuments` | text/number, status, customer, dates, limit | `id`, COT/CON/FAC numbers, status, dates, currency, totals, `appPath`, seller id/name, fiscal flag, `asOf`, `sourceKey` | customer RNC/phone, NCF value, notes |
| `getSalesDocumentDetail` | `documentId` | document identity fields above; line **description**, unit price, quantities, discount, ITBIS, line/subtotals; payment amount/date/method; balance; seller; fiscal flag; `asOf`, `sourceKey` | line/document notes; acquisition cost; per-document gross profit; customer RNC/phone; NCF |
| `getReceivablesSummary` | customer, overdue, type, cut-off | aggregates; up to 20 document stubs with allowed sales fields; `asOf`, `sourceKey` | PII/contact fields; notes |
| `getProfitabilitySummary` | `dateFrom`/`dateTo`, currency; range ≤ 366 days | aggregate profitability metrics Administrator may already view; `asOf`, `sourceKey` | raw acquisition-cost line dumps; forbidden customer PII |

**Global forbidden to provider context:** RNC/Cédula, phone, email, address, notes (customer, contact, line, or document), users/credentials/sessions, NCF / invoice customer RNC snapshots, acquisition cost on billing lines (COST-006), writing any commercial mutation.

### Cross-feature coordination / conflicts reviewed (M0-T17)

| Feature | Review result |
|---|---|
| **08 Customers** | Assistant uses a narrower projection than `PublicCustomer`. Does not change CUST-* rules. Never sends RNC/contacts/address/notes to the provider. |
| **10 Sales / invoices / quotes** | Read-only search/detail over existing aggregates. Does not change SALE-*/QUOTE-* lifecycle or confirmation rules. |
| **11 Cost / profitability** | Aggregate profitability tool is Administrator-aligned with COST-002..005 visibility. Line acquisition cost stays out of assistant payloads (COST-006). Per-document gross profit is not exposed via sales-detail tool. |
| **12 Payments / CxC** | Read-only payment and receivables summaries for Administrator (PAY-007). No payment recording. |
| **13 Cancellation / refunds** | No cancel/refund tools. Assistant must not imply it can cancel. |
| **16 Conduces** | Live CON-/FAC- documents are in scope for read tools once implemented in production API. Assistant does not issue/convert/cancel conduces. |

No requirement IDs in Features 08–16 were weakened. No cross-edits to those files were required.

## Feature-level acceptance criteria

- Only Administrators can open or call the assistant; Seller/Mechanic receive 403 / no UI.
- Factual answers cite document and/or tool sources; insufficient evidence yields a safe refusal.
- Tools are read-only and honor the field matrix.
- Provider payloads exclude forbidden fields.
- Conversations are owned, auditable, and purged after 90 days.
- Configurable consumption limits are enforced before external cost.
- Mock/future modules are never presented as available.
- Provider outage returns isolated assistant errors; commercial readiness stays up.
- Corpus is manifest-approved and synced explicitly.
- Evaluation thresholds pass before production enablement.
- Feature 17 does not alter the pre-production gate.

## Implementation checklist

### Documentation (M0)

- [x] Canonical Feature 17 with `AI-001`–`AI-010`, supported questions, field matrix, conflict review, and traceability matrix. _(2026-09-22)_
- [x] Feature index, Development Plan, Architecture Plan, Roles and Permissions, and Infrastructure Plan updated. _(2026-09-22)_

### Foundations (M1)

- [x] OpenAI SDK behind ports; typed config; fakes; `.env.example` documented while disabled. _(2026-09-23)_

### Persistence (M2)

- [x] Assistant conversation/message/run/source/knowledge models, migration, ownership, idempotency, purge. _(2026-09-23; AI-005 HTTP 404 ownership remains M6)_

### Corpus (M3)

- [ ] Approved Markdown corpus + manifest; sync CLI; checksum/version tracking. _(2026-09-23: manifest, validate/sync CLIs, checksum, READY retrieval filter implemented locally with unit tests; 6 guides are `draft` pending owner approval; sync integration tests pending execution)_

### Tools (M4)

- [ ] Six read-only tools with Zod, re-auth, field matrix, `asOf`/`sourceKey`.

### Orchestrator (M5)

- [ ] Hybrid RAG + tools + model; evidence rules; quotas; run lifecycle; safe errors.

### API (M6)

- [ ] `/api/assistant` CRUD + SSE; CSRF; rate limit; `503` when disabled.

### Web (M7)

- [ ] Contracts, repository, capability, AppShell panel, accessibility, Markdown sanitization.

### Security and operations (M8)

- [ ] Threat model, logging/metrics/alerts, purge schedule, kill switch, runbook.

### Evaluation and rollout (M9)

- [ ] Dataset ≥ 30 cases; staging; owner approval; production flag off then Admin-only enablement.

## Traceability matrix (requirement → milestone → tests → acceptance)

| Requirement | Primary milestones | Representative tests | Acceptance signal |
|---|---|---|---|
| AI-001 | M6, M7, M8 | 401/403 role; launcher hidden for Seller/Mechanic; capability off | Only Administrator accesses assistant |
| AI-002 | M3, M5, M7, M9 | Documentary Q&A with sources; insufficient evidence | Factual doc answers cite corpus sources |
| AI-003 | M4, M5, M8, M9 | Tool allowlist; unknown tool; fourth call rejected; no writes | Only registered read tools run |
| AI-004 | M4, M5, M8, M9 | Negative field audits; PII never in provider stubs | Forbidden fields absent from provider context |
| AI-005 | M2, M8 | Ownership 404; purge/dry-run; cascade | History owned, auditable, 90-day retention |
| AI-006 | M1, M5, M6, M8 | Daily quota; max input; max tools; max retrieval | Limits enforced before/during external cost |
| AI-007 | M3, M5, M9 | Mock/future prompts refused; no false availability | Mocks/future never presented as live |
| AI-008 | M1, M5, M6, M8 | Provider 5xx/timeout/429; readiness independent | Commercial API/readiness unaffected |
| AI-009 | M3, M8, M9 | Manifest gate; sync checksum; failed sync safe | Only approved corpus indexed |
| AI-010 | M9 | Eval runner thresholds | Production enablement blocked until pass |

## Canonical validated requirements

### AI-001 — Administrator-only access

**Name:** Exclusive Administrator assistant access  
**Status:** CONFIRMED  
**Actors:** Administrator (allow); Seller, Mechanic (deny)  
**Requirement:** The assistant UI and every `/api/assistant` route must be available only to authenticated Administrators. Sellers and Mechanics must not see the launcher and must receive authorization failure on direct API calls. Creating and deleting the actor's own conversations is allowed; commercial write tools are not.  
**Business Reason:** Commercial and operational guidance plus live financial reads are Administrator-sensitive.  
**Main Flow:** Administrator opens the global panel, lists or creates conversations, and sends questions.  
**Business Rules:** Server-side `requireAdministrator` is mandatory. Hiding UI is not authorization. Capability `assistant` may additionally hide the launcher when disabled.  
**Important Exceptions/Edge Cases:** Disabled feature returns `503 ASSISTANT_DISABLED` without implying the role is wrong.  
**Dependencies:** AUTH-005.  
**Acceptance Notes:** Seller and Mechanic cannot open the panel or call assistant endpoints successfully.

---

### AI-002 — Documentary answers with sources

**Name:** RAG answers require visible document evidence  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Answers grounded in operational documentation must retrieve from the approved corpus and expose normalized document sources (title, locator, excerpt/score as applicable, order). Factual claims without adequate retrieval evidence must use an insufficiency response, not invention.  
**Business Reason:** Operators must verify guidance against approved material.  
**Main Flow:** Question → retrieval → model → sources event/UI.  
**Business Rules:** Only manifest-approved documents are searchable. `/docs` must not be indexed wholesale. Sources are data, not instructions.  
**Important Exceptions/Edge Cases:** Low-score hits below threshold do not count as sufficient evidence.  
**Dependencies:** AI-009.  
**Acceptance Notes:** A known corpus question returns at least one relevant document source; an out-of-corpus factual ask refuses or states insufficiency.

---

### AI-003 — Read-only commercial tools

**Name:** Allowlisted live commercial query tools  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** The assistant may call only the registered read-only tools listed in this file. Each tool validates input, repeats Administrator authorization, uses bounded queries, and returns `asOf` and `sourceKey`. No tool may create, update, delete, confirm, pay, cancel, or otherwise mutate commercial or identity data.  
**Business Reason:** Live answers need current commercial state without granting the model write power.  
**Main Flow:** Model requests a tool → registry executes projection → sanitized result returns to the run.  
**Business Rules:** Unknown tools and invalid arguments fail safely. Tool-call count is capped per run. Tool results are untrusted data.  
**Important Exceptions/Edge Cases:** A fourth tool call when max is three is rejected.  
**Dependencies:** AI-001, AI-004; Features 08, 10, 11, 12, 16 read surfaces.  
**Acceptance Notes:** Registered tools succeed for Admin; mutable operations are impossible through the registry; unknown tool names fail.

---

### AI-004 — Provider data minimization

**Name:** Minimum fields to the language-model provider  
**Status:** CONFIRMED  
**Actors:** System (on behalf of Administrator)  
**Requirement:** Payloads sent to the provider and tool outputs used as model context must follow the field matrix in this file. RNC/Cédula, phone, email, address, notes, credentials, users/sessions, NCF/RNC snapshots, and billing-line acquisition cost must never be included.  
**Business Reason:** Reduce third-party exposure of identity and sensitive commercial detail.  
**Main Flow:** Projection builders select allowlisted columns only.  
**Business Rules:** Customer search returns `id`, `name`, `customerType`, `isDefault`, and `appPath` only. Credit limit/term may appear only on the commercial summary tool. Sales detail may include line descriptions and prices but not notes or acquisition cost. Profitability is aggregate-tool only, not per-document profit on sales detail.  
**Important Exceptions/Edge Cases:** Internal DB reads may join restricted columns for filtering but must strip them before provider/tool output.  
**Dependencies:** AI-003; CUST-*, COST-006, PAY-007.  
**Acceptance Notes:** Negative tests show forbidden fields absent from tool outputs and provider request stubs.

---

### AI-005 — Conversation history, audit, and retention

**Name:** Auditable assistant history with 90-day retention  
**Status:** CONFIRMED  
**Actors:** Administrator (own conversations); System (purge)  
**Requirement:** Conversations, messages, runs, and sources persist in PostgreSQL with ownership by `userId`. Actors may list/read/delete only their own conversations. Retention is 90 days via `expiresAt` and batch purge. Assistant deletions must cascade only assistant rows—never users or commercial tables. Runs store safe error codes/IDs, never raw provider errors.  
**Business Reason:** Support review, debugging, and cost control without indefinite chat retention.  
**Main Flow:** Each question creates user message + run; assistant message/sources complete the run; purge removes expired conversations.  
**Business Rules:** Idempotency uses `(conversationId, clientRequestId)`. Concurrent active runs on one conversation are rejected. Foreign conversations are indistinguishable from missing (safe 404).  
**Important Exceptions/Edge Cases:** Cancelled/failed runs must not publish partial text as final completed content.  
**Dependencies:** AI-001.  
**Acceptance Notes:** Ownership isolation holds; purge dry-run lists candidates; cascade does not delete `User` or sales rows.

---

### AI-006 — Consumption limits

**Name:** Configurable assistant usage limits  
**Status:** CONFIRMED  
**Actors:** Administrator; System  
**Requirement:** The system must enforce configurable limits including daily messages per user, max input characters, max output tokens, max tool calls per run, max retrieval results, retrieval score threshold, and request timeout. Limits apply before incurring avoidable external cost where practical.  
**Business Reason:** Control provider cost and abuse.  
**Main Flow:** Validate input and quota → run retrieval/tools/model within caps → record usage on the run.  
**Business Rules:** Defaults and ranges follow the technical plan configuration table; values are injected configuration, not hard-coded in domain services. An emergency global limit may supplement per-user limits.  
**Important Exceptions/Edge Cases:** Quota exhaustion returns a safe, non-retryable or clearly labeled response without calling the provider when possible.  
**Dependencies:** AI-001, AI-005.  
**Acceptance Notes:** Over-limit input and exhausted daily quota are rejected; tool/retrieval caps bind.

---

### AI-007 — Reject mocks and future functionality

**Name:** No false availability for mock or future modules  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** The assistant must not treat inventory, hierarchy, reservations, Work Orders, or other non-production/mock surfaces as live query targets, and must not present Future Roadmap or unconfirmed features as available product behavior. Corpus content and prompts must prefer insufficiency over inventing unimplemented workflows.  
**Business Reason:** Prevent operational mistakes based on prototype-only UI.  
**Main Flow:** Unsupported topic → refusal or corpus clarification that the capability is not available.  
**Business Rules:** No tools registered for excluded modules. Evaluation includes adversarial “act as if inventory API exists” cases.  
**Important Exceptions/Edge Cases:** Documented future intent in approved corpus may describe roadmap only if clearly labeled as not available; prefer omission.  
**Dependencies:** AI-002, AI-003, AI-009.  
**Acceptance Notes:** Questions about mock-only inventory/WO do not return fabricated live records or “how to complete in production” false steps.

---

### AI-008 — Safe degradation on provider outage

**Name:** Isolated assistant failure; commercial continuity  
**Status:** CONFIRMED  
**Actors:** Administrator; System  
**Requirement:** When OpenAI is disabled, misconfigured, timed out, rate-limited, or returning 5xx/invalid responses, the assistant must fail closed with safe client errors and run status FAILED/CANCELLED as appropriate. Application liveness/readiness and commercial billing/CxC/sales APIs must remain available. Missing credentials must not block boot when `ASSISTANT_ENABLED=false`.  
**Business Reason:** The assistant is optional; core commerce is not.  
**Main Flow:** Provider error → mapped internal error → SSE/HTTP safe payload + logged errorId.  
**Business Rules:** Readiness must not require OpenAI (same class as FX-rate non-essential dependency). Kill switch turns the feature off without rollback of the whole app.  
**Important Exceptions/Edge Cases:** Mid-stream failure must not mark partial text as COMPLETED.  
**Dependencies:** AI-001, AI-006.  
**Acceptance Notes:** Simulated provider outage yields assistant errors only; health readiness stays ready; sales endpoints succeed.

---

### AI-009 — Approved corpus and explicit synchronization

**Name:** Manifest-gated knowledge corpus  
**Status:** CONFIRMED  
**Actors:** Administrator (ops); System (sync)  
**Requirement:** Indexable knowledge is Markdown versioned in Git and admitted only through an approval manifest (source key, version, checksum). Synchronization to the provider vector store is an explicit operations action, not an implicit side effect of every process restart. Document index state is tracked (`SYNC_PENDING`, `INDEXING`, `READY`, `FAILED`, `REMOVED`).  
**Business Reason:** Prevent accidental indexing of drafts, secrets, or future docs.  
**Main Flow:** Approve manifest → run sync → documents become READY for retrieval.  
**Business Rules:** Checksum mismatch fails the document safely. Removed sources are dropped from the index.  
**Important Exceptions/Edge Cases:** Partial sync failure must not silently serve stale unapproved content as approved.  
**Dependencies:** AI-002.  
**Acceptance Notes:** Unlisted files are not indexed; sync is dry-run capable; READY documents are retrievable.

---

### AI-010 — Mandatory evaluation before production enablement

**Name:** Quality and safety evaluation gate  
**Status:** CONFIRMED  
**Actors:** Owner; System  
**Requirement:** Before enabling the assistant in production for Administrators, a versioned evaluation dataset (minimum 30 cases: documentary, live, hybrid, adversarial/no-answer) must pass project thresholds: factual answers have evidence; zero forbidden fields; zero commercial mutations; zero future-as-available claims; ≥ 90% correct; ≥ 95% documentary questions with relevant source in top 5; 100% adversarial cases keep permissions/allowlist; P95 time-to-first-token policy as specified in the technical plan for staging.  
**Business Reason:** LLM features need measured quality/safety before customer-facing enablement.  
**Main Flow:** Run eval (fake and staging) → remediate corpus/tools/prompt → freeze versions → owner approval → enable flag.  
**Business Rules:** Production deploys initially with the flag off. Enablement is Administrator-only.  
**Important Exceptions/Edge Cases:** External provider incidents during eval must be documented; they do not waive forbidden-field or mutation failures.  
**Dependencies:** AI-001–AI-009.  
**Acceptance Notes:** Checklist and eval report show thresholds met before `ASSISTANT_ENABLED=true` in production.
