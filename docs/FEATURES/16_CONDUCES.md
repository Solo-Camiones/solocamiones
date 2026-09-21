# Feature 16 — Commercial Conduces

## Status and authority

**CONFIRMED (documentation).** This file is the implementation source of truth for requirement IDs: `CON-001, CON-002, CON-003, CON-004, CON-005, CON-006`.

These IDs were added 2026-09-20 for the commercial-conduce change set sequenced in `docs/plan_feature_contado/IMPLEMENTATION_PLAN.md`. That plan is technical sequencing and progress only. **Do not implement behavior from the plan file when a CON-* ID exists here.**

Owner clarifications recorded at M1 close (2026-09-20), which supersede earlier wording in the plan’s “Decisiones confirmadas” where they conflict:

1. The Administrator `CASH` balance exception applies **only when issuing a conduce**, never when confirming a direct invoice (`DRAFT` / `QUOTE_ISSUED` → `COMPLETED` without `CON-`).
2. That exception applies only to **named** `CASH` customers. The generic default `Cliente contado` (`isDefault`) **always** requires full settlement at conduce emission and at direct invoice confirmation.
3. Cancellation refunds are a **global** rule: Administrator may indicate an actual refund from zero through net collected on any cancellable commercial operation (invoice-only or conduce / `CON-+FAC-`).

Checklist items below stay `[ ]` until the owning milestones deliver implementation **and** tests. Do not mark them complete from documentation alone.

If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Required before the first production release** (pre-production gate amendment, 2026-09-20). Sequenced as milestones M2–M8 in `docs/plan_feature_contado/IMPLEMENTATION_PLAN.md` after this documentation milestone (M1).

**Implementation:** Not started in API or HTTP. Domain, payments, CxC, PDFs, reports, and UI land in later milestones. Existing direct invoice confirmation, quotes, and payments remain as Features 08/10/12/13 until those milestones amend runtime behavior.

## What this feature does

Add a commercial **conduce** stage on the same sales aggregate as drafts, quotes, and invoices. Emitting a conduce recognizes the sale once (inventory, CxC, profitability, FX), assigns an independent `CON-` number, and freezes commercial snapshots. Converting the conduce to an invoice later assigns `FAC-` without recalculating money, re-running inventory, or duplicating payments or metrics. Direct invoice confirmation without a conduce remains available and keeps current cash/credit confirmation rules.

## Architecture ownership

Primary logical module: **sales** (same aggregate as invoices/quotes), with payments, cancellation, documents, profitability, CxC, and history consuming the new state.

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

Keep one sales aggregate. Do not copy lines or payments into a second document when issuing or invoicing a conduce.

Planned commercial transition (plus the existing direct path):

```text
DRAFT / QUOTE_ISSUED → CONDUCE → COMPLETED (factura) → CANCELLED
DRAFT / QUOTE_ISSUED → COMPLETED (factura directa, sin CON-) → CANCELLED
```

- `confirmedAt` is the commercial recognition timestamp: conduce emission **or** direct invoice confirmation.
- `conduceIssuedAt` / `conduceNumber` record conduce identity.
- `invoiceIssuedAt` / `number` (`FAC-`) record invoice identity when present.
- Conduce document is always non-fiscal. Fiscal choice is made again when converting to invoice.
- `Aplicar ITBIS` remains independent of fiscal emission (SALE-009 / SALE-010).
- Issued conduce is immutable: no line, customer, currency, discount, or total edits.

### Permission and payment matrix (conduce emission)

