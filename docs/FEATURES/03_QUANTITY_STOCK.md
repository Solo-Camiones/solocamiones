# Feature 03 — Quantity-Based Stock

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `QTY-001, QTY-002, QTY-003`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 4 — Base Inventory**

**Implementation (2026-09-10):** Production API **not started**. Frontend `[x]` is prototype mock.

## What this feature does

Support interchangeable products tracked by quantity rather than individual physical identity, including safe receipts, reservations, sales, weighted-average cost, and audited corrections.

## Architecture ownership

Primary logical module: **quantity-stock**.

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

Keep quantity stock as a separate inventory mode/module. It must not participate in the physical parent/child hierarchy. Model on-hand quantity, reserved quantity, and weighted-average DOP unit cost with decimal-safe numeric types.

Quantity products use a catalog SKU chosen at create (mock: operator-entered `id`). They must not consume the per-category individually tracked item sequence. Individual units of a quantity product do not receive fabricated public codes.

Normal receipts/entries are allowed for Seller and Administrator. Correcting an already recorded balance is a separate Administrator-only audited adjustment; do not expose a generic 'set quantity' operation.

Reservation and sale must use conditional atomic writes so `onHand - reserved` never goes below zero. Weighted-average cost is recomputed only on eligible receipt/entry operations using the prior quantity/cost and incoming quantity/cost; completed sales preserve the cost basis used at confirmation.

## Feature-level acceptance criteria

- A product is either quantity-based or individually tracked; mode cannot be converted after creation.
- Available-to-reserve is derived from on-hand minus active reservations.
- Concurrent reservations/sales cannot oversell or make stock negative.
- Normal entries and protected balance corrections are distinguishable and audited correctly.
- Weighted-average DOP cost is reproducible from recorded movements.
- Completed sale lines preserve their historical cost basis even after later receipts change the current average.

## Implementation checklist

### Domain / persistence
- [ ] Define quantity product and immutable inventory-mode rule.
- [ ] Use decimal-safe quantity/money storage where applicable.
- [ ] Implement stock-entry movement records.
- [ ] Implement weighted-average cost calculation.
- [ ] Implement Administrator audited balance adjustment with before/difference/after/reason.
- [ ] Add DB checks preventing negative on-hand/reserved values.
- [ ] Add transaction-safe reserve/release/consume operations.

### Frontend
- [x] Quantity product registration.
- [x] Normal stock receipt/entry flow.
- [x] Administrator adjustment flow.
- [x] Display on-hand, reserved, and available-to-reserve separately.

### Tests
- [x] Weighted-average examples.
- [ ] Concurrent oversell/reservation race tests against PostgreSQL.
- [ ] Negative-stock rejection.
- [x] Seller adjustment denial.
- [ ] Historical sale cost remains unchanged after later receipt.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### QTY-001 — Interchangeable Stock Products

**Name:** Quantity-based inventory  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** The MVP must support products held as interchangeable quantities rather than assigning an individual ID to every unit.  
**Business Reason:** Some identical parts are stocked and sold in multiples, such as ten equivalent units.  
**Main Flow:** User registers the product and adjusts or sells quantities through recorded operations.  
**Business Rules:** Available, reserved, and sold quantities must not be confused with individual-item state. Inventory mode is immutable after creation. A quantity-stock record cannot later become an individually tracked item, and an individually tracked item cannot later become quantity stock. Seller and Administrator may perform eligible normal quantity-stock receipt/entry operations. Only Administrator may correct an already recorded quantity balance through an explicit audited stock-adjustment operation; Seller and Mechanic are denied this correction. The system must preserve the previous quantity, adjustment amount, resulting quantity, actor, timestamp, and reason; the prior balance must not be silently overwritten.
**Important Exceptions/Edge Cases:** Quantity cannot become negative; uniquely identifiable used units remain individual items.  
**Dependencies:** CAT-001, HIST-001.  
**Acceptance Notes:** Multiple units can be stocked and sold without creating one item record per unit. Seller and Administrator may perform eligible normal quantity-stock receipt/entry operations, but only Administrator may correct an existing quantity balance. Every correction is historically traceable, and attempts to convert the product to individually tracked inventory are rejected.

---

### QTY-002 — Quantity Reservation and Sale

**Name:** Prevent quantity overselling  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Draft lines must reserve the requested quantity, and confirmation must atomically consume it without overselling.  
**Business Reason:** Concurrent drafts must not promise more units than exist.  
**Preconditions:** Sufficient unreserved quantity exists.  
**Main Flow:** Draft reserves units; removal/discard releases them; confirmation converts the reservation into sold quantity.  
**Business Rules:** Available-to-reserve quantity excludes active reservations.  
**Important Exceptions/Edge Cases:** Concurrent requests allow only quantities still available.  
**Dependencies:** QTY-001, RES-001, RES-002.  
**Acceptance Notes:** Competing drafts and confirmations never produce negative available stock.

---

### QTY-003 — Quantity Unit Cost

**Name:** Weighted-average cost for interchangeable units  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Quantity-based interchangeable stock must use weighted average acquisition cost expressed in `DOP`; FIFO and LIFO are not used in the MVP.  
**Business Reason:** Profit cannot be calculated consistently without a cost method.  
**Main Flow:** Each eligible receipt updates the weighted average; a quantity sale snapshots and applies the current weighted-average cost basis.  
**Business Rules:** Every receipt cost and the resulting weighted average are `DOP` amounts regardless of the currency of any invoice that later sells the stock; the preserved sale cost basis must not be recalculated from later receipts; stock and cost updates that belong together are atomic.  
**Important Exceptions/Edge Cases:** Cancellation must reverse quantity and cost consistently with the original sold cost basis. Advanced return accounting is Future scope.  
**Dependencies:** QTY-001, COST-001.  
**Acceptance Notes:** Representative receipts at different costs produce the expected weighted average, and the completed line preserves that historical basis.
