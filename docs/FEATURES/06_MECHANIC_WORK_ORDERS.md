# Feature 06 — Mechanic Work Orders and Evidence

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `WO-001, WO-002, WO-003, WO-004, WO-005, WO-006, WO-007, WO-008, WO-009, WO-010`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 7 — Mechanic Workflow and Installed-Item Operations**

**Implementation (2026-09-10):** Production API **not started**. Checklist `[x]` items are prototype mock (desktop + mechanic). Do not treat them as PostgreSQL/Work-Order HTTP.

## What this feature does

Control every post-baseline physical Desarme/Installation through one-piece Work Orders, a restricted mobile Mechanic queue, atomic claim, mandatory BEFORE/AFTER evidence, and immutable completion history.

## Architecture ownership

Primary logical module: **work-orders / evidence**.

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

A Work Order owns physical-operation state, assignment, technical context, and evidence references; it does not own invoice facts or inventory identity. One order represents exactly one piece and one operation type: Dismantling or Installation.

Lifecycle is `PENDING → IN_PROGRESS → COMPLETED`, with controlled `CANCELLED` only where validated. Pending orders are unassigned. `Take order` must be one conditional database update so exactly one Mechanic wins.

Only the assigned Mechanic can modify/complete an In-Progress order. Completion requires at least one durable `BEFORE` and one durable `AFTER` image. Store bytes in S3-compatible object storage and evidence metadata/state in PostgreSQL; use idempotent upload/finalization behavior.

Creation never changes hierarchy. Dismantling/Installation completion coordinates with Hierarchy inside one database transaction after validating assignment, evidence, current relationship/destination, and concurrency versions.

Mechanic endpoints and UI must never return customer, invoice, price, cost, payment, balance, refund, margin, or profit data.

## Feature-level acceptance criteria

- One Work Order = one piece + one physical operation.
- Pending queue is visible to Mechanics with technical context only.
- Atomic claim permits one winner and assigns that Mechanic.
- Only assigned Mechanic can modify/complete active work.
- Completion fails without durable BEFORE and AFTER evidence.
- Order creation does not change physical hierarchy.
- Valid completion applies the corresponding physical change atomically.
- Completed work cannot be cancelled to erase history; reversal requires a new opposite order.
- Administrator recovery preserves reason/actor/history and cannot fake completion.

## Implementation checklist

### Domain / persistence
- [x] Define Work Order type/state/assignment/version.
- [x] Implement manual Administrator creation rules.
- [x] Implement automatic Dismantling create-or-reuse hook used by Sales.
- [x] Implement atomic Pending claim.
- [x] Implement assigned-Mechanic authorization.
- [x] Implement evidence metadata and durable upload/finalization state.
- [x] Implement Dismantling completion transaction.
- [x] Implement Installation completion transaction.
- [x] Implement eligible cancellation/release/reassignment.
- [x] Prevent duplicate active physical operations.

### Frontend
- [x] Desktop administrator list, detail, manual create, reassign and cancel (WM9). Seller does not see the WO queue (nav, dashboard KPIs, inventory WO list); prototype mock 2.0-M1.2.
- [x] Mobile-first Pending queue.
- [x] Take-order action with conflict refresh.
- [x] Assigned-order detail with technical notes.
- [x] BEFORE/AFTER upload with progress/retry.
- [x] Completion validation and clear error recovery.

### Tests
- [x] Two-Mechanic claim race.
- [x] Duplicate active operation race.
- [x] Wrong-Mechanic action denial.
- [x] Missing/failed evidence rejection.
- [x] Completed order immutable/reversal-by-opposite-order.
- [x] Mechanic API response contains no financial/commercial fields.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### WO-001 — Work Order Types and One-Piece Scope

