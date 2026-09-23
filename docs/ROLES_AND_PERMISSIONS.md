# Roles and Permissions

## Purpose and authority

This document defines the authorization baseline for the confirmed MVP. Detailed feature behavior and stable requirement IDs now live in `FEATURES/*.md`. If a permission statement here conflicts with a confirmed feature specification, update this matrix to match the feature rule; do not invent a new permission.

> **Accounts Payable:** no role has Accounts Payable permissions yet. `FEATURES/15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md` must be validated and this matrix updated before any CxP action is enabled in production.

The only application roles are:

- **Administrator**
- **Seller**
- **Mechanic**

`Employee/Seller` is obsolete as a combined role label. The Mechanic is a distinct, highly restricted, mobile-first role.

Permission statuses have only these meanings:

- `ALLOW`: the role may perform the action when the record and workflow are otherwise eligible.
- `DENY`: the role may not perform the action.
- `PENDING`: the business has not supplied enough information to authorize or deny the action safely.

`ALLOW` never bypasses state, reservation, hierarchy, evidence, assignment, or concurrency rules. Seller or Administrator may record the initial observed composition of a newly received assembly as a controlled receipt baseline. After that baseline exists, physical dismantling and installation are represented through Work Orders, never by directly editing hierarchy.

## Permission matrix

