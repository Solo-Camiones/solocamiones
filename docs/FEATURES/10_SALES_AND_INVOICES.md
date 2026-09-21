# Feature 10 — Sales, Invoice Lifecycle, and Invoice Lines

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `SALE-001, SALE-002, SALE-003, SALE-004, SALE-005, SALE-006, SALE-007, SALE-008, SALE-009, SALE-010, QUOTE-001, QUOTE-002, DOC-001, LINE-001, LINE-002, LINE-003, LINE-004, LINE-005, LINE-006`.

`SALE-009`, `SALE-010`, `QUOTE-001`, `QUOTE-002`, and `DOC-001` were added 2026-09-15 for the pre-production business change set. `SALE-003` and `SALE-005` were amended the same day. Commercial conduces (`CON-001`–`CON-006`) live in Feature 16; this file remains authoritative for direct invoice confirmation and shares the sales aggregate with conduces. This file is authoritative over `docs/pre_production_business_changes/IMPLEMENTATION_PLAN.md`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 2 Billing Core starts this feature; Release 5/7 complete inventory-backed and installed/assembly sale paths**

**Implementation (2026-09-10):** Release 2 non-inventory lines, confirm/`FAC-`, PDF generate/regenerate, and HTTP POS/detail/PDF are done. Invoice detail HTTP shows **document activity** from history (confirm, payment, PDF, cancel; not draft/line churn — Feature 14). Confirm may record a **pulled-forward** initial payment and `dueDate` (Feature 12). Release 5/7 checklist `[x]` items are **prototype mock**; HTTP API still rejects ITEM/QTY with 409.

**Pre-production change set (2026-09-15):** Tax-exclusive ITBIS (`SALE-009`/`SALE-010`) is **implemented locally** (Paso 4). Cash/credit confirmation against customer type (`SALE-005` amended) is **implemented locally** (Paso 5, 2026-09-16): named `CASH` is not credit-eligible; `CREDIT` is DOP-only with limit and term snapshot. Convertible quotes (`QUOTE-001`/`QUOTE-002`) are **implemented locally** (Paso 6, 2026-09-16): `QUOTE_DRAFT`/`QUOTE_ISSUED`/`COMPLETED` on the same aggregate, `COT-` sequence, 15-day expiry, duplicate, and convert. Corporate-vs-historical PDF presentation (`DOC-001`) is **implemented, verificada y aprobada localmente** (Paso 9, 2026-09-17).

**Administrator seller-sales report (2026-09-18, local pull-forward):** Finanzas y control exposes `/seller-sales` for Administrator only. `GET /api/sales/reports/seller-sales` paginates like other sales lists (`page` / `pageSize`, default 10/max 100) and `.pdf` returns the full filtered range. Both list `COMPLETED` invoices (`confirmedAt` / `confirmedBy*`) and outstanding `QUOTE_ISSUED` quotes (`quoteIssuedAt` / `quoteIssuedBy*`) in `America/Santo_Domingo` date bounds, with optional `sellerUserId`. Cancelled and drafts are excluded; converting COT→FAC does not double-count. PDF is data-only (no commission formula). This is outside the generic reporting items in `FUTURE_ROADMAP.md`. **Conduces (Feature 16, not started):** when implemented, seller-sales and related volume reports must include emitted conduces once and must not double-count after `CON-` → `FAC-` (CON-006).

**Commercial conduces (2026-09-20, documentation):** Feature 16 adds optional `CONDUCE` on this same aggregate before `COMPLETED`. Direct `DRAFT` / `QUOTE_ISSUED` → `COMPLETED` confirmation without `CON-` remains valid and keeps SALE-005 cash/credit rules. Do not implement conduce behavior from this file; use `CON-001`–`CON-006`.

## What this feature does