| Case | Rule |
|---|---|
| Seller + `CASH` (any, including default `Cliente contado`) | Full payment required at emission. |
| Seller + `CREDIT` DOP | No initial payment; credit limit and term apply. |
| Seller + USD | Full payment required. |
| Administrator + named `CASH` DOP/USD | Payment zero, partial, or full; if balance remains, `dueDate` must be on or after the local emission calendar day (`America/Santo_Domingo`). |
| Administrator + default `Cliente contado` | Full payment required (same as Seller). |
| Administrator + `CREDIT` DOP | Payment zero, partial, or full; limit and term apply. |
| Administrator + `CREDIT` USD | Full payment required. |
| Later collections on an open conduce or its later invoice | Administrator only (`POST /api/sales/:id/payments`). |
| Convert conduce → invoice | Administrator and Seller. |
| Cancel / refund | Administrator only. |

Direct invoice confirmation does **not** use the Administrator named-`CASH` balance exception: SALE-005 / PAY-001 remain in force for `FAC-` without `CON-`.

### Cross-feature coordination

- **Customers (08):** Default `Cliente contado` stays non-credit and fully paid on every recognition path. Named `CASH` is not reclassified as `CREDIT` when Administrator leaves a conduce balance.
- **Sales / quotes (10):** Quote may convert to conduce or to invoice; expired quotes cannot convert. Direct confirm stays available.
- **Payments / CxC (12):** Open conduces with balance appear in AR; filters accept `CON-` and `FAC-`. Converting to invoice preserves payments, balance, payment state, and due date.
- **Cancellation (13):** Cancel extends to conduces; if `FAC-` already exists, cancel the whole `CON-/FAC-` operation. Refund amount is zero through net collected (global CANCEL-002).
- **Profitability / reports (11):** Recognize once at conduce emission; conversion must not double-count.
- **History (14):** Append `CONDUCE_ISSUED`, `QUOTE_CONVERTED_TO_CONDUCE`, `CONDUCE_INVOICED` in the writing transaction.

## Feature-level acceptance criteria

- Issuing a conduce assigns a unique never-reused `CON-` and freezes commercial snapshots.
- Direct invoice confirmation without conduce remains possible and keeps current cash/credit rules.
- Administrator may leave balance only on a **named** `CASH` conduce; default `Cliente contado` and all Seller `CASH`/USD paths require full payment at emission.
- Converting to invoice assigns `FAC-`, sets `invoiceIssuedAt` to conversion time, keeps original due date and ledger, and does not recalculate lines/totals/ITBIS or re-run inventory/FX/profitability.
- Conduce PDF never shows NCF, payments, or balance; invoice PDF may show origin `CON-` / `COT-` and blank NCF.
- Cancelling a conduce or a `CON-/FAC-` pair is Administrator-only; refund is within zero..net collected; outstanding balance is extinguished.
- Reports, CxC, and history treat one commercial operation before and after invoicing.
- Seller cannot record later payments or cancel; Seller may convert conduce → invoice when authorized.

## Implementation checklist

### Domain and lifecycle (M2–M3)

- [x] `CONDUCE` status on the sales aggregate with `conduceNumber` / `conduceIssuedAt` / `invoiceIssuedAt` (CON-001). *(Domain/migration M2, 2026-09-20; emission API remains M3.)*
- [x] Independent `CON-` sequence; no reuse after cancellation (CON-001). *(Sequence + uniqueness M2; emission path M3.)*
- [ ] Issue conduce from draft; convert quote → conduce; convert conduce → invoice with `{ fiscal: boolean }` (CON-001, CON-003).
- [ ] Idempotent issue/convert; immutable issued conduce (CON-001, CON-003).

### Domain migration notes (M2)

- Migrations: `20260920000000_conduce_status_enum`, `20260920000001_conduce_domain`.
- Backfill: existing rows with `FAC-` receive `invoiceIssuedAt = confirmedAt`. New direct confirmations set both timestamps equal via `completeInvoice`.
- DB constraints allow active conduce (no `FAC-`), converted (`CON-`+`FAC-`), cancelled conduce-only, cancelled with both numbers, and historical invoices without conduce.
- `InvoiceSequence` row `CON` starts at `nextValue = 1`. Format `^CON-[0-9]{6}$`.

