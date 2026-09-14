# Feature 12 — Payments and Basic Accounts Receivable

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `PAY-001, PAY-002, PAY-003, PAY-004, PAY-005`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 3 — Immediate financial priority after Billing Core**

**Implementation (2026-09-10):** Pulled forward into the Release 2 local codebase. Production API + HTTP UI for the financial slice are in place (`InvoicePayment`, confirm-time optional payment, `POST /api/sales/:id/payments`, `GET /api/sales/receivables`, invoice payment history). **Do not treat this feature as complete.** Remaining checklist items that belong to Release 3 must still be implemented (Release 2 is closed). Aging and collections stay deferred as specified in this file.

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

Derive the public state from the preserved ledger and fixed due date; do not store a mutable payment-status column. The validated states are `Pending` while any balance remains through the due date, `Overdue` afterward, `Paid` when the chronological effective payments settle the total on/before the due date, `Paid late` when they settle it afterward, and `Cancelled` as the overriding state. A partial payment therefore remains `Pending` before due date while its payment detail and balance remain visible internally.

The due date is the local calendar date in `America/Santo_Domingo` 30 calendar days after confirmation and expires at the end of that day. It is fixed, cannot be overridden, and remains visible as historical reference after payment. Existing completed invoices backfill it from `confirmedAt`; payment effective dates are date-only, may be entered by Seller/Administrator, and must be between the confirmation date and today. Settlement timing uses effective dates, not record timestamps.

Supported operational methods are `CASH`, `TRANSFER`, and `CHECK`; references are optional. The internal invoice detail shows each additive movement with effective date, recorded time, method, reference and actor. The customer PDF intentionally omits payment movements and methods, showing only current outstanding balance.

Recommended first AR projections:

1. **Open receivables** — Completed invoices with positive balance.
2. **Customer outstanding summary** — totals grouped by customer **and currency**.
3. **Receivable detail** — invoice total, chronological payments, methods/references, refunded amount where applicable, and current outstanding balance.

Do not silently combine DOP and USD into one converted receivable balance.

Advanced AR such as aging buckets, credit limits, interest, collection promises/tasks, formal statements, automated reminders, and bank reconciliation remains Future unless separately validated.

## Feature-level acceptance criteria

- Completed invoice supports zero, partial, or full payment for named customers; `Cliente contado` requires full payment at confirmation.
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
- [x] Initial payment at confirmation coordination. _(`Cliente contado` must pay the full total; named customers remain optional/partial)_
- [x] Additional/partial/mixed-method payment commands.
- [x] Fixed 30-calendar-day due date and calculated Pending/Overdue/Paid/Paid-late states.
- [x] Effective-date range and chronological settlement rules.

### Basic AR read models

- [x] Open receivables query.
- [x] Customer outstanding summary grouped by currency.
- [x] Invoice receivable/payment-history detail.
- [ ] Filters by customer, invoice, payment state, date, and currency as justified. _(Still required Release 3 work — not optional. Partial today: API `GET /receivables` accepts `customerId`, `currency`, and `paymentState` `PENDING`/`OVERDUE` only. HTTP UI filters customer **name** on the loaded snapshot and does not yet send those query params. Invoice id, date range, and Paid/Paid-late query filters are not implemented. Finish now that R2 M25 is closed.)_
- [x] Overdue behavior uses the validated fixed due-date policy; aging remains deferred.

### Frontend

- [x] Record initial/additional payment.
- [x] Invoice payment history and current balance.
- [x] Accounts Receivable list.
- [x] Customer open-balance summary.
- [x] Filter AR summary and open invoices by customer name.

### Tests

- [x] Zero/partial/full payment cases. _(`Cliente contado` rejects zero/partial at confirm)_
- [x] Multiple/mixed-method cases.
- [x] Duplicate/concurrent payment tests.
- [x] Overpayment and cross-currency rejection.
- [x] AR totals equal underlying ledger calculations.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### PAY-001 — Cash and Credit Terms

**Name:** Record immediate or deferred payment  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A completed invoice may be fully paid, partially paid, or unpaid on credit, with a calculated outstanding balance in exactly the invoice currency.  
**Business Reason:** Both cash and credit sales are normal.  
**Main Flow:** User records sale terms and any initial payment; the system calculates paid and outstanding amounts.  
**Business Rules:** Inventory is Sold at invoice confirmation regardless of payment completion; payments and balance must use the invoice currency. Exception (owner 2026-09-11): `Cliente contado` cannot remain unpaid or partially paid at confirmation; the initial payment must equal the invoice total. Named customers may still be unpaid, partial, or paid.  
**Important Exceptions/Edge Cases:** Cross-currency payment and any conversion of an operational payment or balance amount are rejected. This does not restrict the profitability-only cost conversion in COST-003, which never changes a payment, balance, or refund. Confirming `Cliente contado` without a full initial payment returns a conflict and does not complete the sale.  
**Dependencies:** SALE-005, PAY-002.  
**Acceptance Notes:** Payment state and balance match zero, partial, and full initial payments.

---

### PAY-002 — Partial Payments

**Name:** Receive payment below balance  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Users may record a payment smaller than the outstanding balance and leave the remaining amount open.  
**Business Reason:** Partial payment is part of normal credit operation.  
**Preconditions:** A completed invoice has a positive outstanding balance.  
**Main Flow:** User records amount, method, date, and reference; balance decreases.  
**Business Rules:** A payment cannot exceed the allowed balance except through an explicitly supported overpayment policy, which is not approved; amount uses the invoice currency and two decimal places and is never converted from another currency.  
**Important Exceptions/Edge Cases:** Duplicate submission must not record the same payment twice.  
**Dependencies:** PAY-001, HIST-001.  
**Acceptance Notes:** Repeated valid partial payments reduce balance accurately without changing inventory.

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
**Actors:** Seller, Administrator  
**Requirement:** Payments and refunds must be additive records with amount, invoice currency, method, date, actor, and reference, and must produce an explainable current balance in that same currency.  
**Business Reason:** Financial history must not be erased when a sale changes or is cancelled.  
**Main Flow:** Seller or Administrator appends an eligible payment; Administrator appends an eligible cancellation refund; each record is linked to its invoice and totals are recalculated.  
**Business Rules:** Seller cannot register cancellation refunds; every payment and cancellation refund must match the invoice currency; corrections use explicit reversing or correction records rather than silent deletion.  
**Important Exceptions/Edge Cases:** Cross-currency records and conversion of any ledger amount are rejected, which does not restrict the profitability-only cost conversion in COST-003; exact refund method constraints may remain implementation policy if they do not change the currency rule.  
**Dependencies:** HIST-002, CANCEL-002.  
**Acceptance Notes:** The ledger reconstructs paid, refunded, and outstanding totals; Seller payment succeeds while Seller refund and Mechanic financial access are denied.
