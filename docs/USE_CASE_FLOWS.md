# Practical Use-Case Flows

## Purpose and authority

These flows describe confirmed business behavior, not screens, endpoints, tables, or implementation tasks. Detailed feature rules and stable requirement IDs now live in `FEATURES/*.md`. The flows must remain consistent with those feature specs.

> **Accounts Payable is intentionally absent from these confirmed flows.** It remains `PENDING VALIDATION` in `FEATURES/15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md`. Add CxP use cases here only after that feature is confirmed.

The MVP actors are:

- **Administrator:** may perform normal Seller work and maintain catalogs, apply protected corrections, and perform recovery, invoice-cancellation, refund, `No desarmar`, and Work-Order operations identified below.
- **Seller:** performs normal inventory, customer, Draft, reservation, sale, payment, and negotiated-price work using maintained catalogs. Acquisition-cost access is view-only.
- **Mechanic:** uses a restricted mobile workflow for assigned physical work. The Mechanic sees only Work-Order and physical context, never customer, invoice, price, cost, payment, refund, balance, margin, or profit information.

The official terms are **Desarme**, **No desarmar**, **Orden de Desarme**, and **Orden de Instalación**. Older `desmontar` wording is obsolete.

## State model used by every flow

The system must present and change these concepts separately:

- **Commercial State:** an individually tracked item is normally `Available` or `Sold`. A reservation is not a commercial state. An installed item may validly be either `Available` or `Sold`.
- **Physical Relationship:** an item is `Installed` in one current direct parent or `Independent`. This is not availability. Controlled received-assembly registration establishes initial observed relationships; a protected correction may repair a verified receipt-recording error without claiming movement; every actual later physical change occurs only when a Mechanic completes the applicable Work Order.
- **Work-Order State:** `Pending → In Progress → Completed`; `Cancelled` is allowed only by the validated cancellation and recovery flows. Pending orders are unassigned. In-Progress orders have one assigned Mechanic.
- **Payment State:** `Unpaid`, `Partially Paid`, or `Paid`, derived from additive payment and refund records. It neither determines Commercial State nor proves physical delivery.
- **Invoice State:** `Draft`, `Completed`, or `Cancelled`. Confirmation, not payment or physical work, is the commercial sale event.
- **Invoice Currency:** exactly one of `DOP` or `USD` per invoice. Lines, totals, payments, balance, refunds, and profitability results use that currency, while the stored acquisition cost is always `DOP`.
- **Acquisition Cost Currency:** acquisition cost is always recorded in `DOP` for tracked items, weighted-average quantity stock, external resale lines, and estimates. Any purchase made in another currency is converted by the employee outside the application.
- **`exchangeRateDopPerUsd`:** the `DOP` required for `1 USD`, so `1 USD = DOP 61.50` gives `61.50`. Profitability for a `USD` invoice uses `costUsd = storedCostDop / exchangeRateDopPerUsd`. A provider returning the inverse or another representation is normalized to this convention first; no flow refers to an undirected "DOP/USD rate".
- **Profitability Result:** an Administrator-only value that is either calculated from selling price minus known/estimated cost, `UNAVAILABLE / PENDING FX RATE` when a `USD` invoice's rate could not be obtained, or an Administrator-recorded `DOP` amount when cost is unknown (COST-005). The system never invents a number, and profitability never blocks a sale.
- **Completeness:** `Complete` or `Incomplete` describes a parent separately from all states above. A direct parent is Complete only when it has zero unresolved Known Missing Components; a protected receipt-baseline correction may repair an original registration error but cannot imitate physical work.
- **Known Missing Component:** an unresolved absence for one direct parent, distinct from an Expected Component Definition, real inventory item, and physical relationship. Its origin is `MISSING_AT_RECEIPT` or `REMOVED_AFTER_BASELINE`.

For quantity stock, `availableToReserve = physical/on-hand quantity - currently reserved quantity`. `No disponible` is only a derived UI result when that value is zero; it is not a manually editable Commercial State.

## Cross-flow invariants