**Name:** Dismantling and Installation Work Orders  
**Status:** CONFIRMED  
**Actors:** Administrator, Seller, Mechanic  
**Requirement:** The MVP must support Dismantling Work Orders and Installation Work Orders for post-baseline physical work, with exactly one physical piece per Work Order.  
**Business Reason:** Each later physical operation needs unambiguous assignment, evidence, and effects.  
**Preconditions:** An inventory baseline already exists and a physical dismantling or installation is required.  
**Main Flow:** An eligible sale or Administrator action creates the applicable Work Order for one piece and its relevant source or destination.  
**Business Rules:** A Work Order cannot combine multiple pieces or both operation types; initial observed receipt registration under HIER-011 is not a Work Order.  
**Important Exceptions/Edge Cases:** One invoice may lead to multiple Work Orders only when it contains multiple separate installed pieces; no fake orders are created to describe how an assembly arrived.  
**Dependencies:** INV-001, AUTH-002.  
**Acceptance Notes:** Every later physical operation identifies one type, one piece, and the relevant context, while initial baseline registration creates no order.

---

### WO-002 — Work Order Lifecycle

**Name:** Controlled physical-work states  
**Status:** CONFIRMED  
**Actors:** Administrator, Mechanic  
**Requirement:** Both Work Order types must use `Pending → In Progress → Completed`, with `Cancelled` allowed only by the validated cancellation and recovery rules.  
**Business Reason:** Physical work must have a small, explainable lifecycle.  
**Preconditions:** The requested transition starts from an allowed current state.  
**Main Flow:** Creation starts Pending; a Mechanic takes it atomically to In Progress; valid completion moves it to Completed.  
**Business Rules:** Completed is terminal and cannot be cancelled or rewritten; it preserves piece, source/destination parent, assigned Mechanic, dates/times, evidence, notes, and history; reversal requires a new opposite Work Order.  
**Important Exceptions/Edge Cases:** Pending may be cancelled by Administrator with reason; In Progress cancellation requires physical verification and explicit reason.  
**Dependencies:** WO-001, AUTH-005.  
**Acceptance Notes:** Invalid skips or reversals fail unchanged, and completed history remains immutable.

---

### WO-003 — Mechanic Information Boundary

**Name:** Minimum mobile-first Mechanic visibility  
**Status:** CONFIRMED  
**Actors:** Mechanic, Administrator  
**Requirement:** Mechanic may see only Work Order ID, type, status, piece, relevant parent/source/destination, effective location, technical notes, assignment, and BEFORE/AFTER evidence.  
**Business Reason:** Mechanics need physical-work context without access to commercial or personal information.  
**Main Flow:** Mechanic opens the queue or assigned order and receives only the allowed operational fields.  
**Business Rules:** Mechanic must not see customer identity/contact data, invoice details, prices, acquisition cost, payments, balances, refunds, profit, margin, or other commercial/financial information.  
**Important Exceptions/Edge Cases:** A Work Order linked internally to an invoice does not expose that invoice to Mechanic.  
**Dependencies:** AUTH-002, AUTH-005, WO-001.  
**Acceptance Notes:** Mechanic views contain all required work context and none of the prohibited customer or financial fields.

---

### WO-004 — Pending Queue and Atomic Take

**Name:** Shared queue with exclusive assignment  
**Status:** CONFIRMED  
**Actors:** Mechanic, Administrator  
**Requirement:** All Mechanics may see Pending orders and use `Take order`; taking must atomically assign the successful Mechanic and move the order to In Progress.  
**Business Reason:** A shared queue avoids dispatch overhead while preventing two Mechanics from owning the same work.  
**Preconditions:** The Work Order is Pending and unassigned.  
**Main Flow:** A Mechanic takes the order; one atomic operation verifies state, assigns that Mechanic, and changes status to In Progress.  
**Business Rules:** Only one concurrent take succeeds; only the assigned Mechanic may modify or complete the active order.  
**Important Exceptions/Edge Cases:** A stale queue view or competing take fails without replacing the winning assignment.  
**Dependencies:** WO-002, AUTH-005.  
**Acceptance Notes:** A simulated claim race results in exactly one assigned Mechanic and one In Progress order.

