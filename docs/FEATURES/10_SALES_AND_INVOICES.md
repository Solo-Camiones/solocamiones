# Feature 10 — Sales, Invoice Lifecycle, and Invoice Lines

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `SALE-001, SALE-002, SALE-003, SALE-004, SALE-005, SALE-006, SALE-007, SALE-008, LINE-001, LINE-002, LINE-003, LINE-004, LINE-005, LINE-006`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 2 Billing Core starts this feature; Release 5/7 complete inventory-backed and installed/assembly sale paths**

**Implementation (2026-09-10):** Release 2 non-inventory lines, confirm/`FAC-`, PDF generate/regenerate, and HTTP POS/detail/PDF are done. Invoice detail HTTP shows **document activity** from history (confirm, payment, PDF, cancel; not draft/line churn — Feature 14). Confirm may record a **pulled-forward** initial payment and `dueDate` (Feature 12). Release 5/7 checklist `[x]` items are **prototype mock**; HTTP API still rejects ITEM/QTY with 409.

## What this feature does

Provide Draft/Completed/Cancelled internal invoices, a shared FAC sequence, DOP/USD single-currency behavior, validated line types, included ITBIS, printable PDF output, and atomic confirmation semantics.

## Architecture ownership

Primary logical module: **sales / sale-lines / invoice-documents**.

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

Sales owns the invoice aggregate and immutable completed-sale snapshot. Use `Draft`, `Completed`, and `Cancelled` states. A Draft has no `FAC-` number; successful confirmation assigns the next unique never-reused number from one shared sequence such as `FAC-000001`.

Use an explicit line-type discriminator rather than one ambiguous generic row. The validated line types are:

- individually tracked inventory;
- quantity product;
- generic free-form merchandise;
- mechanical service selected from the Administrator-maintained service catalog;
- external resale line;
- delivery/shipping.

For fast financial delivery, the first production slice may enable non-inventory line types before inventory-backed line types. Those early lines must never create/reserve/sell/decrement inventory.

Each invoice uses exactly one currency (`DOP` or `USD`). Line amounts, invoice totals, payments, balances, and refunds use that currency. There is no operational currency conversion.

Every line may include optional `notes`, independent of `description`. Notes are at most 100 characters, allow internal line breaks, treat blank/whitespace as absent, can be set when adding a line or edited in Draft (Seller and Administrator), freeze on Completed, and display below the description as secondary text on POS, invoice detail, and the internal PDF. Notes never change tax, inventory, or money.

Taxable merchandise/product line prices are entered **tax-inclusive**. Derive taxable base and included 18% ITBIS; do not add 18% on top. Mechanical service and delivery are non-taxable. Calculate/round every line to two decimals first, then sum the already-rounded lines.

Confirmation is a coordinating service/transaction. For inventory-backed paths it revalidates reservation, stock, hierarchy, `No desarmar`, and active physical operations before atomically committing sale state. Installed-item confirmation marks the piece `Sold` but keeps it `Installed` and creates/reuses a Dismantling Work Order; physical relation changes later at Work-Order completion.

Invoice PDF rendering is secondary to sale validity. Preserve all invoice facts needed for deterministic regeneration, including confirmation seller, customer phone and fixed due date; historical rows leave non-reconstructable seller/phone snapshots blank. The current color template uses the Solo Camiones logo and fixed business identity, a sober industrial layout, line table, totals, current outstanding balance, thank-you message and Seller/Customer signature spaces. It includes a blank `NCF: ______________________` and never implies DGII/NCF/e-CF integration. Payment movements remain private in the invoice detail; the customer PDF shows only the current balance and the timestamp when that balance was calculated. A newly downloaded Cancelled invoice preserves original commercial facts and adds a prominent cancellation mark, reason, date and Administrator.

## Feature-level acceptance criteria

