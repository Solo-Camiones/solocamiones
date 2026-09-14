# Feature 02 — Individually Tracked Inventory

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `INV-001, INV-002, INV-003, INV-004, INV-005, INV-006`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 4 — Base Inventory**

**Implementation (2026-09-10):** Production API **not started** (no Item model). Frontend checklist `[x]` is prototype mock.

## What this feature does

Represent each uniquely tracked physical part/assembly with immutable identity, practical partial registration, separate operational concepts, normal edits, and protected corrections.

## Architecture ownership

Primary logical module: **inventory**.

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

Inventory owns physical-item identity and ordinary descriptive/operational fields. Use an immutable internal identifier distinct from serial/OEM/part number. Keep commercial availability, condition, physical relationship, completeness, reservation, invoice/payment state, and Work-Order state in their owning modules rather than collapsing them into one status field.

**Production identity (Release 4 persistence):**

- Technical primary key: UUID. All foreign keys (parent, invoice line, reservation, Work Order, history) use this key.
- Public code (`internalCode`): `{category.codePrefix}-{nnnnnn}` with six zero-padded digits, e.g. `MOT-000042`. Unique, immutable, never reused. This is what operators search, print, and see in URLs.
- `Category.codePrefix` is required, unique, 2–8 characters (`A–Z` then `A–Z`/`0–9`), and immutable after create. Existing items keep their codes if a later operational rename of the category name occurs.
- Allocate the next number from a per-category counter (same idea as `facSeq` / `FAC-000001`), inside the same transaction as the insert, with a row lock. Do not compute `MAX(internalCode)+1` from item rows: that races and can reuse a retired number.
- The HTTP create command does not accept a client-supplied item code. Nested present children in an assembly baseline are assigned in the same transaction; a rejected tree consumes no numbers.
- Quantity products are a different inventory mode: they keep a catalog SKU, not a per-unit sequence.
- The frontend mock simulates this by writing the public code into `Item.id` and keeping seed values such as `MOT-001` so demo routes stay stable. Pad width in the mock is 3 to match those dummy codes; production must use 6.

Use explicit commands for normal edits versus protected corrections. Normal Seller/Administrator edits may change approved descriptive/category/photo/free-location information. Protected identity/state/audit corrections are Administrator-only, require a reason, and append before/after history.

Do not model missing expected components as fake inventory rows. A missing component is owned by Hierarchy as a Known Missing Component. Do not use one huge table of hundreds of nullable category fields; shared base fields plus controlled category-specific attributes are preferred.

Acquisition cost is entered in DOP when known or estimated; unknown is a real state and must never be silently stored as zero.

## Feature-level acceptance criteria

- Every real tracked unit has one immutable, never-reused internal ID.
- Duplicate IDs fail while descriptive identifiers may legitimately repeat.
- A valid unit can be registered with the approved minimum and enriched later.
- Unknown values are not fabricated.
- Inventory concepts remain independently representable.
- Seller can perform normal allowed edits but cannot execute protected corrections.
- Administrator corrections preserve original evidence plus reason/actor/before/after state.

## Implementation checklist

### Domain / persistence

- [ ] Define tracked-item identity and immutable internal ID rule.
- [ ] Define shared practical base fields and category attribute hook.
- [ ] Represent known/estimated/unknown DOP acquisition-cost input without defaulting unknown to zero.
- [ ] Add constraints for immutable inventory mode and unique internal ID.
- [x] Implement ordinary create/enrich/edit commands.
- [x] Implement protected correction command with reason and additive history.
- [x] Prevent generic request-body mass assignment.

### Frontend

- [ ] Production registration validation driven by category minimums. The prototype already renders category attributes, but dynamic production minimums remain pending.
- [x] Prototype mock assigns the public item code at save from the category prefix; the operator does not type it (wizard, assembly checklist, catalog-present child). Quantity SKU remains operator-entered.
- [x] Detail/edit screen for ordinary fields.
- [x] Clear visual separation of availability, condition, relationship, completeness, and reservation.
- [x] Administrator-only protected correction flow.

### Tests

- [ ] Duplicate/reused public-code rejection and failed create consuming no sequence number.
- [x] Partial registration and later enrichment.
- [ ] Missing serial/part number allowed when category minimums pass.
- [ ] Unknown cost remains unknown.
- [x] Seller protected-correction denial.
- [x] Additive correction history.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### INV-001 — Individual Physical Identity