- Every protected action is authorized by the server at execution time.
- A Draft reservation prevents competing use but leaves the item Commercial State unchanged.
- Every write revalidates current state. A stale or concurrent request fails without partial business changes.
- One Work Order represents exactly one physical piece and one physical operation.
- A Seller or Administrator may establish a newly received assembly's initial observed baseline, but never edits a post-baseline hierarchy directly to claim that Desarme or installation happened.
- HIER-011 is committed once and never reopened. Administrator alone may append a protected correction of verified original receipt-recording error; Seller and Mechanic are denied, and real later physical movement still requires a Work Order.
- A Pending Work Order is visible to all Mechanics and initially unassigned.
- Only the assigned Mechanic may modify or complete an In-Progress order.
- Work-Order completion requires at least one `BEFORE` photo and one `AFTER` photo; multiple photos in either class are allowed.
- Higher ancestors do not inherit direct-parent completeness changes.
- Completeness is derived from unresolved Known Missing Components and is never selected manually. `NOT_APPLICABLE` creates no missing condition.
- Parent is directly set only during the initial received baseline. Every post-baseline parent change is the result of valid Work Order completion.
- Drafts do not expire automatically. No passage of time releases a reservation.
- Mixed-currency lines, payments, and refunds are rejected. No operational invoice, payment, or refund currency conversion is supported; FX conversion is used only to derive the `USD`-equivalent acquisition cost for profitability on `USD` invoices.
- An unavailable exchange rate never blocks a sale. A valid `USD` invoice confirms normally and its profitability becomes `UNAVAILABLE / PENDING FX RATE` until a later safe recovery, which never reruns the sale.
- Each invoice line is calculated and rounded to two decimals individually, and invoice totals sum those already rounded line values.
- Every successful invoice confirmation assigns the next unique number from the one shared `FAC-000001` sequence. Failed confirmation consumes no number, and cancellation never makes a number reusable.
- Completed invoices, payments, relationships, Work Orders, evidence, and history are preserved. Corrections and reversals add records rather than erase evidence.
- Engine testing remains a physical practice outside the MVP. No engine-test state blocks a sale or changes completeness.

## Administrator maintains business catalogs

**Primary Actor:** Administrator

**Main Flow:**

1. Administrator adds or updates an inventory category, an expected-component definition for an assembly category, a mechanical-service type, or another approved small option.
2. The system validates the definition and records actor, time, and change history.
3. Seller and Administrator may use the active definition in normal inventory or sales work.

**Important Rules:**

- Seller and Mechanic cannot administer catalogs.
- A catalog entry such as `Alternador` is a definition, not physical inventory and not an item such as `ALT-001`.
- Expected-component lists are general per assembly category, not fixed per model. Exact initial content is operational configuration.
- Historical records remain intelligible after later catalog edits; no generic ERP product master or complex versioning workflow is implied.

## Register an individually tracked item

**Primary Actor:** Seller or Administrator

**Preconditions:**

- The physical unit needs its own immutable identity rather than quantity tracking.
- The applicable category minimum is satisfied.

**Main Flow:**

1. The actor selects a maintained category and enters available shared data: name, brand, model, part or serial number when known, condition, acquisition cost when known or estimated, free-text location, notes, photos, and applicable category-specific values.
2. The system assigns the next unused public internal code for the selected category. The operator does not type that code.
3. The system creates a standalone item as `Available` and `Independent`. A present child registered within the received-assembly flow instead receives its initial observed parent relationship through that controlled baseline.
4. The system records actor, time, and initial values.

**State Result:**

- Commercial State, Physical Relationship, completeness, condition, location, and cost remain separate.
- Seller and Administrator may view acquisition cost; Seller cannot edit protected cost. Unknown cost remains unknown and is never silently treated as zero.

**Conflicts:** Reject a missing category prefix/sequence, invalid category data, unauthorized protected-cost edits, or a partial creation. Unknown real-world identifiers do not block registration when the approved practical minimum is present.

## Register quantity stock

**Primary Actor:** Seller or Administrator

**Main Flow:**

1. The actor identifies a commercially interchangeable product and enters a nonnegative opening quantity.
2. The system creates one quantity product rather than one identity per unit.
3. Later receipts and sales update physical, reserved, and available-to-reserve quantities through recorded operations.
4. The MVP applies weighted-average acquisition cost.

**State Result:** No physical parent-child relationship is created. Negative stock and silent FIFO/LIFO behavior are prohibited.

**Important Rules:**

- Seller and Administrator may perform eligible normal quantity-stock receipt/entry operations.
- A normal stock receipt/entry is different from correcting an already recorded quantity balance.
- Only Administrator may correct an existing quantity balance.
- Seller and Mechanic are denied quantity-balance correction.
- An Administrator quantity correction requires a reason and must preserve the previous quantity, adjustment amount, resulting quantity, actor, timestamp, and additive history.
- A correction must never silently overwrite the previous balance.
- Inventory mode remains immutable: quantity stock cannot be converted into individually tracked inventory, and individually tracked inventory cannot be converted into quantity stock.

## Register an assembly as physically received

**Primary Actor:** Seller or Administrator

**Requirement References:** HIER-011, CAT-001, INV-001, INV-002, HIER-002, HIER-004, HIER-006, HIER-007, HIST-001, HIST-002

**Preconditions:**

- The physical assembly has arrived and does not already have an inventory baseline.
- The assembly category and its general expected-component list are available.

**Main Flow:**