---

### WO-005 — Mandatory Before and After Evidence

**Name:** Required physical-work photos  
**Status:** CONFIRMED  
**Actors:** Mechanic  
**Requirement:** Work Order completion requires at least one photo classified `BEFORE` and at least one photo classified `AFTER`; multiple photos in either category are allowed.  
**Business Reason:** Physical changes need durable visual evidence.  
**Preconditions:** The assigned Mechanic is completing an In Progress order.  
**Main Flow:** Mechanic uploads and classifies evidence; completion validates both categories before applying physical effects.  
**Business Rules:** Evidence remains linked to the completed order and cannot be erased by cancellation or reassignment; the requirement applies to every Work Order completion.  
**Important Exceptions/Edge Cases:** Failed evidence upload cannot produce a Completed order; Administrator recovery may retry upload but cannot waive evidence. HIER-011 baseline registration requires no evidence because it is not a Work Order or company-performed physical change.  
**Dependencies:** WO-002, WO-004.  
**Acceptance Notes:** Work Order completion fails with either category missing and succeeds with one or more valid photos in both; initial baseline registration is unaffected.

---

### WO-006 — Administrator Manual Work Orders

**Name:** Manual physical-work creation  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrator alone may manually create either a Dismantling Work Order without a sale or an Installation Work Order by selecting one piece, the relevant source or destination parent, context/location, and notes.  
**Business Reason:** Physical dismantling and installation also occur outside sales.  
**Main Flow:** Administrator selects the type and required context. For Installation, Administrator selects the independent real piece and eligible destination parent from the applicable list. The system validates hierarchy and restriction eligibility and creates a Pending order.  
**Business Rules:** Seller cannot create standalone physical Work Orders; creation itself never changes hierarchy or completeness.  
**Important Exceptions/Edge Cases:** Manual dismantling cannot violate `No desarmar`; Installation completion, not creation, establishes the relation.  
**Dependencies:** AUTH-005, HIER-002, HIER-008, WO-001, WO-002.  
**Acceptance Notes:** Administrator can create either valid manual type; Seller and Mechanic are denied.

---

### WO-007 — Automatic Dismantling Create or Reuse

**Name:** Installed-sale physical-work linkage  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Confirming the valid sale of an installed piece must create a new Pending Dismantling Work Order when no appropriate active order represents the same physical operation, or reuse an appropriate active order that is already Pending or In Progress.  
**Business Reason:** Confirmation must initiate physical fulfillment without duplicate dismantling work.  
**Preconditions:** The sold piece remains Installed and the sale passes all confirmation checks.  
**Main Flow:** Confirmation checks for a matching Pending or In Progress physical operation, links and reuses it when present, otherwise creates a new Pending order, and preserves prior invoice and Work Order history.  
**Business Rules:** Create-or-reuse is part of the same atomic confirmation boundary; reuse must not overwrite status, assignment, evidence, notes, old links, or history.  
**Important Exceptions/Edge Cases:** An Available and Installed piece with continuing dismantling may be resold after cancellation and must reuse that active order.  
**Dependencies:** SALE-002, WO-001, WO-002, HIST-002.  
**Acceptance Notes:** Concurrent or repeated eligible confirmation cannot create duplicate active dismantling operations, and an In Progress matching order is reused without being reset to Pending.

---

### WO-008 — Dismantling Completion Effects