| Area | Action | Administrator | Seller | Mechanic | Requirement references and limits |
|---|---|---:|---:|---:|---|
| Access | Log in with an active individual account | ALLOW | ALLOW | ALLOW | AUTH-001, AUTH-004. Inactive accounts are denied regardless of role. |
| Inventory | Search and view operational inventory | ALLOW | ALLOW | DENY | SEARCH-001..003. A Mechanic sees only the piece and physical context exposed through a permitted Work Order. |
| Inventory | Register inventory and edit ordinary descriptive, category, photo, and free-location data | ALLOW | ALLOW | DENY | INV-001..005, QTY-001..003, CAT-001..003, LOC-001..002, PHOTO-001 |
| Quantity Stock | Record eligible normal quantity-stock receipts / entries | ALLOW | ALLOW | DENY | QTY-001..003. This is an ordinary recorded stock operation and does not authorize correction of an already recorded balance. |
| Quantity Stock | Correct an existing quantity balance through an audited stock adjustment | ALLOW | DENY | DENY | QTY-001, HIST-001..003, ADMIN-001. Administrator-only protected correction requiring previous quantity, adjustment/difference, resulting quantity, actor, timestamp, reason, and additive history. |
| Inventory | Perform a protected identity, state, or audit correction | ALLOW | DENY | DENY | INV-006, HIST-001..003, ADMIN-001. Requires a named operation, reason, and additive history. |
| Hierarchy | Correct a verified error in the initial receipt baseline | ALLOW | DENY | DENY | INV-006, HIER-004..006, HIER-011, HIST-003, ADMIN-001. Protected audited operation with reason, actor, timestamp, before/corrected states, preserved original event, and immutable-later-history validation; it does not reopen HIER-011 or replace a Work Order. |
| Hierarchy | Register the initial observed composition of a newly received assembly | ALLOW | ALLOW | DENY | HIER-011, HIER-001..007, CAT-001. This one-time receipt baseline records `PRESENT`, `MISSING`, and `NOT_APPLICABLE` results, real present items, applicable missing conditions, derived completeness, actor, timestamp, and provenance without a Work Order or evidence. |
| Hierarchy | Directly edit hierarchy to represent physical dismantling or installation | DENY | DENY | DENY | Superseded physical workflow. Dismantling and installation after the initial baseline require a Work Order and update hierarchy only on valid completion; initial receipt registration is the separate HIER-011 operation above. |
| Catalogs | Maintain inventory category definitions and controlled options | ALLOW | DENY | DENY | CAT-001..003, ADMIN-001. Catalog definitions do not create physical inventory. |
| Catalogs | Maintain expected-component definitions for assembly categories | ALLOW | DENY | DENY | CAT-001, HIER-006, HIER-011, ADMIN-001. The list is general per assembly category; applicability is reviewed per received unit. Adding a definition backfills unsold assemblies with a provisional NA pending Administrator confirm or missing. |
| Catalogs | Maintain the mechanical service catalog | ALLOW | DENY | DENY | LINE-004, ADMIN-001. Catalog entries identify service type but do not impose a fixed price. |
| Cost | View acquisition cost on ordinary billing drafts/invoices | DENY | DENY | DENY | COST-001, COST-004, COST-006. Billing projections omit cost for both roles. Inventory-sourced cost remains a later release. |
| Cost | Correct protected acquisition cost through the audited operation | ALLOW | DENY | DENY | INV-005..006, COST-001, HIST-003. Requires reason, actor, timestamp, before/corrected values, and preserved history. |
| Profit | View gross profit, margins, or profitability statistics | ALLOW | DENY | DENY | COST-002..005. This includes item-, line-, sale-, and aggregate-level profitability, pending `UNAVAILABLE / PENDING FX RATE` results, preserved rate provenance, and Administrator-recorded DOP gross profit when calculation is unavailable. |
| Profit | Record judged gross profit when calculation is unavailable | ALLOW | DENY | DENY | COST-005, COST-006. Does not rewrite invoice money, payments, or stored acquisition cost. |
| Assistant | Open the global assistant panel and list/create/delete own conversations | ALLOW | DENY | DENY | AI-001, AI-005. Server-side Administrator check is mandatory; capability `assistant` may additionally hide the launcher when disabled. |
| Assistant | Ask the assistant (RAG + read-only commercial tools) and receive streamed answers with sources | ALLOW | DENY | DENY | AI-001–AI-004, AI-006–AI-009. No commercial write tools. Forbidden identity/contact fields must not be sent to the provider. |
| Customers | Search, register, or edit ordinary `CASH` customer data | ALLOW | ALLOW | DENY | CUST-001..003, CUST-004. Completed invoices retain their customer snapshot. Seller create is `CASH` only. |
| Customers | Create or edit `CREDIT` customers, credit limit, or credit term | ALLOW | DENY | DENY | CUST-004, CUST-005, CUST-006. Direct Seller HTTP is 403. Open-balance `CREDIT` cannot become `CASH`. |
| Drafts | Create or edit a Draft invoice, including selecting or correcting its DOP/USD currency and `Aplicar ITBIS` | ALLOW | ALLOW | DENY | RES-001..003, SALE-001..003, SALE-009. A Draft does not expire automatically. |
| Quotes | Create, edit (`QUOTE_DRAFT`), issue, duplicate, or convert a quote | ALLOW | ALLOW | DENY | QUOTE-001, QUOTE-002, CON-001. Conversion to invoice uses confirmation authorization; conversion to conduce (Feature 16, not started) uses CON-002. Expired quotes cannot convert. |
| Reservations | Reserve eligible stock through a Draft, release a line, or discard the Draft | ALLOW | ALLOW | DENY | RES-001..003. Administrative release of another user's abandoned reservation is operational recovery. |
| Sales | Enter negotiated final prices and confirm eligible cash sales | ALLOW | ALLOW | DENY | COST-002, SALE-001..008, SALE-010, LINE-001..006. Direct cash confirmation must settle the gross total (SALE-005). |
| Sales | Confirm an eligible DOP credit sale to an existing `CREDIT` customer | ALLOW | ALLOW | DENY | SALE-005, CUST-004, CUST-005. Seller confirms with zero initial payment. Limit cannot be exceeded, including by Administrator. |
| Sales | Record a partial initial payment while confirming a credit sale | ALLOW | DENY | DENY | SALE-005, PAY-001, CUST-005. Only the remaining balance counts toward the limit. |
| Sales | Issue a conduce from draft or convert quote → conduce | ALLOW | ALLOW | DENY | CON-001, CON-002. Seller payment matrix matches current invoice limits (full `CASH`/USD; zero initial on `CREDIT` DOP). |
| Sales | Leave balance on a **named** `CASH` conduce (DOP/USD) at emission | ALLOW | DENY | DENY | CON-002. Does **not** apply to default `Cliente contado`. Does **not** apply to direct invoice confirmation. Requires `dueDate` on or after local emission day when balance remains. |
| Sales | Convert conduce → invoice (`{ fiscal }`) | ALLOW | ALLOW | DENY | CON-003. Seller attribution stays with conduce issuer. |
| Sales | Correct a Completed invoice currency when it has no payments | ALLOW | DENY | DENY | INV-006, SALE-001, COST-003, HIST-003. Protected audited correction only; stored cost stays in `DOP` and profitability is re-derived under the corrected currency; direct correction is denied once any payment exists. |
| Payments | Record later, additional, partial, multiple, or mixed-method collections on a completed invoice or open conduce | ALLOW | DENY | DENY | PAY-001..007, CON-002. Seller cash confirmation / conduce full-pay is the Sales rows above, not this collection permission. |
| Payments | View payment movement history (amounts, dates, methods, references, actors) | ALLOW | DENY | DENY | PAY-005, PAY-007. Includes invoice detail `history` (`PAYMENT_RECORDED`). Seller invoice list/detail also omit derived payment state, paid amount, and outstanding balance. |
| Payments | View derived payment state, paid amount, or outstanding balance on the invoice list or detail | ALLOW | DENY | DENY | PAY-007. Administrator-only settlement projection. |
| Accounts Receivable | Open AR list, filters, and receivables endpoints | ALLOW | DENY | DENY | PAY-007, CON-006. Deep links and direct HTTP are denied for Seller. Planned document filters accept `CON-` and `FAC-`. |
| Accounts Receivable | Generate customer account-statement PDF | ALLOW | DENY | DENY | STMT-001. Selector is customers with open DOP balance. |
| Cancellation | Cancel a confirmed invoice or active conduce with a reason | ALLOW | DENY | DENY | CANCEL-001..005, CON-005. Original invoice/payment records and every linked physical-work branch remain preserved. |
| Refund | Register a cancellation refund (zero through net collected) | ALLOW | DENY | DENY | CANCEL-002, PAY-005, CON-005. This is part of the controlled cancellation flow, not a general standalone-refund permission. |
| Restriction | Apply `No desarmar` | ALLOW | DENY | DENY | HIER-008, ADMIN-001, validated 2026-08-20 decision. It protects the marked root's full descendant subtree. |
| Restriction | Remove `No desarmar` | ALLOW | DENY | DENY | HIER-009, ADMIN-001. Removing it does not itself dismantle or sell anything. |
| Work Orders | Trigger automatic Dismantling Work Order creation by confirming an installed-piece sale | ALLOW | ALLOW | DENY | SALE-006, WO-007. The system creates a new Pending order when none is appropriate or reuses an appropriate active Pending or In Progress order. |
| Work Orders | Create a manual Dismantling Work Order without a sale | ALLOW | DENY | DENY | WO-001, WO-006. One order handles one physical piece. |
| Work Orders | Create an Installation Work Order | ALLOW | DENY | DENY | WO-001, WO-006. Creation does not itself create the hierarchy relation. |
| Work Orders | View the Pending queue and permitted technical Work Order fields | ALLOW | DENY | ALLOW | WO-003, WO-004. Mechanics may see only Work Order ID/type/status, piece, relevant parent/source/destination, effective location, technical notes, assignment, and BEFORE/AFTER evidence. |
| Work Orders | Take a Pending order | DENY | DENY | ALLOW | The atomic transition assigns exactly one Mechanic and changes the order to In Progress. |
| Work Orders | View and modify an active order assigned to the acting Mechanic | DENY | DENY | ALLOW | Only the assigned Mechanic may act on an active order. Administrator inspection and recovery use separate protected operations. |
| Work Orders | Add required BEFORE/AFTER evidence and complete the assigned order | DENY | DENY | ALLOW | Completion requires at least one BEFORE and one AFTER photo and all workflow validations. During assigned Dismantling completion only, the Mechanic may optionally record the removed piece's new free-text location under LOC-002. |
| Work Orders | Cancel an eligible order, release it, or reassign it | ALLOW | DENY | DENY | WO-010, HIST-003, ADMIN-002. Recovery preserves actor, reason, timestamp, and history; Completed orders cannot be cancelled to erase history. |
| Sensitive data | View customer identity/contact data or commercial/financial details | ALLOW | ALLOW | DENY | Mechanic cannot see invoices, prices, acquisition cost, payments, balances, refunds, profit, margin, or other commercial data. |
| Recovery | Use Administration and Operational Recovery operations | ALLOW | DENY | DENY | ADMIN-002, COST-003, RES-003, WO-010, SALE-004, HIST-003. Includes eligible reservation release, Work Order recovery, failed-PDF regeneration, practical evidence-upload recovery, and retry of a pending `USD` profitability calculation; it is not a SQL console or domain-rule bypass. |
| Administration | Create, activate, deactivate, or assign supported roles to users | ALLOW | DENY | DENY | AUTH-002..004, ADMIN-001 |