- Draft can be prepared without consuming/selling inventory until the relevant confirmation path.
- Successful confirmation assigns one unique shared `FAC-` number that is never reused.
- One invoice uses one DOP or USD currency; mixed-currency lines are rejected.
- Tax-inclusive 18% calculations and per-line rounding are correct.
- Service and delivery remain non-taxable.
- Generic line never silently creates/changes inventory.
- PDF failure does not roll back or duplicate a valid sale; Administrator can regenerate it.
- Independent, quantity, installed-component, and complete-assembly sale paths follow their validated atomic effects once their dependencies are implemented.
- Installed-item sale produces valid `Sold + Installed` before physical Desarme completion.
- Complete-assembly confirmation uses the current delivered subtree and immutable snapshot rules.

## Implementation checklist

### Release 2 — Billing Core

- [x] Invoice aggregate and Draft/Completed/Cancelled state model.
- [x] DOP/USD single-currency rule. _(prototipo mock — WM8)_
- [x] Shared transactional `FAC-` sequence. _(prototipo mock — `facSeq`; API R2 M12: lock + `FAC-000001`, DOP/USD compartida)_
- [x] Customer and confirmation snapshot integration. _(API: customer name/RNC/primary phone, confirming Seller and fixed due date)_
- [x] Generic merchandise line. _(prototipo mock — WM8; API draft HTTP — R2 M8)_
- [x] Mechanical service catalog selection + negotiated price. _(prototipo mock — WM8; catálogo HTTP Admin — R2 M4/M20; selección POS HTTP — R2 M21)_
- [x] Delivery paid/free/omitted line. _(prototipo mock — WM8; API draft HTTP — R2 M10)_
- [x] Optional per-line notes (independent of description; Draft edit; frozen on confirm; POS, detail, PDF).
- [x] External resale line if its cost dependency is enabled. _(prototipo mock — WM8; API draft HTTP — R2 M11)_
- [x] Tax-inclusive 18% calculation and per-line rounding.
- [x] Printable/regenerable branded internal PDF with logo, blank NCF, balance/state, pagination, signatures and Cancelled rendering. _(API template `internal-v3`; UI preview/download and Administrator regeneration)_
- [x] Explicitly reject unavailable inventory-backed line actions until their feature release. _(API R2 M8: ITEM/QTY 409; POS HTTP M21: capabilities apagan ITEM/QTY)_

### Release 5 — Inventory-backed sales (prototype mock only — production API not started)

- [x] Individual inventory line. _(prototipo mock — WM8; API 409)_
- [x] Quantity product line. _(prototipo mock — WM8; API 409)_
- [x] Reservation ownership/revalidation. _(prototipo mock — WM8)_
- [x] Atomic independent-item Sold transition. _(prototipo mock — WM8)_
- [x] Atomic quantity consumption. _(prototipo mock — WM8)_

### Release 7 — Hierarchy-linked sales (prototype mock only — production API not started)

- [x] Installed-piece sale + Dismantling create-or-reuse. _(prototipo mock — WM8; completar desarme es WM10)_
- [x] Complete-assembly subtree validation/snapshot. _(prototipo mock — bloqueo por OT activa; marca Sold; snapshot inmutable `deliveredAssemblies`)_
- [ ] Race handling versus hierarchy/Work-Order changes.

### Tests

- [x] Decimal-safe invoice calculations.
- [x] FAC uniqueness/non-reuse under concurrency/retry. _(prototipo mock — idempotencia de `confirmInvoice`; API R2 M12: HTTP concurrente + retry idempotente)_
- [x] Mixed-currency rejection. _(una moneda por factura; el draft no mezcla líneas)_
- [x] PDF failure/regeneration without sale rerun. _(API R2 M17: fallo simulado no revierte la venta; M18: `POST /api/sales/:id/pdf/regenerate` Administrator, solo `FAILED`; UI HTTP M23: Seller ve el fallo y no regenera)_
- [x] Forced transaction failure leaves no partial sale/inventory/WO state. _(prototipo mock — validar todo antes de mutar; API R2 M12: fallo de history no consume `FAC-`)_
- [x] Duplicate confirmation is idempotent or safely conflicts. _(API R2 M12: segundo POST → 200 y el mismo número)_

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### SALE-001 — Internal Invoice Lifecycle