Provide Draft/Completed/Cancelled internal invoices, optional quote stages on the same aggregate, a shared `FAC-` sequence and independent `COT-` sequence, DOP/USD single-currency behavior, validated line types, optional base + 18% ITBIS separate from fiscal emission, printable PDF output, atomic confirmation semantics, and an Administrator-only seller-sales volume report (JSON + PDF) pulled forward from future reporting.

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

Sales owns the invoice aggregate and immutable completed-sale snapshot. Invoice states remain `Draft`, `Completed`, and `Cancelled`. Quote stages `QUOTE_DRAFT` and `QUOTE_ISSUED` occupy the same aggregate before conversion to `Completed` (QUOTE-001). **Planned:** `CONDUCE` also occupies this aggregate (Feature 16) between draft/quote and invoice. A Draft or quote draft has no `FAC-` number; successful confirmation assigns the next unique never-reused number from one shared sequence such as `FAC-000001`. Issuing a quote assigns an independent never-reused `COT-` number. Issuing a conduce (when implemented) assigns an independent never-reused `CON-` number without consuming `FAC-` until conversion.

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

Applying ITBIS is a separate draft flag from emitting a fiscal-value document (`SALE-009`). When `Aplicar ITBIS` is on, taxable merchandise/product line prices are the **tax-exclusive base**; add 18% per line (`SALE-010`). The flag defaults to off. Mechanical service and delivery remain non-taxable. Calculate/round every line to two decimals first, then sum the already-rounded lines. Existing drafts are recalculated under the new formula when the change ships; completed invoices keep stored money.

Confirmation is a coordinating service/transaction. For inventory-backed paths it revalidates reservation, stock, hierarchy, `No desarmar`, and active physical operations before atomically committing sale state. Installed-item confirmation marks the piece `Sold` but keeps it `Installed` and creates/reuses a Dismantling Work Order; physical relation changes later at Work-Order completion.

Invoice PDF rendering is secondary to sale validity. Preserve all invoice facts needed for deterministic regeneration, including confirmation seller, customer phone and due date; historical rows leave non-reconstructable seller/phone snapshots blank. Commercial and monetary facts on a completed invoice are immutable (`DOC-001`). Issuer identity, social networks, and payment-instruction boilerplate use the **current** corporate profile when the PDF is downloaded again. The branded template uses the Solo Camiones logo, a sober industrial layout, line table, base/ITBIS/total, thank-you message and Seller/Customer signature spaces. It includes a blank `NCF: ______________________` and never implies DGII/NCF/e-CF integration. The invoice PDF does **not** show payment state, outstanding balance, balance-calculation timestamp, or private payment movements, regardless of whether Seller or Administrator downloads it. Those financial fields remain in the Administrator-only account statement. A newly downloaded Cancelled invoice preserves original commercial facts and adds a prominent cancellation mark, reason, date and Administrator. Quote PDFs use a separate template titled `COTIZACIÓN`.

## Feature-level acceptance criteria

- Draft can be prepared without consuming/selling inventory until the relevant confirmation path.
- Successful confirmation assigns one unique shared `FAC-` number that is never reused.
- One invoice uses one DOP or USD currency; mixed-currency lines are rejected.
- When `Aplicar ITBIS` is on, taxable lines use base + 18% with per-line rounding; when off, taxable lines have zero ITBIS.
- Fiscal emission remains independent of `Aplicar ITBIS` and still requires qualifying customer identity.
- Service and delivery remain non-taxable.
- Cash customers settle in full at **direct invoice confirmation**; credit is DOP-only for `CREDIT` customers and cannot exceed the limit. Administrator named-`CASH` balance on **conduce emission only** is Feature 16 (`CON-002`), not SALE-005.
- Issued quotes receive unique `COT-` numbers, expire at end of day 15 in `America/Santo_Domingo`, and convert on the same aggregate to `FAC-`.
- Re-downloaded historical PDFs keep stored money and apply current corporate presentation.
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
- [x] Tax-inclusive 18% calculation and per-line rounding. _(superseded live behavior; SALE-009/SALE-010 is the current formula)_
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

