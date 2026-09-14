# Feature 14 — History, Protected Administration, Recovery, and Diagnostics

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `HIST-001, HIST-002, HIST-003, ADMIN-001, ADMIN-002`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**History is cross-cutting from Release 1; full Administration/Recovery closes in Release 8**

**Implementation (2026-09-10):** User/customer/catalog/invoice confirmation/payment/PDF/cancellation events append in the writing transaction. Invoice detail `GET /api/sales/:id` plus HTTP UI project a Seller/Administrator timeline (profit/FX events Administrator-only). Owner: draft meta edits and line add/update/remove are not invoice activity — they are not appended; already-stored rows of those types are hidden, not deleted. No standalone history HTTP API or admin screen. PDF regeneration is production (sales). Pending USD retry is production on **profitability**, not recovery. Cost/currency/baseline corrections, reservation/WO recovery, and diagnostics remain open. Mock recovery screens do not count.

## What this feature does

Keep critical business state explainable through append-only events and provide narrow Administrator-only corrections/recovery/diagnostics without raw data editing.

## Architecture ownership

Primary logical module: **history / administration / operational-recovery**.

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

Controllers translate HTTP only. Business rules belong in services. Prisma/database access belongs in repositories or transaction-aware persistence helpers. Server-side authorization and runtime validation are mandatory.

## How to implement it

### Recommended implementation shape

History is business evidence appended by the service that successfully executes the state-changing transaction. It is not a generic log and is not a substitute for current state.

Store event time, actor, subject, event type, and relevant immutable references/before-after context. Failed business commands must not append success events.

### Release 1 slice

In Release 1, implement only:

- the reusable event envelope (actor, time, subject, event type, references/payload);
- user-lifecycle events such as user creation, role change, activation, and deactivation;
- profile changes (name, username, phone, email) with immutable before/after snapshots, and voluntary/required own-password changes with metadata only (owner approval, 2026-09-05);
- password-recovery requests, approval/rejection, expiry and cancellation from Feature 01 M8, without credentials;
- proof that deactivated users remain resolvable as historical actors.

The envelope distinguishes `USER` (required user FK), `ANONYMOUS` and `SYSTEM` (null user FK). Public recovery requests do not prove the account owner's identity: record the account as subject and the actor as anonymous. Expiry is attributed to the system. Initial bootstrap creation uses a system actor with explicit `BOOTSTRAP_CLI` source; it does not claim an authenticated human actor. Do not fabricate historical creation events for pre-existing accounts.

Do **not** implement operational recovery, diagnostics, or non-user business events in Release 1. Password recovery from Feature 01 is included; operational recovery under ADMIN-002 remains Release 8. Add other event types when their owning features are implemented.

M9 uses an internal transaction-aware history module (service/repository/validation/types), without HTTP routes/controllers or a history UI in Release 1. The runtime repository only appends; PostgreSQL rejects event UPDATE/DELETE. This is not protection against database-owner DDL or privileged TRUNCATE; deployment privileges belong to the production preparation scope.

Protected corrections are named commands with explicit eligibility, reason, actor, before/after state, and additive event. They must never become an arbitrary status editor.

Administration and Operational Recovery is a small set of explicit commands: abandoned reservation release, eligible Work-Order release/reassign/cancel, failed PDF regeneration, practical evidence recovery, pending USD profitability retry, protected acquisition-cost/baseline/no-payment-currency correction, and read-only consistency diagnostics.

Diagnostics should surface affected business records and safe next-action context; they do not silently mutate data.

## Feature-level acceptance criteria

- Every critical successful business transition appends the expected event once.
- Deactivated users remain identifiable in history.
- Original events/evidence are not silently removed by corrections.
- Protected commands require Administrator and appropriate reason/eligibility.
- Recovery cannot bypass evidence, hierarchy, financial, or invoice invariants.
- Diagnostics detect the validated classes of impossible/stuck state and are read-only.
- Operational logs and business history remain separate concerns.

## Implementation checklist

### History

- [x] Define event envelope and typed event categories (R1 user events).
- [x] Append events inside the same DB transaction as business changes (R1; extend per owning release).
- [x] Preserve relevant immutable references/before-after values (R1 profiles, roles and recovery references).
- [x] Append invoice confirmation, payment and cancellation/refund evidence in their owning transactions.
- [ ] Add history projections per item/invoice/order as needed. _(Invoice detail GET + HTTP UI timeline done for document-level events; draft/line churn excluded; item/Work Order projections remain open)_

Release 1 automated closure coverage revalidates user creation, deactivation and recovery events through the API/integration suite. M11 intentionally adds no history endpoint or screen.

### Protected administration

- [ ] Cost correction.
- [ ] Receipt-baseline correction.
- [ ] Completed/no-payment invoice-currency correction.
- [ ] User/catalog/restriction protected operations.
- [ ] All corrections require reason and additive history.