**Name:** Draft, completed, and cancelled invoices  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Internal invoices must have Draft, Completed, and Cancelled states and exactly one currency, `DOP` or `USD`. A unique automatic number using `FAC-` plus an initially six-digit zero-padded sequence is assigned only when a valid Draft is successfully confirmed.  
**Business Reason:** Sales need an editable preparation stage and immutable completed history.  
**Main Flow:** Seller or Administrator creates a Draft, selects and may edit its currency, then confirms it or Administrator later cancels it through the cancellation flow. Successful confirmation atomically assigns the next number, such as `FAC-000001`.  
**Business Rules:** Users never type the internal number; DOP and USD share one sequence; numbers are unique and never reused; cancelled invoices keep their original number; Completed invoices are not edited as drafts or physically deleted. Optional line `notes` may be added or edited only while Draft and become immutable with the completed document.  
**Important Exceptions/Edge Cases:** Failed confirmation consumes no number. Draft currency is normally editable; completed currency follows INV-006 correction rules.  
**Dependencies:** AUTH-001, HIST-001.  
**Acceptance Notes:** Allowed state transitions preserve the original document and reject direct deletion.

---

### SALE-002 — Confirmation Marks Inventory Sold

**Name:** Sale completion point  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Inventory becomes Sold when a valid invoice is confirmed, not when fully paid or physically delivered.  
**Business Reason:** The owner explicitly selected invoice confirmation as the commercial sale event.  
**Preconditions:** Draft validation, reservations, customer, prices, and applicable fiscal information are valid.  
**Main Flow:** The system revalidates stock and atomically confirms the invoice, assigns its internal `FAC-` number, consumes reservations, updates inventory, and writes history.  
**Business Rules:** Credit or outstanding balance does not leave sold inventory Available.  
**Important Exceptions/Edge Cases:** Any conflict aborts the whole confirmation without partial states.  
**Dependencies:** SALE-001, RES-001, LINE-001, LINE-002, HIST-001.  
**Acceptance Notes:** Confirmation updates invoice and inventory together; simulated failure updates neither.

---

### SALE-003 — Fiscal and Nonfiscal Internal Invoices

**Name:** Internal invoices with included ITBIS  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** The MVP must support internal nonfiscal and fiscal-value invoices; the entered final price includes fixed 18% ITBIS only for taxable merchandise/product lines, while mechanical service and delivery/shipping lines are non-taxable.  
**Business Reason:** Most sales are nonfiscal, but the business also needs tax-bearing customer documents.  
**Preconditions:** Required customer and line information is present.  
**Main Flow:** User selects the document type; fiscal validation requires customer RNC/Cédula; for each line the system derives taxable base and included ITBIS from that line's final price and rounds that line's monetary results to two decimal places; invoice totals are then calculated from the already rounded line values, and line treatment and totals are snapshotted at confirmation.  
**Business Rules:** Taxable merchandise includes tracked parts, quantity products, externally sourced resale parts, and generic merchandise; 18% is not Administrator-configurable; service and delivery retain their entered final amounts without ITBIS; invoice monetary values display and persist to two decimals. Rounding is a per-line calculation rule, not display formatting: each line is calculated and rounded individually before totals are summed, and rounding must not be deferred so that the only rounding happens at the final invoice total.  
**Important Exceptions/Edge Cases:** A generic customer cannot complete a fiscal invoice without qualifying identity. Final PDF layout and legal/footer wording remain later output-design details; rounding order and numbering are resolved.  
**Dependencies:** CUST-002, CUST-003, SALE-001, COST-002, LINE-001 through LINE-006.  
**Acceptance Notes:** Taxable examples derive included 18% ITBIS from final price, while service and delivery examples produce no ITBIS. A multi-line invoice's totals equal the sum of the already rounded line values rather than a single rounding of unrounded arithmetic.