1. The actor registers the assembly with its unique identity, category, condition, known identifiers, acquisition cost when known or estimated, category attributes, location, notes, photos, and other applicable information.
2. The system presents the assembly category's general expected-component list.
3. For this physical unit, the actor classifies every definition as `PRESENT`, `MISSING`, or `NOT_APPLICABLE`.
4. For each `PRESENT` component, the actor registers the real physical unit as an individually tracked inventory item with its own identity and available applicable information.
5. The system validates one-parent and no-cycle rules and establishes each present component's initial parent relationship directly to the received assembly.
6. Each `MISSING` result creates a `MISSING_AT_RECEIPT` Known Missing Component without a fake inventory item. Each `NOT_APPLICABLE` result creates neither inventory nor missing knowledge.
7. The system derives initial completeness: zero unresolved Known Missing Components means `Complete`; one or more means `Incomplete`.
8. The assembly, children, checklist results, relationships, completeness, actor, timestamp, and receipt-baseline provenance commit atomically.

**State Result Examples:**

- `MOT-001` is `Complete` with `ALT-004`, `TUR-009`, and `ARR-002` installed when all applicable expected components are present.
- `MOT-002` is `Incomplete` with its real present children installed and `Turbo` recorded as a `MISSING_AT_RECEIPT` Known Missing Component when no physical turbo arrived.
- A general `Turbo` definition marked `NOT_APPLICABLE` for a concrete engine creates no inventory item, no Known Missing Component, and no completeness effect.

**Important Rules:**

- This flow creates no Mechanic Work Order and requires no `BEFORE`/`AFTER` evidence because it records observed receipt reality rather than company-performed installation.
- An Expected Component Definition and the `MISSING_AT_RECEIPT` Known Missing Component created from its `MISSING` result are related but distinct concepts; neither absence nor definition is an inventory unit.
- The actor never selects `Complete` or `Incomplete`; the system derives the result from unresolved Known Missing Components.
- The flow cannot be reused or reopened to represent later physical changes. Every later removal uses an `Orden de Desarme`; every later installation uses an `Orden de Instalación`.

**Conflicts:** Reject an already-baselined assembly, duplicate item identity, second current parent, cycle, invalid checklist result, or partial commit.

## Administrator corrects an initial receipt baseline error

**Primary Actor:** Administrator

**Requirement References:** INV-006, HIER-002, HIER-004, HIER-005, HIER-006, HIER-011, HIST-001, HIST-002, HIST-003, ADMIN-001

**Preconditions:**

- The business has verified that the original HIER-011 registration contains a data-entry or observation error.
- The requested correction describes physical reality at receipt, not a later removal or installation.
- The original baseline and applicable later business and physical history are available for validation.

**Main Flow:**

1. Administrator selects the protected `Correct initial receipt baseline` operation and supplies an explicit reason.
2. The system shows the original baseline state and the proposed corrected state.
3. The system validates inventory identities, one current parent, no cycles, no contradictory duplicate relationship, corrected checklist/missing facts, and dependencies on later immutable events.
4. If safe, the system atomically updates the applicable current baseline-derived facts and direct-parent completeness while appending actor, timestamp, reason, before state, and corrected state.
5. The original baseline event and the correction event remain visible together.

**Important Rules:**

- Seller and Mechanic are denied.
- The correction does not reopen or rerun HIER-011, create a fake physical Work Order, waive evidence, or become a general hierarchy editor.
- Completed invoices, immutable assembly-sale snapshots, completed Work Orders, evidence, payment/refund history, and later physical relationship history are never silently rewritten.
- If the proposed correction would contradict later immutable history, the issue is surfaced for protected administrative reconciliation and is not silently applied. This documentation does not define a reconciliation engine.

**Final Result:** Bad receipt data is corrected without rewriting real history. Applicable direct-parent completeness reflects the corrected baseline understanding; higher ancestors do not cascade.

## Search inventory

**Primary Actor:** Seller or Administrator

**Main Flow:**

1. The actor searches by practical identifiers or descriptions.
2. Results show Commercial State and Physical Relationship in separate fields.
3. An installed result identifies its current parent and effective location inherited from its root.
4. Protected descendants remain discoverable but clearly indicate that separate sale and Desarme are blocked by `No desarmar`.
5. Sold items are excluded from normal available results but remain available through history or an explicit historical filter.

**Final Result:** `Available + Installed`, `Available + Independent`, and eligible quantity stock can be understood without flattening their distinct states.

## Maintain a Draft and reservations

**Primary Actor:** Seller or Administrator

**Main Flow:**

1. The actor creates a Draft, selects exactly one currency (`DOP` or `USD`), and selects or creates a customer; eligible nonfiscal sales may use `Cliente Contado`.
2. The actor adds individual inventory, quantity products, generic merchandise, external resale, mechanical service, or delivery lines.
3. An individual or quantity-backed line atomically creates its matching reservation.
4. Removing a line atomically releases its reservation.
5. Discarding the Draft closes it and atomically releases all its reservations.
6. Seller or Administrator may correct the Draft currency normally before confirmation; every line and amount is then entered in the selected currency.

**State Result:**

- Invoice State remains `Draft`.
- Reserved individual items remain commercially `Available`; reserved quantity remains physically on hand.
- Physical Relationship and Payment State are unchanged by reservation.
- The Draft remains open indefinitely until an eligible business action occurs; there is no automatic expiry or scheduled release.