**Name:** Unique tracked item identity  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Every individually tracked physical unit must have an immutable unique internal ID separate from serial, OEM, or part numbers.  
**Business Reason:** Used parts need identity even when markings are missing, duplicated, or changed.  
**Preconditions:** The physical unit exists and applicable category minimums are satisfied.  
**Main Flow:** User selects a category and enters known facts; the system assigns the next unused public internal code for that category. The operator does not type or override the code in the MVP. During initial assembly baseline registration, every expected component marked present is registered as its own real unit (with its own assigned code) before being linked to the received parent.  
**Business Rules:** An installed item keeps its identity; public codes cannot be reused; a failed registration consumes no code; a catalog or Expected Component Definition is not physical inventory; a component marked `MISSING` or `NOT_APPLICABLE` is not a physical unit and receives no inventory identity.  
**Important Exceptions/Edge Cases:** Missing serial or part number does not prevent registration when category minimums are met; absence must not be represented by a placeholder item.  
**Dependencies:** CAT-001.  
**Acceptance Notes:** Duplicate internal IDs fail; two real units may share descriptive product data; a baseline with two present and one missing expected component creates two child identities and no identity for the absence.

---

### INV-002 — Partial Registration and Enrichment

**Name:** Register with available information  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Users may register an item with the approved practical minimum and enrich optional descriptions, identifiers, attributes, notes, photos, cost, and location later. The shared base supports immutable internal ID, name, category, brand, model, part number when known, serial number when known, condition, acquisition cost when known or estimated, free-text location, notes, and photos.  
**Business Reason:** Used inventory often arrives with incomplete information.  
**Preconditions:** The applicable category minimum is satisfied.  
**Main Flow:** User selects a category, enters known facts, saves, and later adds information. For a present child in an initial assembly baseline, the same operation captures its available identity, category/type, condition, known identifiers, cost when known or estimated, category attributes, parent, location behavior, and other applicable inventory information.  
**Business Rules:** Unknown data must not be fabricated or made mandatory merely because a field exists; acquisition cost is entered as a `DOP` amount, so an employee who bought the part in another currency converts it outside the application before entering it; category rules may add small relevant field sets; marking an expected type `MISSING` or `NOT_APPLICABLE` is not partial item registration. Avoid hundreds of universal nullable fields and a generic dynamic-metadata platform.  
**Important Exceptions/Edge Cases:** Used inventory may save with the approved practical minimum and be enriched later. Exact operational catalog entries and input normalization are non-blocking configuration/implementation details.  
**Dependencies:** INV-001, CAT-001, LOC-001, PHOTO-001, COST-001.  
**Acceptance Notes:** A valid present physical item can save with approved minimum data and be enriched without changing identity; a receipt absence creates a `MISSING_AT_RECEIPT` Known Missing Component, not a partial inventory record.

---

### INV-003 — Separate Inventory Concepts

**Name:** Independent states and relationships  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Commercial availability, condition, completeness, current physical relationship, reservation, invoice state, payment state, Work Order state, Expected Component Definition, and Known Missing Component must remain separate concepts.  
**Business Reason:** Conflating them creates false stock and incorrect sales decisions.  
**Main Flow:** Each operation updates only the concepts its business rules affect. Initial assembly registration may establish Physical Relationship and derive Completeness without creating a Work Order; later physical changes require completed Work Orders.  
**Business Rules:** `Installed` is a relationship, not availability; `Reserved` does not mean Sold; completeness is derived from unresolved Known Missing Components and is not a normal user-editable value; a Known Missing Component is absence knowledge for one direct parent, not an Expected Component Definition, inventory identity, relationship, or Work-Order state; a confirmed installed-item sale may be Sold and Installed while its Dismantling Work Order remains active.  
**Important Exceptions/Edge Cases:** An item may validly be Available, Used, Complete, Installed, and Reserved; after invoice cancellation it may also be Available and Installed while an In Progress dismantling continues; an assembly may enter inventory Incomplete before any Work Order exists.  
**Dependencies:** HIER-003, HIER-006, RES-001, WO-001, SALE-006, CANCEL-005.  
**Acceptance Notes:** Valid state combinations and initial completeness remain representable without one concept silently changing another.

---

### INV-004 — Availability States