### Recovery

- [ ] Abandoned reservation release.
- [ ] Work-Order release/reassign/cancel.
- [x] PDF regeneration. _(API R2 M18: `POST /api/sales/:id/pdf/regenerate` solo Administrator y `pdfStatus FAILED`; UI HTTP M23 en el detalle; el resto de ADMIN-002 sigue Release 8)_
- [ ] Evidence recovery where safe.
- [ ] Pending USD profitability retry. _(Command exists as API R2 M16 `POST /api/profitability/:invoiceId/retry`. HTTP UI is R2 M24 on `/profitability`, not the recovery module. Recovery packaging and ADMIN-002 remain Release 8.)_

The abandoned-reservation and Work-Order items previously marked as
complete are available only in the mock prototype. Their HTTP repositories remain
explicitly unimplemented; mock behavior does not complete ADMIN-002. Failed invoice
PDF regeneration is implemented in the production API as Release 2 M18 and wired in
the invoice detail UI as M23. Pending USD retry is implemented on the profitability
API and HTTP profitability page (M16/M24), not as a recovery-module command.
The rest of ADMIN-002 remains Release 8.

### Diagnostics

- [ ] Negative/invalid quantity states.
- [ ] Stuck/orphan reservations.
- [ ] Multiple parents/cycles/broken relationships.
- [ ] Duplicate active physical operations.
- [ ] Impossible Work-Order assignment/evidence state.
- [ ] Impossible invoice/payment/refund balances.
- [ ] Pending FX profitability.
- [ ] Metadata/object mismatches for PDF/evidence/photos where applicable.
- [ ] Tests prove diagnostics do not mutate records.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### HIST-001 — Relevant Operational Events

**Name:** Minimum business history  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** The system must record relevant creation, edit, catalog maintenance, location, restriction, initial assembly baseline and all checklist outcomes, known-missing creation/resolution, completeness derivation, Draft currency edit, internal-number assignment, reservation, sale, payment, invoice cancellation, refund, restoration, Work Order creation/take/assignment/reassignment/release/cancellation/completion, hierarchy change, evidence, recovery, and protected correction events.  
**Business Reason:** Current state must be explainable without enterprise-scale audit tooling.  
**Main Flow:** Each qualifying business operation appends its event in the same transaction as the state change.  
**Business Rules:** History is not a substitute for current state and cannot be silently deleted; baseline-origin and Work-Order-origin relationships remain distinguishable.  
**Important Exceptions/Edge Cases:** Failed operations produce no success event or partial business state; a Known Missing Component history event does not imply a physical inventory item exists. **Owner (2026-09-10):** invoice *activity* does not treat draft meta edits (customer/currency/fiscal) or line add/update/remove as relevant events. Those types are no longer appended; existing rows stay in `HistoryEvent` (HIST-003) but are omitted from the invoice detail timeline. Current invoice and line rows remain the source of truth for those edits. Document-level events still recorded: draft created/discarded, confirmation (`FAC-`), payment, PDF generate/fail, cancellation/refund, Administrator-only gross-profit and USD FX retry.  
**Dependencies:** AUTH-001, WO-002, WO-010.  
**Acceptance Notes:** Each critical flow produces the expected linked events once, including a received baseline with `PRESENT`, `MISSING`, and `NOT_APPLICABLE` results but no Work Order.

---

### HIST-002 — Event Attribution and References

**Name:** Trace actor and related records  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Every history event must preserve time, actor, affected subject, event type, and relevant parent, baseline/checklist provenance, Known Missing Component origin and component/category semantics, former physical item, Work Order, invoice internal number and currency, exchange-rate provenance for a completed `USD` profitability calculation, customer, payment/refund, reason, evidence, assignment, or before/after values when applicable.  
**Business Reason:** Staff need to reconstruct who changed what and why.  
**Main Flow:** The operation supplies context; history stores the relevant immutable references.  
**Business Rules:** Deactivated users remain identifiable in past events; an initial baseline has actor, timestamp, and receipt provenance but no Work Order or evidence; an invoice currency correction preserves both the previous and the corrected currency; Mechanic-facing history remains limited by AUTH-002 and WO-003 even when underlying events link commercial records.  
**Important Exceptions/Edge Cases:** Automated future actions must identify themselves distinctly from human users; `MISSING_AT_RECEIPT` conditions reference their expected definition rather than an inventory ID, while `REMOVED_AFTER_BASELINE` may reference the former real item and Work Order.  
**Dependencies:** HIST-001, AUTH-004.  
**Acceptance Notes:** Staff can reconstruct both a received assembly baseline and a later installed-item sale/removal without exposing commercial data to Mechanic.

---

### HIST-003 — Additive Corrections