### Pre-production tax, credit confirmation, quotes, and PDF

- [x] Separate `applyItbis` from fiscal emission; default the ITBIS checkbox off (SALE-009).
- [x] Tax-exclusive base + 18% per taxable line; preserve completed invoice money; recalculate open drafts (SALE-010).
- [x] Confirm cash vs credit against customer type, DOP-only credit, term snapshot, and credit limit inside the confirmation transaction (SALE-005, CUST-005). _(API + HTTP local Paso 5, 2026-09-16)_
- [x] Quote stages on the same aggregate, `COT-` sequence, expiry, duplicate, convert (QUOTE-001, QUOTE-002). _(API + HTTP + mock local Paso 6, 2026-09-16. Quote PDF template is Paso 9 / DOC-001.)_
- [x] PDF `internal-v4` / quote template with DOC-001 immutable facts vs current corporate profile. _(API + HTTP UI, verificación técnica y muestras aprobadas localmente; Paso 9 cerrado 2026-09-17.)_
- [x] Administrator-only seller-sales report (JSON + PDF) under Finanzas y control. _(Local pull-forward 2026-09-18: date range + optional seller; JSON `page`/`pageSize`; COMPLETED + outstanding QUOTE_ISSUED; no commission formula.)_

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### SALE-001 — Internal Invoice Lifecycle

**Name:** Draft, completed, and cancelled invoices  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Internal invoices must have Draft, Completed, and Cancelled states and exactly one currency, `DOP` or `USD`. A unique automatic number using `FAC-` plus an initially six-digit zero-padded sequence is assigned only when a valid Draft is successfully confirmed.  
**Business Reason:** Sales need an editable preparation stage and immutable completed history.  
**Main Flow:** Seller or Administrator creates a Draft, selects and may edit its currency, then confirms it or Administrator later cancels it through the cancellation flow. Successful confirmation atomically assigns the next number, such as `FAC-000001`.  
**Business Rules:** Users never type the internal number; DOP and USD share one `FAC-` sequence; numbers are unique and never reused; cancelled invoices keep their original number; Completed invoices are not edited as drafts or physically deleted. Optional line `notes` may be added or edited only while Draft and become immutable with the completed document. Quote stages on this same aggregate are specified in QUOTE-001 and do not consume `FAC-` until conversion/confirmation.  
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

**Name:** Internal fiscal-value vs nonfiscal invoices  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** The MVP must support internal nonfiscal and fiscal-value invoices. Fiscal emission requires a qualifying customer identity (CUST-002, CUST-007). Whether ITBIS is calculated is specified in SALE-009 and SALE-010 and is not implied by the fiscal checkbox.  
**Business Reason:** Most sales are nonfiscal, but the business also needs tax-bearing customer documents without treating every taxed sale as a fiscal comprobante.  
**Preconditions:** Required customer and line information is present.  
**Main Flow:** User selects the document type; fiscal validation requires customer RNC/Cédula on a named qualifying customer; line money is calculated under SALE-009/SALE-010; line treatment and totals are snapshotted at confirmation.  
**Business Rules:** The generic `Cliente contado` cannot complete a fiscal invoice. A named `CASH` customer with valid RNC/Cédula may. Service and delivery remain non-taxable under SALE-010 regardless of fiscal type. Invoice monetary values display and persist to two decimals.  
**Important Exceptions/Edge Cases:** Final PDF layout and legal/footer wording do not reopen core invoice behavior. Rounding order lives in SALE-010.  
**Dependencies:** CUST-002, CUST-003, CUST-007, SALE-001, SALE-009, SALE-010, COST-002, LINE-001 through LINE-006.  
**Acceptance Notes:** Fiscal emission is rejected for generic `Cliente contado` even when `Aplicar ITBIS` is on. Named cash with valid RNC can emit fiscal. Selecting fiscal does not by itself add 18%.