**Conflicts:** Parent/descendant overlap, duplicate lines, sold items, and insufficient quantity are rejected. Competing reservations allow only one valid result.

## Administrator releases an abandoned reservation

**Primary Actor:** Administrator

**Preconditions:**

- A reservation is stuck, orphaned, or tied to an abandoned Draft.
- At least six hours have elapsed since the Draft's `createdAt`; younger Drafts remain active and cannot be released through recovery.
- The Administrator has inspected its owner, Draft, inventory effects, and current operation.

**Main Flow:**

1. The Administrator selects the named `Release abandoned reservation` recovery operation and supplies a reason.
2. The system revalidates the six-hour threshold, confirms that no sale confirmation is committing, and identifies every reservation owned by the affected Draft or line.
3. In one transaction, the system releases the eligible reservation, updates or closes the abandoned Draft as appropriate, and records before/after state, actor, reason, and time.

**State Result:** Inventory becomes reservable again; Commercial State, Physical Relationship, Payment State, and completed sales remain unchanged.

**Conflicts:** Reject Drafts younger than six hours. Do not release a reservation consumed by a completed sale, split a parent/descendant reservation set, or expose a raw status editor. Reaching six hours does not trigger automatic release.

## Sell an independent item

**Primary Actor:** Seller or Administrator

**Main Flow:**

1. The actor reviews the reserved item, customer, final negotiated price, taxes, and Payment State expected at confirmation.
2. Confirmation revalidates the Draft and reservation.
3. Atomically, the invoice becomes `Completed`, receives the next shared internal number such as `FAC-000101`, the item changes `Available → Sold`, the reservation is consumed, same-currency initial payments are appended, and history is recorded. If the customer is `Cliente contado`, confirmation is rejected unless that initial payment equals the invoice total.
4. Profitability is derived after that commercial transaction. A `DOP` invoice subtracts the stored `DOP` cost directly. A `USD` invoice converts the stored `DOP` cost with `exchangeRateDopPerUsd` and preserves the normalized rate and its provenance; if the rate cannot be obtained, the confirmation above still stands and profitability becomes `UNAVAILABLE / PENDING FX RATE`.

**State Result:** Physical Relationship stays `Independent`. Payment State may be `Unpaid`, `Partially Paid`, or `Paid`; all are valid with `Sold`. A pending profitability result does not change any of these states.

## Sell an installed piece

**Primary Actor:** Seller or Administrator

**Preconditions:**

- The piece is `Available + Installed` and reserved by this Draft.
- Its current parent and applicable protected ancestors match the reviewed hierarchy.
- No ancestor in the path is protected by `No desarmar`.

**Main Flow:**

1. The actor reviews the piece, its current parent, final negotiated price, and notice that physical Desarme will remain pending after sale.
2. The server atomically validates the Draft, reservation, Commercial State, current relationship, hierarchy, and `No desarmar`.
3. The system confirms the invoice, assigns the next shared `FAC-` number, consumes the reservation, changes the piece to `Sold`, creates or reuses the appropriate active `Orden de Desarme`, and writes linked history.
4. The sale returns successfully without claiming that physical work is finished.

**Immediate State Result:**

- Invoice State: `Draft → Completed`.
- Commercial State: `Available → Sold`.
- Physical Relationship: remains `Installed`.
- Work-Order State: `Pending`, unless a matching active order is reused.
- Direct-parent completeness: unchanged.
- Payment State: independently `Unpaid`, `Partially Paid`, or `Paid`.

**Conflicts:** Any stale reservation, hierarchy, restriction, or duplicate-operation conflict aborts confirmation. The sale must not close the relationship or make the parent Incomplete.

## Automatically create or reuse an `Orden de Desarme`

**Trigger:** Confirmation of an installed-piece sale

**Main Flow:**

1. In the same transaction as confirmation, the system looks for an active order that already represents Desarme of the same physical piece from the same current parent.
2. If none exists, it creates one unassigned `Pending` `Orden de Desarme`.
3. If an appropriate `Pending` or `In Progress` order exists, the system reuses it.
4. The invoice and Work Order are linked additively; prior invoice, assignment, status, evidence, notes, and history are not overwritten.

**Final Result:** Exactly one active physical operation represents the required Desarme, including a resale after cancellation when Desarme continued.

**Conflicts:** A different parent, opposite physical operation, completed operation, or incompatible active order is not silently reused.

## Mechanic atomically takes a Pending order

**Primary Actor:** Mechanic

**Preconditions:** The order is `Pending` and unassigned.

**Main Flow:**

1. All Mechanics may see the restricted Pending-order summary.
2. A Mechanic chooses `Take order`.
3. Atomically, the server verifies `Pending + unassigned`, assigns that Mechanic, changes state to `In Progress`, and records history.

**Final Result:** Exactly one Mechanic owns the active order.

**Conflicts:** Concurrent claims permit one success. Every later claimant receives the current assignment without any partial assignment or duplicate active order.

## Mechanic completes an `Orden de Desarme`