**Name:** Individual availability and derived quantity availability  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Individually tracked used items normally use commercial availability `Available → Sold`; quantity products expose `No disponible` only as a derived result when available-to-reserve quantity is zero.  
**Business Reason:** Commercial availability controls reservation and sale eligibility.  
**Main Flow:** Confirmation changes eligible individual inventory to Sold; an eligible cancellation may restore it to Available; quantity operations recalculate available-to-reserve from physical stock minus reservations.  
**Business Rules:** `No disponible` is never an independently editable individual-item state; for quantity stock, `availableToReserve = physical/on-hand stock - currently reserved stock`; Installed/Independent and reservation are separate from commercial availability.  
**Important Exceptions/Edge Cases:** An active physical operation does not by itself create another availability state; advanced return, exchange, inspection, and warranty workflows are Future scope and do not alter the validated basic cancellation paths.  
**Dependencies:** INV-003, QTY-002, SALE-002, SALE-008, CANCEL-003.  
**Acceptance Notes:** Individual items cannot be manually assigned `No disponible`, and quantity results show it exactly when available-to-reserve is zero.

---

### INV-005 — Normal Inventory Edits

**Name:** Operational inventory maintenance  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Seller and Administrator may correct or enrich ordinary descriptive data, photos, and free-text location within their permissions.  
**Business Reason:** Inventory data improves as parts are inspected and moved.  
**Preconditions:** The item exists and the edit is not a protected historical correction.  
**Main Flow:** User edits allowed fields; the system validates and saves the changes.  
**Business Rules:** Completed sale snapshots and immutable identity/history are not rewritten; protected acquisition cost and post-baseline parent are not ordinary editable fields; attaching or detaching a post-baseline component is not an ordinary inventory edit.  
**Important Exceptions/Edge Cases:** Seller may view acquisition cost but may not edit protected acquisition cost; the cost value is always a `DOP` amount. Protected corrections use INV-006. After HIER-011, only eligible Work Order completion may represent real physical movement or change parent. An Administrator-only receipt-baseline correction may repair a verified original registration error but is not an ordinary edit or physical-work path.  
**Dependencies:** INV-001, AUTH-005, HIST-001, HIER-005, HIER-011.  
**Acceptance Notes:** Allowed descriptive edits persist; protected or historical rewrites and post-baseline direct hierarchy edits are rejected.

---

### INV-006 — Administrative Correction

**Name:** Audited correction of protected data  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Protected identity, acquisition-cost, or state corrections require an Administrator, an explicit reason, and additive history. This includes `Correct initial receipt baseline`, protected acquisition-cost correction, and correction of an accidentally selected currency on a `Completed` invoice with no payments.  
**Business Reason:** Mistakes must be repairable without silently rewriting evidence.  
**Preconditions:** A correction is necessary and cannot be made as a normal edit. For an initial-baseline correction, the business has verified that receipt reality was recorded incorrectly rather than changed later. For a completed-invoice currency correction, the invoice has no payment records.  
**Main Flow:** Administrator selects the named correction, supplies a reason, reviews the before and corrected states, and confirms. The system validates the operation-specific invariants and dependencies on later immutable events before applying the correction atomically and appending history.  
**Business Rules:** Corrections preserve the original event and record actor, timestamp, reason, before state, and corrected state. An initial-baseline correction may repair `PRESENT`/`MISSING`/`NOT_APPLICABLE` results, an original parent, or derived completeness, but it never reopens HIER-011 or substitutes for a Work Order. Currency correction preserves the previous and corrected currency and converts no operational amount: no paid amount, line price, balance, or refund is recalculated through an exchange rate. Protected acquisition-cost correction records a `DOP` amount. A successful currency correction invalidates any Administrator-recorded gross profit tied to the obsolete currency while preserving its prior value in additive history, then re-derives profitability under the corrected currency. Thus `DOP → USD` uses the COST-003 FX profitability flow while `USD → DOP` computes gross profit directly in `DOP` with no provider call.  
**Important Exceptions/Edge Cases:** A `Completed` invoice with one or more payments rejects direct currency correction and requires the applicable cancellation/reversal flow; no exchange-rate repair of operational amounts is supported, which does not restrict the profitability-only conversion in COST-003. When a `DOP → USD` correction cannot obtain the required rate, the correction still succeeds and profitability becomes `UNAVAILABLE / PENDING FX RATE`; the sale and inventory transaction are never rerun in either direction, and no profitability value may remain expressed under the obsolete currency. No correction may silently rewrite immutable snapshots, completed Work Orders, evidence, payment/refund records, or later physical relationship history. A request that would contradict such history is surfaced for protected administrative reconciliation.  
**Dependencies:** AUTH-005, COST-003, HIER-002, HIER-004, HIER-006, HIER-011, HIST-003, ADMIN-001.  
**Acceptance Notes:** Seller and Mechanic are denied; a safe receipt error correction preserves both original and corrective events, while a conflicting request is not silently applied. A `DOP → USD` correction with an unavailable rate still commits and shows pending profitability; a `USD → DOP` correction shows `DOP` profitability without contacting a provider.