**Amended 2026-09-15:** Tax-inclusive 18% is no longer this ID’s rule. Calculation moved to SALE-009/SALE-010.

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
**Business Rules:** Invoice state, payment state, and inventory state remain separate; all payments and balances use the invoice currency, while the preserved acquisition-cost basis remains in `DOP` under COST-001. For **direct invoice confirmation** (no conduce), `CASH` customers, including generic `Cliente contado` and named `CASH`, must settle the gross total at confirmation. Credit (remaining balance after confirmation) is allowed only for customers classified `CREDIT`, only in DOP, using that customer’s stored term and limit (CUST-004, CUST-005). Seller confirms credit with zero initial payment; Administrator may omit the initial payment or record an amount greater than 0 up to the gross total (partial or full). A payment of 0 is not persisted. A USD invoice cannot confirm with a remaining balance on the direct confirmation path. Confirmation copies type and term onto the invoice; later customer edits do not rewrite them. Credit `dueDate` **replaces** the previous automatic +30 calendar days: it is the local confirmation date plus the snapshotted `creditTermDays` of that customer (30, 45, 60, 90, or 120), expiring at end of that day in `America/Santo_Domingo`. For a fully paid cash invoice (`CASH`, or `USD` settled in full), `dueDate` is that same local confirmation calendar day at end of day in `America/Santo_Domingo` — not `null` and not confirmation+30. The actor cannot type a different due date on the invoice for these direct-confirmation cash cases. **Conduce emission** payment and due-date rules, including the Administrator exception for **named** `CASH` only, are specified in CON-002 and do not weaken this direct-confirmation rule.  
**Important Exceptions/Edge Cases:** A completed unpaid credit invoice still has Sold inventory. A valid sale also stands when a `USD` invoice's profitability is pending an exchange rate under COST-003. Confirming `CASH` without a full initial payment on the direct path is rejected. Exceeding the credit limit is rejected even for Administrator. Direct cash sales must not appear as open receivables after confirmation. Historical `COMPLETED` invoices keep the `dueDate` already stored (including the former +30 rule).  
**Dependencies:** SALE-002, CUST-004, CUST-005, PAY-001, PAY-002, PAY-007, CON-002.  
**Acceptance Notes:** Fully paid cash, Administrator partial-credit, and Seller unpaid-credit confirmations show correct balances. A `CREDIT` customer USD draft with remaining balance is rejected on direct confirm. Two concurrent credit confirmations cannot exceed the limit. Confirming credit for a customer whose term is 60 days yields due date confirmation+60, never confirmation+30 unless that customer’s term is 30. Administrator named-`CASH` partial payment on **direct** confirm remains rejected; that path is conduce-only (CON-002).

**Amended 2026-09-15:** Credit is no longer available to every named customer. New credit invoices no longer use a universal 30-day due date.  
**Amended 2026-09-20:** Clarified that full `CASH` settlement applies to direct invoice confirmation; conduce financial matrix lives in CON-002.

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
**Main Flow:** User enters description, quantity if applicable, and final price. Acquisition cost is not captured on the billing line (COST-006).  
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
**Requirement:** Users may record a part bought elsewhere for immediate resale, including description and final selling price, without pretending it was existing stock. Billing capture does not collect acquisition cost (COST-006).  
**Business Reason:** The business sources unavailable parts from another seller and resells them at a margin.  
**Main Flow:** User records external source description, enters final price, and confirms the line. Acquisition cost is not captured on the billing line until inventory-backed cost exists (COST-006).  
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

---

### SALE-009 — Apply ITBIS Independently of Fiscal Emission