---

### SALE-004 — No Initial DGII Integration

**Name:** Internal PDF with manual NCF field  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** The MVP must produce a printable internal PDF invoice with its `FAC-` internal number and the visibly blank field `NCF: ______________________`, and must not communicate with DGII or generate, validate, or assign NCF/e-CF.  
**Business Reason:** The owner needs internal fiscal/nonfiscal handling without expanding the MVP into government integration.  
**Main Flow:** Confirmation preserves the invoice; the system renders its printable PDF for the external manual NCF process.  
**Business Rules:** The internal invoice number is not the NCF. DGII integration, NCF generation/validation/assignment, e-CF, fiscal XML, and fiscal credit notes are outside MVP; thermal printing is not assumed. When a line has `notes`, the PDF shows them below that line's `description` as secondary text.  
**Important Exceptions/Edge Cases:** Document wording must not imply legal capabilities the system lacks; template design remains a later output decision.  
**Dependencies:** SALE-003.  
**Acceptance Notes:** A PDF can be produced without external fiscal services and always shows the intentionally blank NCF field.

---

### SALE-005 — Cash and Credit Sales

**Name:** Sale terms and outstanding balance  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An invoice may be sold for immediate payment or on credit, including delivery before full payment, and must track its outstanding balance in the invoice's single currency.  
**Business Reason:** Credit is normal business operation.  
**Main Flow:** User records sale terms and initial payments; confirmation calculates the remaining balance.  
**Business Rules:** Invoice state, payment state, and inventory state remain separate; all payments and balances use the invoice currency, while the preserved acquisition-cost basis remains in `DOP` under COST-001. `Cliente contado` (`isDefault`) is cash-only: confirmation must settle the gross total in the initial payment (owner decision 2026-09-11). Credit (zero or partial initial payment) remains valid only for named customers.  
**Important Exceptions/Edge Cases:** A completed unpaid invoice still has Sold inventory. A valid sale also stands when a `USD` invoice's profitability is pending an exchange rate under COST-003. Confirming `Cliente contado` without a full initial payment is rejected.  
**Dependencies:** SALE-002, PAY-001, PAY-002.  
**Acceptance Notes:** Fully paid, partially paid, and unpaid completed invoices show correct balances.

---

### SALE-006 — Sell Installed Component Atomically

**Name:** Installed-part sale and dismantling initiation  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Confirming an unrestricted installed component sale must atomically confirm the invoice, consume the reservation, mark the piece Sold, create or reuse its Dismantling Work Order, and write linked history without closing the current relationship or changing parent completeness.  
**Business Reason:** This synchronization is the product's central differentiator.  
**Preconditions:** Component is Available, reserved by the draft, Installed, and not protected by `No desarmar`.  
**Main Flow:** Confirmation revalidates Draft, reservation, item, hierarchy, restriction, and active physical operations; it then confirms the invoice, marks the item Sold, consumes the reservation, creates or reuses the order, and writes history together.  
**Business Rules:** Invoice confirmation and physical dismantling are separate events; the piece remains Installed and the direct parent remains unchanged until WO-008 completes.  
**Important Exceptions/Edge Cases:** Changed parent, availability, reservation, restriction, or conflicting active physical operation aborts confirmation; an appropriate existing active operation is reused without overwriting history.  
**Dependencies:** SALE-002, HIER-003, HIER-008, RES-001, WO-007, HIST-002.  
**Acceptance Notes:** Success leaves the piece Sold and Installed with one linked active dismantling operation; a forced failure leaves all confirmation state unchanged.

---

### SALE-007 — Sell Quantity Stock