### Payments, CxC, cancellation (M4)

- [ ] Full actor/customer/currency/payment matrix including named-`CASH` Admin exception and default-`Cliente contado` full-pay rule (CON-002).
- [ ] Credit exposure includes open conduce balances; `dueDate` rules for Admin named-`CASH` with balance (CON-002).
- [ ] Later payments Administrator-only; convert preserves ledger (CON-002, CON-003).
- [ ] Cancel/refund zero..net for conduce and for invoice-only operations (CON-005, CANCEL-002).
- [ ] Documented inventory effects when ITEM/QTY enabled: emit consumes; cancel restores once; convert does not touch inventory (CON-005).

### Documents (M5)

- [ ] Conduce PDF renderer and `GET /api/sales/:id/conduce.pdf` (CON-004).
- [ ] Invoice PDF shows origin `CON-` when applicable; both PDFs remain downloadable after conversion (CON-004).

### Reports and history (M6)

- [ ] Profitability, CxC, KPIs, seller-sales, and history include conduces once (CON-006).
- [ ] History events `CONDUCE_ISSUED`, `QUOTE_CONVERTED_TO_CONDUCE`, `CONDUCE_INVOICED` (CON-006).

### Web and mocks (M7)

- [ ] Draft/quote/conduce actions, labels, filters, and role-gated payment/cancel UI (CON-001..CON-005 UI).
- [ ] Mock parity with HTTP contracts (CON-*).

### Stabilization (M8)

- [ ] Migration, suites, walkthroughs, and pre-production gate evidence for conduces.

## Canonical validated requirements

### CON-001 — Conduce lifecycle and numbering

**Name:** Conduce on the sales aggregate  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A conduce is a stage of the same sales aggregate that may later become an invoice. Valid transitions include `DRAFT → CONDUCE → COMPLETED`, `QUOTE_ISSUED → CONDUCE → COMPLETED`, and the existing direct `DRAFT` / `QUOTE_ISSUED → COMPLETED` path without a conduce. Emitting a conduce assigns the next unique never-reused `CON-000001`-style number, freezes customer, lines, currency, discount, ITBIS, totals, and seller attribution, sets `confirmedAt` / `conduceIssuedAt`, and does not assign `FAC-`.  
**Business Reason:** The business needs a commercial delivery document that recognizes the sale before a formal invoice without duplicating the operation.  
**Main Flow:** Actor issues a conduce from a draft or converts an eligible issued quote; optionally later converts the conduce to an invoice.  
**Business Rules:** Users never type `CON-` numbers. Cancelled conduces keep their number (never reused). Issued conduces are immutable. `confirmedAt` is commercial recognition (conduce emission or direct invoice confirmation). `invoiceIssuedAt` is set only when `FAC-` is assigned. Historical invoices without conduce remain valid.  
**Important Exceptions/Edge Cases:** Failed emission consumes no `CON-`. Retry is idempotent or returns a safe conflict. Expired quotes cannot convert to conduce.  
**Dependencies:** SALE-001, SALE-002, QUOTE-001, QUOTE-002, HIST-001.  
**Acceptance Notes:** Issue yields `CON-000001` without `FAC-`. Direct confirm still yields `FAC-` without `CON-`. A second issue/convert does not duplicate numbers or lines.

---

### CON-002 — Payments, credit, due date, and permissions on conduce