**Name:** Complete physical removal  
**Status:** CONFIRMED  
**Actors:** Mechanic  
**Requirement:** Valid Dismantling Work Order completion must atomically complete the order, close and historize the current parent relation, make the piece Independent, create a `REMOVED_AFTER_BASELINE` Known Missing Component for the direct parent, and make only that parent Incomplete.  
**Business Reason:** Physical state must change only when dismantling actually finishes.  
**Preconditions:** The assigned Mechanic owns an In Progress order, mandatory evidence exists, and source hierarchy remains valid.  
**Main Flow:** Completion revalidates assignment, state, evidence, relation, component/category semantics, and restriction; the Mechanic may enter a new free-text location or leave it pending; then the operation closes the relation, records the direct-parent missing condition with the removed item and Work Order provenance, derives Incomplete, and applies all physical effects and history together.  
**Business Rules:** Commercial availability is unchanged by manual dismantling; a piece sold before dismantling remains Sold after completion; the Known Missing Component is recorded for the direct parent only even when the removed type was not on the original expected checklist; optional location entry is limited to the assigned Mechanic's completion flow and grants no general inventory-edit permission.  
**Important Exceptions/Edge Cases:** A stale relation, reassignment, invoice-cancellation race, `No desarmar` conflict, or duplicate completion rejects the operation without partial effects.  
**Dependencies:** WO-004, WO-005, HIER-004, HIER-006, HIER-007, HIER-008, LOC-002, HIST-001.  
**Acceptance Notes:** Success changes order, relation, piece physical state, direct-parent missing knowledge, completeness, and history atomically.

---

### WO-009 — Installation Completion Effects

**Name:** Complete physical installation  
**Status:** CONFIRMED  
**Actors:** Mechanic  
**Requirement:** Valid Installation Work Order completion must atomically create the current relation, prevent cycles or a second parent, resolve a compatible unresolved Known Missing Component from either origin when applicable, and complete the direct parent only when no Known Missing Components remain unresolved.  
**Business Reason:** Planned installation must not become current hierarchy before the physical work is evidenced and complete.  
**Preconditions:** The assigned Mechanic owns an In Progress order, mandatory evidence exists, and destination hierarchy remains valid.  
**Main Flow:** Completion revalidates assignment, state, evidence, piece, destination, and applicable component/category match; creates the relation; resolves the compatible Known Missing Component when present; recalculates all remaining unresolved Known Missing Components for the direct parent; completes the order; and writes history.  
**Business Rules:** A real individually tracked installed item satisfies at most the applicable absence record and is never confused with it; resolution is allowed for `MISSING_AT_RECEIPT` or `REMOVED_AFTER_BASELINE`; completeness does not cascade; installation does not create or change a sale; engine testing remains outside MVP.  
**Important Exceptions/Edge Cases:** Installing one of several missing components leaves the parent Incomplete; a new current parent, cycle, invalid category-based match, reassignment, or competing hierarchy change rejects completion without partial effects. Repeated-component handling remains simple and category-based.  
**Dependencies:** WO-004, WO-005, HIER-002, HIER-006, HIER-007, HIST-001.  
**Acceptance Notes:** No relation exists before completion; resolving the final unresolved Known Missing Component makes the direct parent Complete, while resolving one of several leaves it Incomplete.

---

### WO-010 — Cancellation, Reassignment, and Immutable Completion

**Name:** Controlled Work Order recovery  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrator may cancel eligible Pending or In Progress orders, or release/reassign active orders for recovery, while preserving actor, reason, timestamp, prior assignment, state, evidence, and history.  
**Business Reason:** Abandoned or interrupted work must be recoverable without erasing accountability.  
**Preconditions:** The action is allowed for the current state and an appropriate reason is supplied.  
**Main Flow:** Administrator reviews physical state, chooses a named recovery action, records the reason, and the system applies the allowed transition with history.  
**Business Rules:** In Progress cancellation requires physical verification; Completed cannot be cancelled or reassigned; reversal of completed work uses a new opposite Work Order.  
**Important Exceptions/Edge Cases:** Reassignment racing with Mechanic action must permit only one valid outcome; recovery cannot mark an order Completed or waive required evidence.  
**Dependencies:** WO-002, WO-004, WO-005, HIST-003.  
**Acceptance Notes:** Eligible recovery preserves complete history, and attempts to alter a Completed order are rejected.