**Primary Actor:** Assigned Mechanic

**Preconditions:**

- The order is `In Progress` and assigned to the acting Mechanic.
- The piece remains Installed in the order's source parent.
- At least one valid `BEFORE` and one valid `AFTER` photo are attached.
- Current hierarchy and `No desarmar` permit completion.

**Main Flow:**

1. The Mechanic reviews physical context, technical notes, and evidence only.
2. The system validates assignment, state, evidence, source relationship, and competing operations.
3. The Mechanic may enter the removed piece's new free-text location or leave it blank/pending.
4. Atomically, the system completes the order, closes and historizes the current relationship, makes the piece `Independent`, creates a `REMOVED_AFTER_BASELINE` Known Missing Component on the direct parent with the removed real item and Work Order provenance, applies the optional location, recalculates that parent as `Incomplete`, and records linked history.

**State Result:**

- Work-Order State: `In Progress → Completed`.
- Physical Relationship: `Installed → Independent`.
- Commercial State: unchanged (`Sold` stays Sold; `Available` stays Available).
- Direct parent: `Incomplete`.
- Higher ancestors: unchanged.
- Payment State and invoice contents: unchanged.

**Important Rule:** Optional location entry is limited to the assigned Mechanic during completion of this order. It is not required and does not grant general inventory-edit permission.

## Administrator creates a manual `Orden de Desarme`

**Primary Actor:** Administrator

**Preconditions:**

- The physical piece is currently Installed.
- No sale is required for this operation.
- `No desarmar` and duplicate-active-operation checks pass.

**Main Flow:**

1. The Administrator selects one piece, its source parent, context/location, and notes.
2. The system creates one unassigned `Pending` `Orden de Desarme` and records history.
3. A Mechanic takes and completes it through the normal evidence workflow.

**Final Result after completion:** The piece is `Available + Independent` unless another Commercial State already applies; only its direct parent becomes Incomplete.

**Important Rule:** Creation does not change Physical Relationship or completeness.

## Administrator creates an `Orden de Instalación`

**Primary Actor:** Administrator

**Preconditions:**

- One eligible piece and one destination parent are selected.
- The proposed relationship would not create a second current parent, self-parenting, or a cycle.
- No incompatible active physical operation exists.

**Main Flow:**

1. The Administrator selects an eligible independent real piece and destination parent from the applicable list, then supplies relevant context/location and notes.
2. The system creates one unassigned `Pending` `Orden de Instalación`.
3. The hierarchy remains unchanged until assigned Mechanic completion.

**State Result:** Work-Order State becomes `Pending`; Commercial State, Physical Relationship, parent completeness, and Payment State remain unchanged.

## Mechanic completes an `Orden de Instalación`

**Primary Actor:** Assigned Mechanic

**Preconditions:**

- The order is `In Progress` and assigned to the acting Mechanic.
- At least one valid `BEFORE` and one valid `AFTER` photo are attached.
- The piece remains eligible and the destination hierarchy remains valid.

**Main Flow:**

1. The system validates assignment, order state, evidence, piece state, destination, one-parent constraint, and cycle prevention.
2. Atomically, the system creates the current relationship, changes the piece to `Installed`, resolves a compatible unresolved Known Missing Component from `MISSING_AT_RECEIPT` or `REMOVED_AFTER_BASELINE` when applicable, recalculates the direct parent, completes the order, and writes history.

**State Result:**

- Physical Relationship: `Independent → Installed`.
- Commercial State: unchanged.
- Work-Order State: `In Progress → Completed`.
- Higher-ancestor completeness and Payment State: unchanged.

## Recalculate direct-parent completeness

**Triggers:** Initial received-assembly baseline registration, successful Dismantling Work Order completion, or successful Installation Work Order completion.

**Main Flow:**

1. Initial registration creates `MISSING_AT_RECEIPT` only for definitions classified `MISSING`; `NOT_APPLICABLE` creates no condition. Dismantling creates `REMOVED_AFTER_BASELINE` for any removed registered child; installation may resolve a compatible condition from either origin.
2. The system evaluates all currently unresolved Known Missing Components for the direct parent.
3. If none remain missing, the direct parent becomes `Complete`.
4. If one or more remain missing, the direct parent is or remains `Incomplete`.
5. The calculation and supporting history commit with the baseline registration or Work-Order completion that triggered it.

**Final Result:** Reinstalling one of several missing pieces does not incorrectly mark the parent Complete. No completeness change cascades upward, and engine testing is not part of the calculation.

## Enforce `No desarmar`

**Primary Actor for apply/remove:** Administrator

**Blocked descendant flow:**

1. An Administrator marks a root `No desarmar`.
2. The restriction covers the root's entire descendant subtree.
3. Search still shows descendants but identifies the protected root.
4. Separate descendant reservation/sale confirmation, manual Desarme creation, and Desarme completion are rejected without state changes.
5. Seller, Mechanic, and direct requests cannot bypass the rule.