**Name:** Optional ITBIS flag separate from comprobante fiscal  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Drafts and quotes have an `applyItbis` flag, presented as `Aplicar ITBIS`, independent of the fiscal-document flag. It defaults to off. Future e-NCF integration is expected to make ITBIS always-on and must retire this temporary flag in a controlled change; that retirement is not this requirement.  
**Business Reason:** The business needs to tax some nonfiscal sales and to emit fiscal documents without collapsing both decisions into one checkbox.  
**Main Flow:** User may check `Aplicar ITBIS` and/or fiscal emission. Totals recalculate under SALE-010. Fiscal validation still uses CUST-007.  
**Business Rules:** Default is unchecked. The flag is snapshotted on confirmation and on quote issue. Generic `Cliente contado` may have `applyItbis=true` and still cannot be fiscal.  
**Important Exceptions/Edge Cases:** Unchecking the flag zeroes ITBIS on taxable lines without changing entered unit prices. Service and delivery stay non-taxable even when the flag is on.  
**Dependencies:** SALE-003, SALE-010, CUST-007.  
**Acceptance Notes:** New drafts open with ITBIS off. Checking only `Aplicar ITBIS` on `Cliente contado` adds 18% to taxable lines and still rejects fiscal emission. Checking only fiscal on a named customer with RNC does not add ITBIS unless `Aplicar ITBIS` is also on.

---

### SALE-010 — Tax-Exclusive Base Plus 18 Percent

**Name:** Per-line base + 18% ITBIS  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** When `applyItbis` is true, each taxable merchandise/product line uses the entered unit price as tax-exclusive base:

```text
base = round2(quantity * unitPrice)
itbis = round2(base * 0.18)
gross = base + itbis
```

When `applyItbis` is false, taxable lines have `itbis = 0` and `gross = base`. Mechanical service and delivery are always:

```text
base = round2(quantity * unitPrice)
itbis = 0.00
gross = base
```

**Business Reason:** The owner replaced tax-inclusive entry so the typed price is the base.  
**Main Flow:** Each line is calculated and rounded to two decimals under the formulas above. Invoice header totals then apply an optional commercial `discountPercent` (0–100, default 0) to the **sum of all line bases** (taxable merchandise plus service/delivery). POS Subtotal continues to show that same pre-discount sum; the discount amount is `round2(allLineBases * discountPercent / 100)`. ITBIS on the invoice header is always the SALE-010 sum of already-rounded per-line ITBIS (taxable bases **before** discount); the discount does not reduce ITBIS. When the discount amount is greater than zero, header `base` is `allLineBases − discount` and `gross` is `base + ITBIS`. When the discount amount is zero, header totals remain the SALE-010 sum of already-rounded per-line money (do not replace that with 18% of the combined base). Line rows keep pre-discount money; only invoice header `base` / `itbis` / `gross` reflect the discount. The percent is editable on draft/quote-draft via the same meta path as `applyItbis` and is snapshotted through issue/confirm.  
**Business Rules:** Taxable merchandise includes tracked parts, quantity products, externally sourced resale parts, and generic merchandise. The 18% rate is not Administrator-configurable. Use decimal-safe money (`Prisma.Decimal` or equivalent); do not use binary floating point in the API. Completed (`COMPLETED`) invoices keep stored `base`, `itbis`, and `gross`; they are never recalculated on read or PDF regenerate. Open drafts (and quote drafts) are recalculated under this formula when the change is activated.  
**Important Exceptions/Edge Cases:** Historical completed invoices that were stored under the previous tax-inclusive formula remain those stored amounts. When `discountPercent > 0`, the sum of line money may differ from invoice header totals by design. A 100% discount can leave a remaining total equal to pre-discount ITBIS.  
**Dependencies:** SALE-003, SALE-009, COST-002, LINE-001 through LINE-006.  
**Acceptance Notes:** Taxable unit price `118.00` quantity `1` with ITBIS on yields base `118.00`, ITBIS `21.24`, gross `139.24`. Several taxable lines with zero discount round individually; the invoice ITBIS equals the sum of line ITBIS, not `round2(sum(base) * 0.18)`. Merchandise `100.00` plus service `50.00`, ITBIS on, discount `10%` yields discount `15.00`, header base `135.00`, ITBIS `18.00`, gross `153.00`; line rows stay pre-discount. Service `118.00` yields ITBIS `0.00` and is included in the discount base. The same `118.00` with ITBIS off yields total `118.00`. A completed historical invoice whose stored gross was `118.00` still reads `118.00` after migration. POS, API, preview, and PDF show identical header base, ITBIS, and total.