**Name:** Never silently rewrite evidence  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrative corrections, including protected initial-baseline, acquisition-cost, and completed/no-payment invoice-currency corrections, invoice or Work Order cancellation, refund, restoration, reassignment, release, and recovery must append reasons and corrective events rather than remove original evidence. Administrator-recorded unavailable gross profit appends an additive event with actor, timestamp, and before/after amounts and does not require a typed reason.  
**Business Reason:** Business disputes and mistakes require an understandable before-and-after record.  
**Preconditions:** The actor is authorized for the correction or reversal.  
**Main Flow:** User supplies the required reason; the system records actor, timestamp, before state, corrected state, and the approved additive correction event.  
**Business Rules:** Original baseline events, completed invoices, immutable assembly-sale snapshots, original payment/refund records, completed Work Orders, evidence, and later physical history remain preserved.  
**Important Exceptions/Edge Cases:** A correction cannot bypass dedicated invoice cancellation/refund or Work Order flows, cannot directly change completed-invoice currency after a payment exists, cannot mark physical work Completed without required evidence, and cannot reclassify a later hierarchy change as receipt reality. A correction that would contradict later immutable events is surfaced for protected reconciliation rather than silently applied.  
**Dependencies:** INV-006, CANCEL-001, PAY-005, WO-010, HIER-011, HIST-002.  
**Acceptance Notes:** Review shows original event, corrective event, actor, reason, and resulting state without erasing or reopening baseline provenance.

---

### ADMIN-001 — Protected Administration

**Name:** Essential protected business operations  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrator may manage users; maintain inventory categories, expected-component definitions, mechanical service catalog, and small controlled options; apply or remove `No desarmar`; create manual Work Orders; cancel confirmed invoices and register refunds; perform protected corrections including acquisition cost, initial receipt baseline, and completed/no-payment invoice currency; record judged gross profit when calculation is unavailable; use recovery; and view profitability.  
**Business Reason:** Sensitive configuration and financial controls need one clear authority level.  
**Main Flow:** Administrator opens the relevant administrative function and performs an authorized, validated action.  
**Business Rules:** Seller may perform normal commercial and inventory operations and view acquisition cost but not these protected operations; Mechanic remains limited to Work Orders; this does not introduce configurable enterprise permissions.  
**Important Exceptions/Edge Cases:** Seller may use catalogs but cannot maintain them or edit protected acquisition cost. Administrator cannot bypass domain rules, directly correct currency after payments exist, reopen HIER-011, rewrite later immutable events, or complete physical work without evidence.  
**Dependencies:** AUTH-003, AUTH-005, CAT-001, HIER-009, COST-001, COST-004, CANCEL-001, WO-006, ADMIN-002.  
**Acceptance Notes:** Each listed protected action is server-authorized and historically attributable.

---

### ADMIN-002 — Administration and Operational Recovery

**Name:** Safe recovery and consistency diagnostics  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** The MVP must provide small named administrative operations to inspect/release abandoned reservations, inspect/release/reassign/cancel eligible Work Orders, regenerate a failed invoice PDF, retry/recover failed evidence uploads where practical, retry a pending `USD` profitability calculation, and inspect critical consistency diagnostics.  
**Business Reason:** Common operational failures must be recoverable without direct data manipulation or loss of valid commercial history.  
**Preconditions:** Administrator selects an eligible named operation and supplies a reason where appropriate. An abandoned-Draft release additionally requires at least six hours since the Draft's `createdAt`.  
**Main Flow:** The system validates the requested recovery, including the six-hour boundary for an abandoned Draft, shows relevant current context, applies only the named business operation, and records actor, time, reason, and before/after state. Crossing the boundary never releases inventory without this explicit action.  
**Business Rules:** This is not a SQL console, raw database editor, arbitrary status selector, or domain-rule bypass; regenerating a PDF does not roll back a valid sale, and recovery cannot waive evidence or invent physical completion. Retrying a pending profitability calculation is a secondary enrichment only: it may not rerun the sale, resell inventory, modify payments, reconfirm the PDF as a sale, invent a rate, or present an unrelated later live rate as the sale-time rate, and a successfully calculated result is preserved with its rate provenance under COST-003.  
**Important Exceptions/Edge Cases:** Diagnostics must identify negative stock, stuck/orphan reservations, multiple current parents, hierarchy cycles, duplicate active physical operations, impossible invoice/payment balances, unresolved `UNAVAILABLE / PENDING FX RATE` profitability results, inconsistent critical state, and a requested baseline correction that conflicts with later immutable events without silently auto-correcting them.  
**Dependencies:** AUTH-005, COST-003, RES-003, SALE-004, WO-005, WO-010, HIST-003.  
**Acceptance Notes:** Each recovery action is narrowly authorized and auditable, diagnostics surface each listed inconsistency including unresolved profitability calculations, a successful profitability retry changes no commercial or inventory state, and no tool permits arbitrary data or status editing.