**Name:** Quantity-product sale  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A completed quantity line must atomically consume its reserved quantity, update stock, preserve unit/final price, and calculate cost/profit using the approved method.  
**Business Reason:** Interchangeable products are part of daily sales and must not oversell.  
**Preconditions:** The draft owns a sufficient active quantity reservation.  
**Main Flow:** Confirmation validates the reservation, converts it to sold quantity, and records financial snapshots.  
**Business Rules:** Stock cannot become negative.  
**Important Exceptions/Edge Cases:** Cancellation must preserve the original weighted-average cost basis consistently. Advanced returns are Future scope.  
**Dependencies:** QTY-002, QTY-003, SALE-002, LINE-002, COST-003.  
**Acceptance Notes:** Quantity and invoice update together; concurrent oversell is rejected.

---

### SALE-008 — Sell Complete Assembly

**Name:** Assembly sale synchronization  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Confirming an assembly sale must atomically mark the selected root and every included current descendant Sold and preserve an immutable snapshot of the exact hierarchy delivered, invoice currency, prices, `DOP` cost basis, and monetary totals.  
**Business Reason:** A complete engine or truck is delivered as a unit, its component records must not remain sellable, and its snapshot must represent a stable physical structure.  
**Preconditions:** The draft owns non-overlapping reservations for the assembly structure, and no `Pending` or `In Progress` Dismantling or Installation Work Order could change the selected root, any current descendant, or an item being installed into the selected assembly/subtree.  
**Main Flow:** User reviews the exact included tree; confirmation checks for relevant active physical work and rejects any unstable hierarchy. After the work is resolved through its valid workflow, confirmation rereads the current hierarchy, rebuilds or revalidates reservations as necessary, marks all delivered nodes Sold, stores the immutable hierarchy snapshot, and writes linked history in one transaction.  
**Business Rules:** The system never automatically cancels physical work, silently excludes an affected component, or confirms an uncertain snapshot. No included descendant remains separately Available or appears as a conflicting independent line; to exclude a component, it must first be physically removed through a completed Dismantling Work Order.  
**Important Exceptions/Edge Cases:** A relevant active order, changed hierarchy, overlapping reservation, or invalid descendant availability aborts all changes with a clear business conflict; current relationship lifecycle after sale cannot alter the snapshot. An unavailable exchange rate is not such a conflict: it never aborts confirmation and only leaves `USD` profitability pending under COST-003.  
**Dependencies:** HIER-010, RES-001, SALE-002, LINE-001, WO-001, WO-002, WO-008, WO-009, HIST-002.  
**Acceptance Notes:** Pending dismantling of a descendant or In Progress installation into the subtree blocks confirmation with a clear conflict such as `Cannot complete this assembly sale while physical work affecting its structure is active.` After resolution and fresh validation, root and descendants update together and the immutable delivered-tree snapshot remains exact.

---

### LINE-001 — Individual Inventory Line

**Name:** Sell one tracked physical item  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An invoice line for individual inventory must identify exactly one physical item and preserve its description, acquisition-cost snapshot where authorized, final price, and hierarchy context.  
**Business Reason:** A physical unit cannot be sold twice or confused with another unit.  
**Preconditions:** The item is eligible and reserved by the draft.  
**Main Flow:** User adds the item, enters final price, and confirms through the applicable sale flow.  
**Business Rules:** The same item cannot be both a direct line and included descendant.  
**Important Exceptions/Edge Cases:** Installed items use SALE-006; assemblies use SALE-008.  
**Dependencies:** INV-001, RES-001, COST-001, COST-002.  
**Acceptance Notes:** Completed line can be traced to one immutable inventory identity.

---

### LINE-002 — Quantity Product Line

**Name:** Sell interchangeable units  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A quantity line must identify the product, quantity, unit/final price basis, reservation, and approved cost basis.  
**Business Reason:** Multiple interchangeable units need clear totals without individual identities.  
**Preconditions:** Requested quantity can be reserved.  
**Main Flow:** User enters quantity and price; the draft reserves units; confirmation consumes them.  
**Business Rules:** Quantity must be positive and cannot exceed available-to-reserve stock.  
**Important Exceptions/Edge Cases:** The completed line preserves the weighted-average basis at confirmation even when later receipts change the current average.  
**Dependencies:** QTY-001, QTY-002, QTY-003, SALE-007.  
**Acceptance Notes:** Line totals and stock movements match the completed quantity.