**Name:** Financial matrix for conduce emission and later collection  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Initial payment at conduce emission follows the matrix in this file. Later collections reuse `POST /api/sales/:id/payments` and are Administrator-only. Open `CREDIT` DOP conduce balances count toward the customer credit limit.  
**Business Reason:** Counter and credit sales must keep Seller limits while allowing Administrator flexibility on named cash conduces.  
**Main Flow:** Actor supplies allowed initial payment (and `dueDate` when required); system validates customer type, currency, limit, and permissions, then records the ledger and derived payment state.  
**Business Rules:**  
- Seller + any `CASH` (including default `Cliente contado`): full payment required.  
- Seller + `CREDIT` DOP: zero initial payment; limit and snapshotted term apply; `dueDate` = local emission date + `creditTermDays` end of day in `America/Santo_Domingo`.  
- Seller + USD: full payment required.  
- Administrator + **named** `CASH` DOP or USD: zero, partial, or full payment. If balance remains, actor-supplied `dueDate` must be on or after the local emission calendar day (end of day). This is not a customer-type change to `CREDIT` and does not use credit limit.  
- Administrator + default `Cliente contado`: full payment required.  
- Administrator + `CREDIT` DOP: zero, partial, or full within limit/term.  
- Administrator + `CREDIT` USD: full payment required.  
- A payment of 0 is not persisted. Direct invoice confirmation without conduce keeps SALE-005 / PAY-001 (all `CASH`, including default and named, settle in full; USD cannot confirm with remaining balance).  
**Important Exceptions/Edge Cases:** Exceeding credit limit is rejected even for Administrator. Concurrent credit exposures include open conduce balances.  
**Dependencies:** SALE-005, CUST-002, CUST-004, CUST-005, PAY-001, PAY-007, CON-001.  
**Acceptance Notes:** Seller named-`CASH` conduce with partial payment is rejected. Administrator named-`CASH` DOP conduce with partial payment and valid `dueDate` succeeds and appears in AR. Administrator default `Cliente contado` conduce with partial payment is rejected. Direct Admin named-`CASH` invoice confirm with partial payment remains rejected.

---

### CON-003 — Convert conduce to invoice

**Name:** Invoice a conduce without recalculating the sale  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Converting a conduce to an invoice assigns `FAC-`, sets `invoiceIssuedAt` to conversion time, accepts `{ fiscal: boolean }`, validates fiscal identity against the **frozen conduce customer snapshot**, preserves due date and payment ledger, and does not recalculate lines, discount, ITBIS, or totals, create/modify payments, or re-run inventory, FX, or profitability. Seller attribution remains the conduce issuer; the converting actor is recorded in history.  
**Business Reason:** The invoice is the fiscal/commercial formalization of an already recognized sale.  
**Main Flow:** Actor chooses fiscal flag and converts; system assigns `FAC-` on the same aggregate id and keeps origin `CON-` (and `COT-` when present).  
**Business Rules:** Conduce document remains non-fiscal forever. A prior draft/quote fiscal flag does not make the conduce fiscal. Cancelled conduces cannot convert. Conversion is idempotent or safely conflicts.  
**Important Exceptions/Edge Cases:** Fiscal conversion rejected when the frozen snapshot lacks qualifying RNC/Cédula (including default `Cliente contado`).  
**Dependencies:** CON-001, SALE-003, SALE-004, CUST-003, CUST-007, COST-003, HIST-001.  
**Acceptance Notes:** After conversion, money and `confirmedAt` match the conduce; `invoiceIssuedAt` is the conversion day; payments and balance are unchanged.

---

### CON-004 — Conduce and invoice documents

**Name:** PDF output for conduce and converted invoice  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator (download); Mechanic denied  
**Requirement:** The system must produce a regenerable conduce PDF and keep the invoice PDF path. Conduce PDF shows `CON-`, emission date, origin `COT-` when present, customer, seller, lines, prices, discount, ITBIS, and total. It must not show NCF, payment history, or balance. Converted invoice PDF shows `FAC-`, origin `CON-`, origin `COT-` when applicable, invoice date = conversion, original seller, and blank `NCF: ______________________`. Both PDFs remain downloadable after conversion.  
**Business Reason:** Warehouse/customer may need the conduce while accounting needs the invoice, without rewriting frozen facts.  
**Main Flow:** Emission/conversion stores facts; PDF endpoints render from snapshots.  
**Business Rules:** Conduce is never fiscal. Invoice fiscal/non-fiscal follows CON-003. PDF failure must not roll back emission or conversion. `GET /api/sales/:id/pdf` remains the primary invoice document; `GET /api/sales/:id/conduce.pdf` is the conduce document.  
**Important Exceptions/Edge Cases:** Historical invoices without conduce keep current invoice PDF behavior.  
**Dependencies:** DOC-001, SALE-004, CON-001, CON-003.  
**Acceptance Notes:** Conduce PDF has no NCF field content implying issuance. Invoice after conduce shows `CON-` origin and blank NCF.

