# Feature 12 — Payments and Basic Accounts Receivable

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, STMT-001`.

`PAY-006`, `PAY-007`, and `STMT-001` were added 2026-09-15. `PAY-001` and `PAY-002` were amended the same day. This file is authoritative over `docs/pre_production_business_changes/IMPLEMENTATION_PLAN.md`. Credit limits and customer terms live in Feature 08 (`CUST-004`–`CUST-006`), not in this file.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 3 — Immediate financial priority after Billing Core**

**Implementation (2026-09-10):** Pulled forward into the Release 2 local codebase. Production API + HTTP UI for the financial slice are in place (`InvoicePayment`, confirm-time optional payment, `POST /api/sales/:id/payments`, `GET /api/sales/receivables`, invoice payment history). **Do not treat this feature as complete.** Remaining checklist items that belong to Release 3 must still be implemented (Release 2 is closed). Aging and collections stay deferred as specified in this file.

**Pre-production change set (2026-09-16):** Paso 7 implements derived `ABONADO` states (`PAY-006`), issued date on the AR list, and Administrator AR filters limited to customer and invoice (`PAY-007`). Paso 5 already restricted later payments and CxC: `POST /payments` and `GET /receivables` are Administrator-only (Seller 403); Seller nav/deep links to CxC are denied, and Seller invoice list/detail omit payment state, paid amount, outstanding balance, refunds, and movements. Paso 8 implements the Administrator-only customer account-statement PDF (`STMT-001`) from CxC.

**Commercial conduces (2026-09-20, documentation + M4 runtime):** Feature 16 extends AR and later collections to include emitted conduces with open balance (`CON-002`, `CON-006`). Direct invoice confirmation cash/credit rules stay in SALE-005 / PAY-001. Administrator named-`CASH` balance is conduce-emission only and excludes default `Cliente contado`. Open `CONDUCE` rows appear in `GET /receivables` and account statements; document filter accepts `FAC-` and `CON-`.

## What this feature does

Record cash/credit behavior through an additive same-currency payment ledger and derive useful basic Accounts Receivable views without building an advanced accounting/collections module.

## Architecture ownership

Primary logical module: **payments / accounts-receivable queries**.

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

Payments own money received and refunded; Sales owns invoice state. Never equate `Completed` with `Paid`. A completed invoice may be unpaid, partially paid, or paid, and inventory/physical state does not depend on payment completion.

Use additive payment records with amount, invoice currency, method, date, reference, actor, and idempotency identity. Never overwrite prior payments to represent later receipts. Reject overpayment under the current validated rules. Every payment/refund must use the invoice currency; do not perform operational currency conversion.

Derive the public state from the preserved ledger and due date; do not store a mutable payment-status column. The validated derived states are:

| Condition                          | Technical state          | Visible label        |
| ---------------------------------- | ------------------------ | -------------------- |
| No payments, still within term     | `PENDING`                | `PENDIENTE`          |
| Partial payment, still within term | `PARTIALLY_PAID`         | `ABONADO`            |
| No payments, past due              | `OVERDUE`                | `VENCIDA`            |
| Partial payment, past due          | `PARTIALLY_PAID_OVERDUE` | `ABONADA VENCIDA`    |
| Zero balance on or before due date | `PAID`                   | `PAGADA`             |
| Zero balance after due date        | `PAID_LATE`              | `PAGADA CON RETRASO` |
| Cancelled invoice                  | `CANCELLED`              | `CANCELADA`          |

Credit due date **no longer defaults to +30 for every invoice**. For new credit invoices it uses the customer term snapshotted at confirmation (CUST-005): local calendar date in `America/Santo_Domingo` plus `creditTermDays` (30, 45, 60, 90, or 120), expiring at the end of that day. It cannot be overridden per invoice. For a fully paid cash invoice (`CASH`, or `USD` settled in full), `dueDate` is that same local confirmation calendar day at end of day — not `null` and not confirmation+30 (SALE-005). Settlement timing uses payment effective dates, not record timestamps. Existing completed invoices keep their already stored due dates; only new credit invoices use the customer term.

Issued date on AR is `confirmedAt` (commercial recognition: when `FAC-` is assigned on direct confirm, or when a conduce is emitted), never draft `createdAt`. Document lookup filters accept `FAC-` and `CON-` (API M4; CxC UI M8).

Supported operational methods are `CASH`, `TRANSFER`, and `CHECK`; references are optional. Administrator invoice detail shows each additive movement with effective date, recorded time, method, reference and actor. Seller invoice list and detail omit payment state, paid amount, outstanding balance, and the movement list (PAY-007). The customer PDF omits payment movements and methods, showing current outstanding balance and the derived visible label.

AR list, AR endpoints, later `POST /payments`, and account statements are Administrator-only. Seller may record the full initial payment when confirming a `CASH` sale. Seller confirms `CREDIT` with zero initial payment and cannot record later collections.

Recommended first AR projections:

1. **Open receivables** — Completed invoices with positive balance (Administrator).
2. **Customer outstanding summary** — totals grouped by customer **and currency** (Administrator).
3. **Receivable detail** — invoice total, chronological payments, methods/references, refunded amount where applicable, current outstanding balance, and issued date `confirmedAt` (Administrator).
4. **Account statement PDF** — STMT-001.

Do not silently combine DOP and USD into one converted receivable balance. Credit exposure itself is DOP-only.

Advanced AR such as aging buckets, interest, collection promises/tasks, automated reminders, and bank reconciliation remains Future. Credit limits, customer credit terms, and formal statements are no longer Future; they are CUST-005 and STMT-001.

## Feature-level acceptance criteria

- Completed `CASH` invoices are fully paid at **direct** confirmation; completed `CREDIT` invoices may be unpaid or partially paid. Open named-`CASH` conduce balances (Administrator exception, CON-002) are included in AR.
- Visible state distinguishes `ABONADO` and `ABONADA VENCIDA` from unpaid pending/overdue.
- AR screens and payment-collection endpoints are Administrator-only; Seller invoice list and detail omit payment state, paid amount, balance, and movements.
- Account statement PDF lists every open DOP invoice for the selected customer and reconciles to the customer’s open total.
- Multiple payments and mixed payment methods are preserved as separate records.
- Duplicate submission cannot record the same payment twice.
- Overpayment is rejected under current policy.
- Payment/balance/refund currency always matches invoice currency.
- Ledger reconstructs paid, refunded, and outstanding amounts.
- Basic AR can answer who owes, which invoice, currency, total, paid, and balance.
- DOP and USD balances are not silently converted or combined.
- Inventory/Work-Order state does not change merely because a payment is recorded.

## Implementation checklist

### Payment domain

- [x] Additive payment record model.
- [x] Payment idempotency/retry protection.
- [x] Same-currency and positive-balance validation.
- [x] Derived payment state/balance service.
- [x] Initial payment at confirmation coordination. _(`Cliente contado` / `CASH` must pay the full total; `CREDIT` follows CUST-005 — API + HTTP local Paso 5)_
- [x] Additional/partial/mixed-method payment commands.
- [x] Fixed 30-calendar-day due date and calculated Pending/Overdue/Paid/Paid-late states. _(current live API; superseded for new credit invoices by customer term + PAY-006)_
- [x] Effective-date range and chronological settlement rules.

### Basic AR read models

- [x] Open receivables query.
- [x] Customer outstanding summary grouped by currency.
- [x] Invoice receivable/payment-history detail.
- [x] Filters by customer and invoice. _(Owner decision 2026-09-16: the CxC surface and endpoint expose only the searchable customer selector and invoice lookup by `FAC-` number; payment state, issued-date, and currency filters are intentionally unavailable. Operators never type invoice UUIDs. **Feature 16 M4 (2026-09-20):** document filters also accept `CON-`; open `CONDUCE` balances appear in AR and account statements. **M8 (2026-09-21):** CxC UI document field accepts `FAC-` and `CON-`.)_
- [x] Overdue behavior uses the validated fixed due-date policy; aging remains deferred.

### Frontend

- [x] Record initial/additional payment.
- [x] Invoice payment history and current balance.
- [x] Accounts Receivable list.
- [x] Customer open-balance summary.
- [x] Filter AR summary and open invoices by searchable customer selector and invoice (`FAC-` number).

### Tests

- [x] Zero/partial/full payment cases. _(`Cliente contado` rejects zero/partial at confirm)_
- [x] Multiple/mixed-method cases.
- [x] Duplicate/concurrent payment tests.
- [x] Overpayment and cross-currency rejection.
- [x] AR totals equal underlying ledger calculations.

### Pre-production payment states, Seller restrictions, and statements

- [x] Derive `PARTIALLY_PAID` and `PARTIALLY_PAID_OVERDUE` with visible labels `ABONADO` / `ABONADA VENCIDA` (PAY-006). _(Paso 7, 2026-09-16.)_
- [x] Project `confirmedAt` as issued date on AR (PAY-007). _(Paso 7, 2026-09-16; display in `America/Santo_Domingo`, never as a query filter.)_
- [x] Restrict AR UI/API and later payments to Administrator; Seller invoice omits payment state, paid, balance, and movements (PAY-007). _(Paso 5 2026-09-16: API 403 on `POST /payments` and `GET /receivables`; UI nav + deep links Admin-only. Owner 2026-09-16: Seller GET list/detail omit `paymentState`/`paid`/`balance`/`payments`. 2026-09-16: Seller invoice timeline also omits `PAYMENT_RECORDED`.)_
- [x] Administrator-only account-statement PDF from CxC customer selector (STMT-001). _(Paso 8, 2026-09-16: read model DOP abierto, renderer independiente, descarga HTTP, rechazo sin saldo y paginación probada.)_
- [x] Finish the approved Release 3 filters (customer and invoice by `FAC-` number) on the Administrator AR surface. _(Paso 7, 2026-09-16; owner explicitly removed payment-state, issued-date, currency, and UUID invoice lookup. Invoice list and customer summary remain open-balance only.)_

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### PAY-001 — Cash and Credit Terms

**Name:** Record immediate or deferred payment  
**Status:** CONFIRMED  
**Actors:** Seller (cash confirmation payment and cash/USD full payment at conduce emission only); Administrator (cash confirmation, credit confirmation partial, named-`CASH` conduce initial payment per CON-002, and later collections)  
**Requirement:** A completed invoice may be fully paid, partially paid, or unpaid on credit, with a calculated outstanding balance in exactly the invoice currency, subject to customer type (CUST-004) and SALE-005. An emitted conduce follows CON-002 for initial payment and may appear in AR with the same ledger rules.
**Business Reason:** Both cash and credit sales are normal, but credit is an authorized customer condition; named-`CASH` conduce balance is an Administrator-only exception documented in CON-002.  
**Main Flow:** Actor records allowed sale terms and any allowed initial payment; the system calculates paid and outstanding amounts.  
**Business Rules:** Inventory is Sold at commercial recognition (invoice confirmation today; conduce emission when implemented) regardless of payment completion; payments and balance must use the operation currency. On **direct invoice confirmation**, `CASH` customers, including generic `Cliente contado` and named `CASH`, cannot remain unpaid or partially paid. `CREDIT` customers may remain unpaid (Seller confirmation) or partially paid (Administrator confirmation). Later collections are Administrator-only (PAY-007). Overdue/paid-late timing for a new credit operation uses the snapshotted customer term, not a hard-coded 30 days (CUST-005, SALE-005). Conduce-specific payment matrix and named-`CASH` Admin exception: CON-002.  
**Important Exceptions/Edge Cases:** Cross-currency payment and any conversion of an operational payment or balance amount are rejected. This does not restrict the profitability-only cost conversion in COST-003, which never changes a payment, balance, or refund. Confirming `CASH` without a full initial payment on the direct path returns a conflict and does not complete the sale.  
**Dependencies:** SALE-005, CUST-004, CUST-005, PAY-002, PAY-007, CON-002.  
**Acceptance Notes:** Cash confirmation with full payment is `PAID`. Seller credit confirmation with zero payment is `PENDING` or `OVERDUE` by the customer-term due date. Administrator credit confirmation with partial payment is `PARTIALLY_PAID` when still in that term. A 60-day customer is not overdue 31 days after confirmation.

**Amended 2026-09-15:** Named customers are not implicitly credit-eligible; Seller later collections are withdrawn; credit due date follows the customer term instead of automatic +30.  
**Amended 2026-09-20; implemented locally 2026-09-21:** Clarified direct-confirmation cash rules vs conduce matrix (CON-002); AR includes conduces.

---

### PAY-002 — Partial Payments

**Name:** Receive payment below balance  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrator may record a payment smaller than the outstanding balance and leave the remaining amount open. Seller cannot record later payments and cannot record a partial initial payment on credit confirmation.  
**Business Reason:** Partial payment is part of normal credit operation and is an administrative collection act.  
**Preconditions:** A completed invoice has a positive outstanding balance; the actor is Administrator.  
**Main Flow:** Administrator records amount, method, date, and reference; balance decreases; derived state becomes `PARTIALLY_PAID` or `PARTIALLY_PAID_OVERDUE` (PAY-006).  
**Business Rules:** A payment cannot exceed the allowed balance except through an explicitly supported overpayment policy, which is not approved; amount uses the invoice currency and two decimal places and is never converted from another currency. Seller direct `POST /payments` is 403.  
**Important Exceptions/Edge Cases:** Duplicate submission must not record the same payment twice. Administrator may also record a partial amount during credit confirmation; that initial payment is not a later collection.  
**Dependencies:** PAY-001, PAY-006, PAY-007, HIST-001.  
**Acceptance Notes:** Repeated valid partial payments reduce balance accurately without changing inventory. Seller HTTP payment on a completed credit invoice is denied.

**Amended 2026-09-15:** Later partial payments are Administrator-only.

---

### PAY-003 — Multiple Payments

**Name:** Payment history per invoice  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An invoice may have multiple separately recorded payments over time.  
**Business Reason:** Credit balances may be settled through several installments.  
**Main Flow:** Each receipt creates a new payment record and recalculates the outstanding balance.  
**Business Rules:** Prior payments are not overwritten by later ones, and every record stays in the invoice currency without conversion.  
**Important Exceptions/Edge Cases:** Cancellation/refund must preserve all original payment records.  
**Dependencies:** PAY-002, PAY-005.  
**Acceptance Notes:** An invoice shows chronological payments whose sum matches paid amount.

---

### PAY-004 — Mixed Payment Methods

**Name:** Combine payment methods  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** One invoice may be paid through multiple records using different methods, such as cash and transfer, while every payment uses the invoice currency.  
**Business Reason:** Mixed-method payment is common.  
**Main Flow:** User records each amount and method; the system totals them against the invoice balance.  
**Business Rules:** The method belongs to each payment, not one fixed invoice field. Mixed methods do not authorize mixed currencies.  
**Important Exceptions/Edge Cases:** A DOP invoice rejects USD payment and a USD invoice rejects DOP payment; the availability of an exchange rate for profitability never makes such a payment acceptable.  
**Dependencies:** PAY-003.  
**Acceptance Notes:** Two methods can settle one invoice and remain separately visible.

---

### PAY-005 — Payment and Refund Ledger

**Name:** Preserve financial movements  
**Status:** CONFIRMED  
**Actors:** Seller (cash confirmation payment only); Administrator  
**Requirement:** Payments and refunds must be additive records with amount, invoice currency, method, date, actor, and reference, and must produce an explainable current balance in that same currency.  
**Business Reason:** Financial history must not be erased when a sale changes or is cancelled.  
**Main Flow:** An authorized actor appends an eligible payment; Administrator appends an eligible cancellation refund; each record is linked to its invoice and totals are recalculated.  
**Business Rules:** Seller cannot register cancellation refunds or later collections; Seller may append only the full cash confirmation payment. Every payment and cancellation refund must match the invoice currency; corrections use explicit reversing or correction records rather than silent deletion. Seller invoice projections omit payment state, paid, balance, and the movement list (PAY-007).  
**Important Exceptions/Edge Cases:** Cross-currency records and conversion of any ledger amount are rejected, which does not restrict the profitability-only cost conversion in COST-003; exact refund method constraints may remain implementation policy if they do not change the currency rule.  
**Dependencies:** HIST-002, CANCEL-002, PAY-007.  
**Acceptance Notes:** The ledger reconstructs paid, refunded, and outstanding totals; Mechanic financial access is denied; Seller cannot list or add post-confirmation payments.

**Amended 2026-09-15:** Seller ledger write is limited to cash confirmation.

---

### PAY-006 — Derived Partial Payment States

**Name:** Visible `ABONADO` and overdue partial states  
**Status:** CONFIRMED  
**Actors:** Administrator (labels on invoice, AR, PDF, statement)  
**Requirement:** Payment state remains derived from the ledger and due date. A partial outstanding balance before due date is `PARTIALLY_PAID` / `ABONADO`. A partial outstanding balance after due date is `PARTIALLY_PAID_OVERDUE` / `ABONADA VENCIDA`. Unpaid in-term remains `PENDING` / `PENDIENTE`. Unpaid past-due remains `OVERDUE` / `VENCIDA`.  
**Business Reason:** Partial collection must be visible instead of looking like an untouched pending invoice.  
**Main Flow:** Each payment or due-date crossing recalculates the derived state. The same labels appear on Administrator invoice detail, Administrator AR rows, and the customer invoice PDF. Seller invoice list/detail omit these labels (PAY-007).  
**Business Rules:** Do not persist a mutable status column as source of truth. `PAID` / `PAID_LATE` / `CANCELLED` keep their existing meaning. The AR endpoint does not filter by payment state.  
**Important Exceptions/Edge Cases:** Overdue takes precedence over “unpaid vs partial” by using the dedicated overdue-partial state rather than collapsing both into `OVERDUE`.  
**Dependencies:** PAY-001, PAY-002, SALE-005.  
**Acceptance Notes:** Invoice total `1000.00`, paid `400.00`, still in term → `ABONADO` and balance `600.00`. Same invoice after due date → `ABONADA VENCIDA`. Zero payments in term → `PENDIENTE`. PDF shows the same visible label.

---

### PAY-007 — Issued Date, AR Authorization, and Seller Invoice Visibility

**Name:** `confirmedAt` as issued date and Administrator-only collections  
**Status:** CONFIRMED  
**Actors:** Administrator (AR, collections, invoice settlement); Seller (commercial invoice facts only)  
**Requirement:** Accounts Receivable UI, `GET` receivables endpoints, account statements, and later `POST /api/sales/:id/payments` are Administrator-only. Seller may open a completed invoice and see commercial data (customer, lines, totals, invoice status), and must not receive payment state, paid amount, outstanding balance, or payment movements (amounts, dates, methods, references, or actors). AR lists show issued date as `confirmedAt`, formatted in `America/Santo_Domingo`, never draft `createdAt`.  
**Business Reason:** Collections, customer statements, and settlement visibility are administrative. The Seller sells and confirms; the Administrator collects.  
**Main Flow:** Administrator opens `/receivables` with filters. Seller opening invoice detail or the invoices list sees commercial data without settlement fields. Seller navigation and deep links to CxC are denied; direct HTTP is 403.  
**Business Rules:** Hiding a button is not authorization. Seller GET list/detail omit `paymentState`, `paid`, `refunded`, `balance`, and `payments`. Seller invoice `history` also omits `PAYMENT_RECORDED` (the row remains stored). Separate sales, payment, AR, and credit-customer policies; do not reuse one `InvoiceManager` capability for all of them. Administrator AR query params are only `customerId` and `invoice` (`FAC-` number typed by the operator), plus pagination; payment-state, issued-date, currency, and UUID invoice lookup are intentionally unavailable. The invoice list and customer summary remain open-balance only.  
**Important Exceptions/Edge Cases:** Seller cash confirmation payment remains allowed. Mechanic remains denied all of this surface. The customer PDF may still show outstanding balance and the derived label; that document is for the customer, not the Seller screen.  
**Dependencies:** PAY-001, PAY-005, PAY-006, AUTH-005, STMT-001.  
**Acceptance Notes:** Seller `GET /api/sales/receivables` returns 403. Seller invoice GET and list omit `paymentState`, `paid`, `balance`, and the payments array. Seller invoice detail `history` omits `PAYMENT_RECORDED`. Administrator AR row shows issued date equal to `confirmedAt`.

---

### STMT-001 — Customer Account Statement PDF

**Name:** Administrator account statement from open DOP invoices  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** From Accounts Receivable, Administrator selects a customer that currently has open balance through a searchable selector (replacing free name-only filtering as the customer picker) and generates a PDF titled as an account statement. The document includes every current open DOP invoice for that customer: number, issued date (`confirmedAt`), due date, derived state, total, cumulative amount paid, and outstanding balance, plus generation timestamp and header using the current corporate profile (DOC-001).  
**Business Reason:** The owner needs a printable explanation of a customer’s open balance before production, without building collections or aging.  
**Main Flow:** Valid selection enables `Generar estado de cuenta`; the command downloads the PDF. No extra preview screen is required.  
**Business Rules:** Administrator-only. Include all open-balance invoices with no default date-range limit. Exclude cancelled invoices and refunds. Show per-invoice cumulative paid, not individual movements. Credit is DOP-only, so the statement does not mix currencies. Totals of invoiced, paid, and outstanding on the PDF must reconcile to the listed rows. Use a renderer distinct from the invoice PDF.  
**Important Exceptions/Edge Cases:** Customer with no open balance cannot generate a statement (selector only offers customers with balance, and a direct call is rejected). Large invoice counts must paginate rather than drop rows.  
**Dependencies:** PAY-006, PAY-007, CUST-005, DOC-001.  
**Acceptance Notes:** Selecting a customer with two open invoices of balances `300.00` and `700.00` produces a statement whose outstanding total is `1000.00`. Cancelled invoices are absent. Seller cannot call the statement endpoint.