---

### LINE-003 — Generic Free-Form Line

**Name:** Sell unnamed or generic goods  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Users may add a sale line with a brief free-form description for generic goods or materials not represented as inventory.  
**Business Reason:** Customers sometimes buy miscellaneous metal or goods with no useful catalog identity.  
**Main Flow:** User enters description, quantity if applicable, acquisition cost when known, and final price.  
**Business Rules:** A generic line does not silently create or consume tracked inventory; generic merchandise is taxable under SALE-003.  
**Important Exceptions/Edge Cases:** If stock tracking is required, register inventory and use LINE-001 or LINE-002 instead.  
**Dependencies:** COST-001, COST-002, SALE-002.  
**Acceptance Notes:** Generic line appears on the invoice and causes no inventory movement.

---

### LINE-004 — Mechanical Service Line

**Name:** Sell repair or installation service  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Users may include mechanical repair or installation service selected from an Administrator-maintained service catalog on the same invoice as parts.  
**Business Reason:** The business sells parts and performs associated mechanical work.  
**Main Flow:** Seller or Administrator selects the service type from the catalog, enters the final negotiated price, and confirms it with the invoice.  
**Business Rules:** The catalog identifies service type but does not impose a fixed price. The completed line preserves the selected service and negotiated price. Service lines are non-taxable and do not consume inventory unless separate inventory lines are also present.  
**Important Exceptions/Edge Cases:** Seller may use but not maintain the catalog. Generic merchandise remains a distinct free-form line under LINE-003.  
**Dependencies:** SALE-002, SALE-003, COST-002.  
**Acceptance Notes:** One invoice can contain parts and services with distinct line types.

---

### LINE-005 — External Resale Line

**Name:** Sell externally sourced part  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Users may record a part bought elsewhere for immediate resale, including its `DOP` acquisition cost, description, and final selling price, without pretending it was existing stock.  
**Business Reason:** The business sources unavailable parts from another seller and resells them at a margin.  
**Main Flow:** User records external source description and cost, enters final price, and confirms the line.  
**Business Rules:** Gross profit uses the line's preserved `DOP` acquisition cost under COST-003; the line does not decrement local inventory; the merchandise line is taxable under SALE-003.  
**Important Exceptions/Edge Cases:** Supplier/purchasing management is outside MVP. A part bought elsewhere in another currency is entered as its DOP-equivalent cost; the employee converts it outside the application.  
**Dependencies:** COST-001, COST-002, COST-003, SALE-002.  
**Acceptance Notes:** Invoice and Administrator profit view distinguish external resale from stocked inventory.

---

### LINE-006 — Delivery Line

**Name:** Paid or included delivery  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An invoice may omit delivery, include delivery with a positive charged amount, or include provided no-charge delivery with numeric monetary amount `0`.  
**Business Reason:** Delivery is sometimes billed and sometimes provided to selected customers.  
**Main Flow:** If delivery applies, the user adds it, records a description and a nonnegative numeric amount, then confirms.  
**Business Rules:** A delivery line requires a nonempty description; an invoice has at most one delivery line; delivery is non-taxable; all displayed delivery amounts use two decimal places; free delivery uses numeric `0`, never textual `N/A` or another nonnumeric monetary placeholder.  
**Important Exceptions/Edge Cases:** No delivery line is required when delivery is not part of the invoice; charged delivery must use a positive numeric amount; concurrent attempts to add a second delivery line safely conflict without creating a duplicate.  
**Dependencies:** SALE-002, COST-002.  
**Acceptance Notes:** Charged delivery displays its positive amount; provided free delivery displays `RD$0`; an absent delivery creates no line; missing or blank descriptions are rejected; a second delivery line returns a conflict.
