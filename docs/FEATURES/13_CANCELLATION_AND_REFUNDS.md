# Feature 13 — Invoice Cancellation, Refunds, and Restoration

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `CANCEL-001, CANCEL-002, CANCEL-003, CANCEL-004, CANCEL-005`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 3 handles purely financial/non-inventory invoices; Release 5/7 completes inventory and physical-work branches**

**Implementation (2026-09-10):** Early financial slice **pulled forward** — production API + HTTP UI (`POST /api/sales/:id/cancel`, additive refund, Cancelled PDF). Inventory and Work-Order checklist `[x]` items below are **prototype mock only**; there is no Item/Work-Order persistence. Future Releases 5/7 must implement those branches in the API, not treat the mock as done.

## What this feature does

Cancel completed invoices without deletion, register actual refunds additively, restore eligible commercial inventory exactly once, and coordinate validated branches with linked Dismantling state.

## Architecture ownership

Primary logical module: **cancellation / refunds**.

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

Cancellation is an Administrator-only compensating business operation, never destructive edit/delete. The cancellation service must reread current invoice/payment/inventory/Work-Order state, preview the applicable effects, require a reason, and commit one valid branch atomically.

Refunds are additive money-returned records in the invoice currency. They never erase original payments. For the validated non-inventory flow, cancellation and refund are one atomic, idempotent operation: if net money was received, the complete net amount must be refunded using cash, transfer, or cheque; there is no partial or deferred cancellation refund. A cancelled invoice has zero outstanding balance.

A cancelled PDF remains downloadable. It preserves the original lines, prices, tax and total while adding a prominent `CANCELADA` mark plus cancellation date, reason and Administrator name.

For non-inventory invoices, cancellation can be delivered early because there is no stock/physical branch. Once inventory is enabled, cancellation restores eligible commercial availability exactly once. Once Work Orders are enabled, choose the validated branch based on linked Dismantling state:

- Pending: cancel the order; piece remains Installed; parent unchanged.
- In Progress: Administrator makes the explicit verified stop or continue-work choice with reason.
- Completed: piece may become Available again but remains Independent; parent remains Incomplete; reinstallation requires a new Installation Work Order.

Use transaction/version checks for races between cancellation, payment, Work-Order completion, reassignment, and resale.

## Feature-level acceptance criteria

- Only Administrator can cancel a Completed invoice or register cancellation refund.
- Original invoice/payment/history is preserved.
- Refund amount/history represents money actually returned.
- Inventory restoration occurs at most once and follows the valid branch.
- Pending/In-Progress/Completed linked Dismantling cases produce their specified physical/commercial outcomes.
- Completed physical work is not erased by invoice cancellation.
- Concurrent payment/Work-Order/cancellation actions cannot leave partial contradictory state.

## Implementation checklist

### Early financial slice (production API + HTTP — pulled forward)

- [x] Administrator cancellation command with reason.
- [x] Non-inventory invoice cancellation.
- [x] Additive same-currency refund record.
- [x] Cancellation/refund history and idempotency.
- [x] Mandatory full-net refund in the same cancellation transaction.
- [x] Downloadable Cancelled PDF with preserved invoice facts and cancellation attribution.

### Inventory slice (prototype mock only — production API not started; Release 5)

- [x] Eligible Sold → Available restoration rules. _(mock)_
- [x] Quantity restoration rule where applicable. _(mock)_
- [x] Prevent double restoration. _(mock)_

### Work-Order slice (prototype mock only — production API not started; Release 7)

- [x] Pending linked Desarme branch. _(mock)_
- [x] In-Progress verified stop branch. _(mock)_
- [x] In-Progress continue-work branch. _(mock)_
- [x] Completed Desarme branch. _(mock)_
- [x] Resale/create-or-reuse interaction. _(mock)_
- [ ] Concurrency/version tests versus Work-Order completion and payments. _(API + mock still open)_

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### CANCEL-001 — Administrator Cancellation

**Name:** Cancel completed invoice without deletion  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Only an Administrator may cancel a completed invoice, recording reason, date, and actor while preserving its original contents.  
**Business Reason:** Cancellation is a sensitive reversal and must remain auditable.  
**Preconditions:** The invoice is Completed and not already Cancelled.  
**Main Flow:** Administrator reviews effects, supplies a reason, and confirms the cancellation transaction.  
**Business Rules:** Cancellation is not editing or deleting the invoice.  
**Important Exceptions/Edge Cases:** Concurrent payment or stock changes must be revalidated.  
**Dependencies:** AUTH-005, SALE-001, HIST-003.  
**Acceptance Notes:** Seller and Mechanic are denied; successful cancellation preserves the document and reason.