**Protected-root complete-sale flow:**

1. The Seller or Administrator selects the protected root as one complete assembly line.
2. The system allows the root sale because the operation does not break the protected hierarchy apart.
3. Confirmation follows the complete-assembly flow and includes every current descendant.

**Final Result:** `No desarmar` means “do not break this item apart,” not “do not sell this complete item.”

## Sell a complete assembly and preserve its snapshot

**Primary Actor:** Seller or Administrator

**Preconditions:**

- The Draft reserves the tracked root and the complete, non-overlapping set of current descendants.
- The actor has reviewed the exact delivered tree.
- No `Pending` or `In Progress` Dismantling or Installation Work Order can change the selected root, a current descendant, or an item being installed into the selected assembly/subtree.

**Main Flow:**

1. The system shows every included current descendant and prevents any descendant from also appearing as an independent line.
2. If a piece will not be delivered, it must first be removed through a completed `Orden de Desarme`; it is not silently excluded at confirmation.
3. Confirmation checks for active physical Work Orders that could change the delivered hierarchy. If one exists, it rejects the sale with a clear business conflict such as `Cannot complete this assembly sale while physical work affecting its structure is active.` It never cancels the order or excludes a component automatically.
4. After all relevant physical work is completed, cancelled, or otherwise resolved through its valid workflow, the system rereads the current hierarchy and re-reserves or revalidates the exact resulting tree as necessary.
5. Atomically, the invoice becomes Completed, reservations are consumed, and the root and every included descendant become Sold.
6. The sale stores an immutable snapshot of the exact delivered hierarchy, identities, and relevant sale-line context.

**State Result:**

- Commercial State of all included nodes: `Sold`.
- Delivered hierarchy snapshot: immutable and independent of later inventory edits.
- Payment State: independent.
- The internal lifecycle of current relationship records is an architecture choice, but it may not change the exact snapshot or leave any included descendant separately Available.

**Conflicts:** Reject confirmation while relevant `Pending` or `In Progress` physical work makes the delivered subtree uncertain. Do not sell a stale snapshot; after resolution, repeat hierarchy and reservation validation against the current tree.

## Maintain invoice lines, taxes, payments, and output

**Primary Actor:** Seller or Administrator

**Supported line behavior:**

- Individually tracked, quantity, external-resale, and generic-merchandise lines use the final negotiated price, which includes fixed 18% ITBIS for taxable lines. The system derives taxable base and included ITBIS.
- Mechanical service is selected from the Administrator-maintained service catalog and receives a final negotiated price; no fixed catalog price is required. Service and delivery/shipping lines are non-taxable.
- If delivery is absent, no delivery line is required. Provided no-charge delivery uses numeric amount `0`, never textual `N/A`; charged delivery uses a positive numeric amount.
- External-resale and generic lines do not silently consume local inventory.
- Where acquisition cost applies, it is always stored in DOP. Unknown applicable cost yields unknown gross profit. Seller may view cost; only Administrator may view profit, margin, or profitability.
- All invoice monetary values are represented and displayed to two decimal places. Each line's monetary results, including the derived taxable base and included ITBIS, are rounded to two decimals for that line, and invoice totals are then calculated from those already rounded line values rather than from a single rounding at the final total.

**Profitability:**

1. A `DOP` invoice subtracts the stored `DOP` cost from the `DOP` selling price, for example `DOP 18,000.00` minus `DOP 12,300.00` giving `DOP 5,700.00`. No exchange rate is involved.
2. A `USD` invoice keeps prices, payments, balance, and refunds in `USD` and the stored cost in `DOP`. The system obtains an applicable rate, normalizes it to `exchangeRateDopPerUsd`, derives `costUsd = storedCostDop / exchangeRateDopPerUsd`, and subtracts that basis from the `USD` selling price.
3. A successful `USD` calculation preserves the normalized rate value, provider or source, relevant rate date/time, and the time the rate was obtained and the calculation completed. A completed result does not silently change when live rates move.
4. If the rate cannot be obtained, the sale is unaffected and the profitability result is `UNAVAILABLE / PENDING FX RATE` with a reason such as `Exchange rate unavailable for USD profitability calculation.`
5. The stored `DOP` acquisition cost is never modified by any profitability calculation.

**Payment flow:**

1. Confirmation may append no payment, a partial payment, one full payment, or multiple method records, all in the invoice currency.
2. Later receipts append records and recalculate balance.
3. Original payment records are never overwritten.
4. Commercial State remains Sold regardless of `Unpaid`, `Partially Paid`, or `Paid`.

**Invoice output:** A valid completed invoice shows its `FAC-` internal number, one currency, and two-decimal amounts, and produces an internal printable PDF with `NCF: ______________________` intentionally blank. There is no DGII, NCF generation, validation, or assignment workflow.

## Administrator corrects a Completed invoice currency with no payments

**Primary Actor:** Administrator

**Preconditions:** The invoice is `Completed`, its currency was selected incorrectly, and it has no payment records.