---

### QUOTE-001 — Convertible Quote on the Sale Aggregate

**Name:** Quote draft, issued quote, and conversion to invoice  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A quote is a stage of the same sales aggregate that later becomes an invoice or, when Feature 16 is implemented, a conduce then optionally an invoice. States include `QUOTE_DRAFT → QUOTE_ISSUED → COMPLETED` and, planned, `QUOTE_ISSUED → CONDUCE → COMPLETED`. Conversion is a state transition, not a copy into a new draft. The resulting operation keeps the same internal id, customer, currency, `applyItbis`, lines, quantities, prices, and notes. Direct convert-to-invoice assigns `FAC-` and preserves origin `COT-`. Convert-to-conduce assigns `CON-` without `FAC-` until a later CON-003 conversion; fiscal for the invoice is chosen at that later step.  
**Business Reason:** The owner must prepare a quote and continue that same operation through invoicing or conduce without rebuilding lines.  
**Main Flow:** User creates a quote draft, edits it, issues it (assigns `COT-`), then converts through confirmation to invoice **or** (when implemented) to conduce.  
**Business Rules:** `QUOTE_DRAFT` is editable and has no `COT-`. Issue assigns the next unique never-reused `COT-000001`-style number and makes the quote immutable. Convert-to-invoice runs the full direct confirmation rules (customer type, credit limit, stock when applicable, ITBIS, cash payment per SALE-005). Cash convert-to-invoice requires full payment and method before assigning `FAC-`. Convert-to-conduce follows CON-001/CON-002 and does not assign `FAC-`. Quotes do not record payments, create receivables, reserve inventory, or consume/sell inventory until conversion recognizes the sale. Inventory availability is validated only at conversion. A completed invoice or issued conduce cannot return to quote. Retrying conversion is idempotent or returns a safe conflict without duplicating lines, `FAC-`, `CON-`, or `COT-`. History records create, issue, and convert with actor and timestamp.  
**Important Exceptions/Edge Cases:** Do not model quote and invoice as two linked row sets. Do not overload invoice confirm with an ambiguous “maybe this is a quote” meaning; expose explicit issue/convert commands (and explicit convert-to-conduce when implemented).  
**Dependencies:** SALE-001, SALE-005, SALE-009, SALE-010, QUOTE-002, CUST-005, HIST-001, CON-001, CON-002.  
**Acceptance Notes:** Issue yields `COT-000001` without `FAC-`. Convert-to-invoice assigns `FAC-` on the same id and shows origin `COT-000001`. When implemented, convert-to-conduce assigns `CON-` on the same id and shows origin `COT-`. A second convert returns the same number or a conflict and does not duplicate lines. While issued as quote only, payment and receivables endpoints reject the operation.

**Amended 2026-09-20:** Documented planned convert-to-conduce path (Feature 16); direct convert-to-invoice rules unchanged.

---

### QUOTE-002 — Quote Validity, Duplicate, and Expiry

**Name:** Fifteen-day quote validity and duplicate-as-new  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An issued quote is valid through the end of calendar day 15 in `America/Santo_Domingo` after issue. It cannot be edited, reactivated, or converted after expiry. It may be duplicated into a new `QUOTE_DRAFT` that copies customer, currency, fiscal flags, `applyItbis`, lines, quantities, prices, and notes, and receives a new `COT-` only when that new quote is issued.  
**Business Reason:** Quotes must expire predictably in business local time without silently mutating the issued document.  
**Main Flow:** User issues a quote; after expiry, convert is rejected; duplicate creates a new editable quote.  
**Business Rules:** The quote PDF title is `COTIZACIÓN` and must not add the phrase `NO ES FACTURA`. Money on the quote PDF uses SALE-010. Users never type `COT-` numbers.  
**Important Exceptions/Edge Cases:** Duplicate does not alter the original issued quote. Expired quotes remain readable.  
**Dependencies:** QUOTE-001, SALE-010, DOC-001.  
**Acceptance Notes:** A quote issued 2026-09-15 is convertible through 2026-09-30 23:59:59 in `America/Santo_Domingo` and not after. Duplicate of `COT-000001` creates a draft with no number; issuing it yields `COT-000002`. Convert on an expired quote is rejected.