## Important authorization rules

### Server-side enforcement

Every protected operation must check authentication, role, record state, assignment, reservation ownership or eligibility, and applicable hierarchy restrictions on the server when executed (AUTH-005). Hiding a button is not authorization.

The same enforcement applies to direct requests, retries, mobile and desktop clients, and concurrent actions. A stale screen must not allow a role to exceed stock, claim an already claimed order, act on another Mechanic's active order, expose protected information, or perform an action marked `PENDING`.

`PENDING` is disabled in production until the decision is recorded. It must not default to `ALLOW`.

### Administrator

The Administrator may perform normal Seller operations and alone manages users and the inventory-category, expected-component, and mechanical-service catalogs; classifies credit customers and their limits/terms; applies or removes `No desarmar`; creates standalone physical Work Orders; issues conduces and may leave balance on **named** `CASH` conduces per CON-002 (not on default `Cliente contado`, not on direct invoice confirmation); converts conduces to invoices; cancels confirmed invoices and conduces; records cancellation refunds (zero through net collected) and later collections; opens Accounts Receivable and account statements; performs protected corrections and operational recovery; views profitability; and, when Feature 17 is enabled, uses the hybrid AI assistant for approved documentary guidance and read-only commercial queries (`AI-001`–`AI-010`). Protected corrections include acquisition-cost correction, `Correct initial receipt baseline`, and completed-invoice currency correction when no payments exist. Administrator cannot confirm a sale that exceeds the customer credit limit.