**Main Flow:**

1. Administrator selects the protected currency-correction operation and supplies an explicit reason.
2. The system confirms that no payment exists and shows the before and corrected currency.
3. The correction commits with actor, timestamp, reason, before value, corrected value, and preserved history.
4. Profitability is then re-derived under the corrected currency. `DOP → USD` uses the normal `USD` profitability flow above and, when the required rate cannot be obtained, the committed correction still stands while profitability becomes `UNAVAILABLE / PENDING FX RATE`. `USD → DOP` computes gross profit directly in `DOP` with no provider involved.

**Final Result:** The invoice remains `Completed` with its original internal number and an auditable currency correction that preserves both the previous and corrected currency. The stored acquisition cost stays in `DOP`, no operational amount is converted, no profitability value remains expressed under the obsolete currency, and the sale and inventory transaction are not rerun.

## Reject direct currency change after payment

**Primary Actor:** Administrator

**Preconditions:** A `Completed` invoice has one or more payments.

**Main Flow:**

1. Administrator requests a currency change.
2. The system detects payment history and rejects direct editing without changing invoice, payments, balance, or history.
3. Administrator must use the applicable cancellation/reversal flow and issue the transaction correctly.

**Final Result:** Paid amount, balance, refund values, profitability snapshots, and invoice history retain one coherent currency.

## Cancel an invoice with a Pending linked `Orden de Desarme`

**Primary Actor:** Administrator

**Preconditions:** The invoice is Completed; its linked sale-triggered order is Pending; a reason and any applicable refund are supplied.

**Main Flow:**

1. The Administrator previews commercial, payment, physical, and Work-Order effects separately.
2. The system revalidates invoice, payments, order, reservation history, and current relationship.
3. Atomically, the invoice becomes Cancelled, eligible Commercial State is restored `Sold → Available`, the Pending order becomes Cancelled, applicable refund records are appended, and history is written.

**Final Result:** The piece is `Available + Installed`; parent completeness is unchanged; no physical relationship was falsely closed.

## Cancel an invoice while linked Desarme is In Progress — stop work

**Primary Actor:** Administrator, coordinated with the assigned Mechanic

**Preconditions:**

- The assigned Mechanic and Administrator physically verify that the piece can remain Installed.
- The Administrator chooses `Stop/cancel physical Desarme` and supplies a reason.

**Main Flow:**

1. The system revalidates the invoice, assignment, order state, evidence/context, and current relationship.
2. Atomically, it cancels the invoice, restores eligible Commercial State, cancels the Work Order, appends any actual refund, and records the verification and reason.

**Final Result:** The piece is `Available + Installed`; the direct parent completeness is unchanged; assignment and cancelled-work history remain visible.

## Cancel an invoice while linked Desarme is In Progress — continue work

**Primary Actor:** Administrator, coordinated with the assigned Mechanic

**Preconditions:** The Administrator explicitly chooses `Continue physical Desarme` and supplies a reason.

**Main Flow:**

1. The invoice is cancelled and eligible Commercial State is restored.
2. Any actual refund is appended.
3. The In-Progress Work Order, assignment, evidence, and physical relationship remain active.
4. The assigned Mechanic may complete the same order normally.

**Interim State:** `Available + Installed + In Progress`.

**Final Result after completion:** `Available + Independent`; the direct parent becomes Incomplete. Invoice cancellation does not erase or complete physical work.

## Resell while active Desarme continues

**Primary Actor:** Seller or Administrator

**Preconditions:** A prior invoice was cancelled with Desarme continuing, leaving `Available + Installed` and an appropriate active order.

**Main Flow:**

1. A new Draft reserves the piece normally.
2. Confirmation validates the active physical operation and marks the piece Sold.
3. The system links the new sale to and reuses the existing active `Orden de Desarme`.
4. Existing assignment, evidence, notes, and history are preserved; no duplicate order is created.

**Final Result:** The piece is `Sold + Installed` until that reused order completes, then `Sold + Independent`.

## Cancel after Desarme was Completed

**Primary Actor:** Administrator

**Main Flow:**

1. The Administrator cancels the invoice, supplies a reason, and records any applicable refund.
2. Eligible Commercial State changes `Sold → Available`.
3. The completed `Orden de Desarme`, evidence, and closed relationship remain immutable.
4. The piece remains Independent and the direct parent remains Incomplete.
5. Any physical return to the parent requires a new `Orden de Instalación`.

**Final Result:** `Available + Independent`; commercial reversal does not pretend that physical reinstallation occurred.

## Cancel a Pending manual Work Order

**Primary Actor:** Administrator

**Preconditions:** A manual `Orden de Desarme` or `Orden de Instalación` is Pending and unassigned.

**Main Flow:**

1. The Administrator selects the named cancel operation and supplies a reason.
2. The system changes `Pending → Cancelled` and records actor, reason, time, context, and before/after state.

**Final Result:** Commercial State, Physical Relationship, parent completeness, invoice, and Payment State remain unchanged.