---

### DOC-001 — Immutable Commercial Facts vs Current Corporate Presentation

**Name:** Historical invoice facts and current issuer profile  
**Status:** CONFIRMED  
**Actors:** Seller and Administrator (download); corporate profile is maintained in code configuration
**Requirement:** Re-downloading a historical invoice or quote PDF must keep stored commercial and monetary facts and apply the **current** corporate presentation profile.  
**Business Reason:** Contact data and payment instructions change; issued prices, taxes, parties, and lines must not.  
**Immutable facts:** customer snapshot (including cash/credit type), lines, quantities, prices, stored base/ITBIS/gross, currency, `FAC-` and origins `COT-` / `CON-` when present, business dates (`confirmedAt` / issue / due / `invoiceIssuedAt`), confirmation seller (invoices and conduces) or quote issuer (issued quotes), and cancellation mark/reason/date.
**Current presentation:** one corporate profile centralized in code (no database table, API, or maintenance UI): name `SOLO CAMIONES`; tagline `Importadora de repuestos nuevos y usados` printed directly under the name; RNC `1-33-13562-2`; address `Av. Pdte. Antonio Guzmán Fernández #68, próximo al Aerop. El Higüero`; WhatsApp `809-875-3161 / 829-627-3168`; email `solocamionessrl@gmail.com`; Instagram `@solocamionessrl`; Facebook `Solo Camiones SRL`; and TikTok `solo.camiones.srl`. Social networks print in the PDF header only. Invoice, quote, and conduce PDF footers show payment instructions (Banco Popular Dominicano, Cuenta Corriente DOP, account number `857578579`, account holder `Solo Camiones SRL`, cheques payable to `Solo Camiones SRL`) and terms and conditions (no returns of electrical or installed parts; claims require the original invoice; prices subject to change), without a contact/social identity strip. Invoice PDFs also show sale condition `Al contado` or `A crédito` from whether confirmation settled 100% of the gross (a CREDIT customer paying in full at confirm prints Al contado). Converted invoices print documentary date from `invoiceIssuedAt` and may show origins `CON-` and `COT-`. Conduce PDFs never show NCF, payment state, or balance (`CON-004`). The account-statement PDF keeps its own footer layout with payment instructions.
**Business Rules:** Keep only the invoice template `internal-v4`, a separate quote template, and a separate conduce template. The project has no real production data, so legacy `internal-v1`, `internal-v2`, and `internal-v3` support is removed and local test data may be cleaned/recreated; do not add a permanent migration that relabels legacy documents as `internal-v4`. Share one corporate profile rather than duplicating issuer or payment data per template. Invoice and conduce PDFs must not print payment state, outstanding balance, balance-calculation timestamp, or private payment movements, and must not claim the system processes the payment. The Administrator-only account statement continues to show its approved payment states, cumulative paid amounts, balances, and totals.
**Important Exceptions/Edge Cases:** Non-reconstructable historical seller/phone snapshots stay blank. Payment instructions are fixed code configuration until the owner explicitly changes them.
**Dependencies:** SALE-004, SALE-010, QUOTE-001, PAY-006.  
**Acceptance Notes:** A completed invoice whose stored total is `118.00` still prints `118.00`, omits payment state/balance/balance timestamp, and shows the approved corporate profile and payment footer. The account statement retains its financial states and balances. Quote PDF header is `COTIZACIÓN` and shows the same base/ITBIS/total rules as the future invoice.