Administrator status does not bypass transaction integrity or physical evidence. An Administrator may establish the initial observed receipt baseline under HIER-011 and later append an audited correction of verified receipt-recording error, but cannot reopen/rerun HIER-011, freely rebaseline an assembly, directly mark physical work Completed, erase completed Work Order history, rewrite later immutable events, directly edit hierarchy to imitate later physical work, or directly change completed-invoice currency after a payment exists. Ordinary or protected inventory/recovery capabilities may inspect or correct location without impersonating Mechanic completion.

### Seller

The Seller performs normal inventory, customer (`CASH` create/edit), Draft, quote, reservation, negotiated-price, cash-sale, eligible credit-sale, and (when Feature 16 is implemented) conduce issue/convert-to-invoice work using maintained catalogs, and may establish the initial observed composition of a newly received assembly under HIER-011. The Seller may confirm a DOP credit sale to a customer already classified `CREDIT` by an Administrator, with zero initial payment. Seller conduce payment limits match current invoice limits (full `CASH`/USD; zero initial on `CREDIT` DOP). The Seller cannot create or edit credit terms, open Accounts Receivable, record later collections, leave named-`CASH` conduce balance, view payment movements, payment state, paid amount, or outstanding balance on invoices, or see acquisition cost or profitability on billing. The Seller cannot use the AI assistant (AI-001). The Seller cannot maintain catalogs. Confirming the eligible sale of an installed item may create a new Pending Dismantling Work Order or reuse an appropriate active Pending or In Progress order; the Seller cannot correct an initial baseline or Completed invoice currency, create or complete a standalone physical Work Order, or directly change hierarchy after the receipt baseline.

### Mechanic

The Mechanic interface is minimal and mobile-first. A Mechanic may view the Pending queue, atomically take an order, and add evidence or complete only the active order assigned to that Mechanic. While completing an assigned Dismantling Work Order, the Mechanic may optionally enter that removed piece's new free-text location; location may remain blank.

Mechanic access is limited to the technical and physical fields required for the Work Order. This scoped location write does not grant general inventory or location editing, and the Mechanic cannot correct an initial baseline. Customer, invoice, price, cost, payment, refund, balance, profit, margin, and other commercial or financial data are always denied. The Mechanic cannot use the AI assistant (AI-001).

## Final permission status

No core role-permission decision remains open for MVP v1 scope freeze. `PENDING` remains defined only as a safe documentation status should a future undecided permission be introduced; no action in this matrix currently relies on it.