---

### CANCEL-002 — Refund Paid Amounts

**Name:** Record money returned on cancellation  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Cancelling a paid or partially paid invoice must also record the applicable refund because the business normally returns received money.  
**Business Reason:** Cancellation alone would leave financial records inconsistent with actual cash returned.  
**Preconditions:** The invoice has recorded payments.  
**Main Flow:** Administrator records refund amount and method as part of the cancellation process; the ledger preserves both payment and refund.  
**Business Rules:** Refund cannot silently erase payments and must use the invoice currency.  
**Important Exceptions/Edge Cases:** Exact method restrictions and staged-refund mechanics are non-blocking policy/implementation details; cross-currency refunds are denied.  
**Dependencies:** CANCEL-001, PAY-005.  
**Acceptance Notes:** Paid and partially paid examples show both original receipts and returned amount.

---

### CANCEL-003 — Restore Sold Inventory

**Name:** Eligible inventory restoration on cancellation  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Confirmed-invoice cancellation must restore eligible sold inventory to Available exactly once, reverse eligible quantity consistently with the original weighted-average sale basis, and preserve all history.  
**Business Reason:** Returned goods must not remain falsely Sold or become duplicated stock.  
**Preconditions:** The cancelled invoice contains inventory lines and restoration is valid.  
**Main Flow:** The system previews affected stock and linked physical work, validates restoration eligibility, cancels the invoice, restores eligible individual or quantity inventory, and records linked events.  
**Business Rules:** Restoration never invents a former hierarchy relation; physical Installed/Independent state follows CANCEL-004 and CANCEL-005; quantity restoration uses the original preserved cost basis.  
**Important Exceptions/Edge Cases:** Advanced damaged-return, exchange, inspection, and warranty workflows are Future scope and do not block the validated basic cancellation paths. Cancelling a complete-assembly sale must preserve its immutable delivered snapshot and must not silently recreate or rewrite physical relationships.  
**Dependencies:** CANCEL-001, QTY-002, QTY-003, HIST-001, INV-004.  
**Acceptance Notes:** Eligible stock returns exactly once; ineligible/uncertain used stock cannot be silently restored.

---

### CANCEL-004 — Completed Dismantling Remains Independent

**Name:** No reversal of completed physical removal  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** If linked dismantling was already Completed when the invoice is cancelled, an eligible piece becomes Available but remains Independent, and its direct parent remains Incomplete.  
**Business Reason:** The owner confirmed that physical reinstallation does not follow automatically from commercial cancellation.  
**Main Flow:** Cancellation restores eligible commercial availability, preserves the completed order and closed historical relation, and records the Independent result.  
**Business Rules:** Reinstallation requires a new opposite Installation Work Order; completed Work Order evidence and history are immutable.  
**Important Exceptions/Edge Cases:** The prior parent remains Incomplete until valid installation completion resolves every applicable Known Missing Component.  
**Dependencies:** CANCEL-003, HIER-004, HIER-006, SALE-006, WO-009, WO-010.  
**Acceptance Notes:** Cancellation after completed dismantling leaves the eligible piece Available and Independent and does not change the parent to Complete.

---

### CANCEL-005 — Linked Dismantling During Invoice Cancellation

**Name:** Coordinate commercial cancellation with active physical work  
**Status:** CONFIRMED  
**Actors:** Administrator, Mechanic  
**Requirement:** Cancelling a confirmed invoice linked to an active Dismantling Work Order must apply the validated result for that order's current state without erasing physical history.  
**Business Reason:** Commercial reversal and physical work may be at different stages and cannot be treated as one event.  
**Preconditions:** Administrator is cancelling a confirmed invoice whose installed-piece sale has a linked Dismantling Work Order.  
**Main Flow:** If Pending, cancellation cancels the order, restores eligible availability, and leaves the piece Installed and parent unchanged; if In Progress, Administrator coordinates with the assigned Mechanic and explicitly chooses with reason either verified stop/cancel or invoice cancellation with work continuing; if Completed, CANCEL-004 applies.  
**Business Rules:** Continuing In Progress work leaves the eligible piece Available and Installed until completion; it may be sold again, and confirmation must reuse the active order rather than create a duplicate.  
**Important Exceptions/Edge Cases:** Stop/cancel requires verification that the piece can remain Installed; completion racing with invoice cancellation must resolve as one valid ordered outcome with no partial state.  
**Dependencies:** CANCEL-001, CANCEL-003, CANCEL-004, SALE-006, WO-007, WO-008, WO-010, HIST-003.  
**Acceptance Notes:** Pending, both explicit In Progress choices, and Completed cases produce the specified availability, physical relation, parent completeness, order status, and additive history.