---

### CON-005 — Cancellation, refund, and inventory effects

**Name:** Cancel conduce or CON-/FAC- operation  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrator may cancel an active conduce or a completed invoice that originated from a conduce. If `FAC-` exists, cancellation cancels the whole `CON-/FAC-` operation. Refund amount is an indicated actual return from **zero through net collected** (same global CANCEL-002 rule as invoice-only cancellations). Outstanding balance is extinguished. Refund above net collected is rejected.  
**Business Reason:** Commercial reversal must cover conduce-recognized sales without erasing ledger history.  
**Main Flow:** Administrator supplies reason and refund amount/method; system cancels, appends refund if amount &gt; 0, clears open balance, and writes history.  
**Business Rules:** Seller cannot cancel. Original payments remain; refunds are additive. When inventory is enabled: emitting a conduce consumes reservation / marks sold; cancellation restores eligible stock exactly once; converting to invoice does not touch inventory. Full ITEM/QTY module work remains later releases; document the rule and share the same transactional boundary when enabled.  
**Important Exceptions/Edge Cases:** Concurrent payment/cancel races revalidate. Idempotent cancel does not double-restore inventory or double-refund.  
**Dependencies:** CANCEL-001, CANCEL-002, CANCEL-003, PAY-005, CON-001, HIST-003.  
**Acceptance Notes:** Cancel unpaid conduce with refund 0 succeeds. Cancel partially paid conduce with refund equal to net collected succeeds. Refund above net is rejected. Cancelling after `FAC-` leaves both documents cancelled.

---

### CON-006 — CxC, profitability, reports, and history

**Name:** Single commercial recognition across metrics and timeline  
**Status:** CONFIRMED  
**Actors:** Administrator (financial projections); Seller sees non-financial document activity per PAY-007  
**Requirement:** From conduce emission, the operation counts once in profitability, CxC, sales/collection KPIs, seller-sales attribution, and operation history. Conversion to invoice must not duplicate rows or totals. While no `FAC-` exists, primary document label is `CON-`; after invoicing, primary is `FAC-` with `CON-` as origin. Commercial date for recognition remains `confirmedAt`; `invoiceIssuedAt` is documentary. USD FX/profitability runs at conduce emission and is not recalculated on convert. Seller attribution stays with the conduce issuer. History records `CONDUCE_ISSUED`, `QUOTE_CONVERTED_TO_CONDUCE`, and `CONDUCE_INVOICED`.  
**Business Reason:** Conduce is a real sale; invoicing must not inflate metrics.  
**Main Flow:** Emission writes commercial and financial effects; conversion updates document identity only.  
**Business Rules:** Do not treat `CON-` and `FAC-` as two sales. Financial events remain Administrator-projected where PAY-007 already requires it. Seller-sales and similar reports must include conduces without double-counting after invoice. Label changes from “Facturado-only” to “Ventas” are allowed when needed for correctness.  
**Important Exceptions/Edge Cases:** Direct invoices without conduce keep current report inclusion rules. Cancelled operations are excluded from open AR and from invoiced/collected KPIs per existing cancellation rules.  
**Dependencies:** COST-002, COST-003, PAY-006, PAY-007, HIST-001, CON-001, CON-003.  
**Acceptance Notes:** One row/total before and after convert. Seller-sales attributes to conduce issuer when a different Administrator invoices.