## Resolve an In-Progress manual Work Order

**Primary Actor:** Administrator, coordinated with the assigned Mechanic

**Main Flow:**

1. The Administrator inspects assignment, physical state, evidence, notes, and the reason work is stuck.
2. If the physical action has not occurred and the item can safely remain in its current relationship, the Administrator cancels the order with explicit physical verification and reason.
3. If work should continue, the Administrator leaves it active, releases it for a new claim, or reassigns it through the authorized recovery flow.
4. If the physical action has occurred, the assigned or reassigned Mechanic supplies mandatory evidence and completes the normal workflow.

**Prohibitions:** Administrator may not use a status selector to mark the order Completed, skip evidence, or invent a hierarchy result.

## Reverse completed physical work

**Primary Actor:** Administrator creates the new order; assigned Mechanic completes it

**Main Flow:**

1. A Completed Work Order remains Completed with its evidence and history.
2. To reverse completed Desarme, the Administrator creates an `Orden de Instalación`.
3. To reverse completed installation, the Administrator creates an `Orden de Desarme`.
4. The opposite order follows normal claim, evidence, validation, completion, relationship, and completeness rules.

**Final Result:** Both physical actions remain auditable; no completed action is cancelled or erased.

## Administrator releases an abandoned Work-Order assignment

**Primary Actor:** Administrator

**Preconditions:** The assigned Mechanic cannot continue and physical state has been inspected.

**Main Flow:**

1. The Administrator selects `Release assignment`, provides a reason, and records the verified physical context.
2. The system atomically removes the assignment and returns the eligible order to Pending for a new atomic claim.
3. Prior assignment, evidence, notes, actor, reason, and time remain in history.

**Conflicts:** Release must serialize against Mechanic evidence or completion. It does not change hierarchy or mark work Completed.

## Administrator reassigns a stuck Work Order

**Primary Actor:** Administrator

**Main Flow:**

1. The Administrator inspects the current order and chooses a replacement Mechanic with a reason.
2. The system atomically verifies that the order remains eligible, replaces the active assignment, preserves existing evidence and notes, and records old/new assignee, actor, reason, and time.
3. Only the replacement Mechanic may perform subsequent active-order actions.

**Conflicts:** Reassignment loses a race to a valid completion or other recovery action rather than overwriting it.

## Regenerate an invoice PDF

**Primary Actor:** Administrator

**Preconditions:** The sale is valid and its PDF is missing, failed, or needs deterministic regeneration from preserved invoice data.

**Main Flow:**

1. The Administrator selects `Regenerate invoice PDF`.
2. The system reads the immutable invoice/customer/line/tax/payment snapshot and generates output without rerunning sale confirmation.
3. It records regeneration outcome, actor, time, and useful error context.

**State Result:** Invoice, Commercial State, Physical Relationship, Work-Order State, reservations, Payment State, and history of the sale remain unchanged. A PDF failure never rolls back or duplicates a valid sale.

## Complete a pending USD profitability calculation

**Primary Actor:** Administrator

**Preconditions:** A valid `Completed` `USD` invoice has profitability `UNAVAILABLE / PENDING FX RATE` because the exchange rate could not be obtained when it was confirmed or when its currency was corrected.

**Main Flow:**

1. The Administrator inspects unresolved profitability results and requests the retry for the affected invoice.
2. The system obtains the applicable rate, normalizes it to `exchangeRateDopPerUsd`, derives `costUsd = storedCostDop / exchangeRateDopPerUsd`, and calculates gross profit in `USD`.
3. It preserves the result together with the normalized rate value, provider or source, relevant rate date/time, and the time the rate was obtained and the calculation completed.
4. If the rate is still unavailable, the result remains pending with its reason and the retry may be attempted again later.

**State Result:** Invoice State, internal number, Commercial State, inventory, Payment State, balance, refunds, and the PDF are all unchanged; the sale is never rerun and inventory is never sold a second time. The stored acquisition cost remains `DOP`. The recovery must not present an unrelated later live rate as though it had been the sale-time rate, and a profitability result already completed with its own rate is not recalculated because live rates moved.


## Cancellation and refund baseline

- Only Administrator may cancel a Completed invoice and register a cancellation refund.
- Cancellation records reason, actor, and time without editing or deleting the original invoice.
- Payments and refunds are additive. Refunds represent money actually returned and do not erase receipts.
- Cancellation restores eligible Commercial State exactly once and does not recreate reservations.
- The linked Work-Order branch must be selected from the Pending, In-Progress stop, In-Progress continue, or already-Completed flows above.

## Consistency outcomes required across flows

The planned system must detect and make recoverable: negative quantity stock, stuck or orphan reservations, multiple current parents, hierarchy cycles, duplicate active physical operations, impossible invoice/payment balances, unresolved `UNAVAILABLE / PENDING FX RATE` profitability results, and inconsistent critical state. Diagnostics and recovery are named domain operations, never raw database editing or arbitrary state selection.
