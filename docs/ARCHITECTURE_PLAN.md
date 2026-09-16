# Architecture Plan

## Architectural Goals

The architecture should make the product's hardest rules explicit and testable while remaining practical for one developer to understand, deploy, and operate.

1. Keep inventory, hierarchy, sale, reservation, payment, and history consistent when one action affects all of them.
2. Represent uniquely tracked used parts and quantity-based stock without forcing either model to imitate the other.
3. Preserve provenance instead of overwriting business history.
4. Enforce permissions and financial visibility on the server.
5. Support a responsive Spanish-language web application without requiring separate desktop and mobile applications.
6. Prefer a small number of conventional technologies, clear module boundaries, and one deployment unit.
7. Leave final tables, HTTP endpoints, and implementation details to development after the business-scope freeze.
8. Separate commercial events from physical work: confirming a sale must not pretend that dismantling or installation has already occurred.
9. Give the Mechanic a mobile-first surface containing only the technical data needed to perform assigned physical work.
10. Make evidence, recovery, consistency diagnostics, and operational diagnosis first-class design concerns.
11. Distinguish Expected Component Definitions, Known Missing Components, real inventory items, observed receipt baselines, and later evidenced physical work without phantom inventory.

This proposal covers the MVP direction. It is not a final data model, API contract, or code design.

## Validated Architecture Baseline — 2026-08-20

Detailed confirmed business behavior now lives in the relevant `FEATURES/*.md` specification. Those feature specs preserve the stable requirement IDs and replace the former consolidated requirements/validation files. If this architecture plan conflicts with a confirmed feature rule, the feature rule wins and this plan must be updated.

- The three roles are **Administrator**, **Seller**, and **Mechanic**.
- Commercial availability, reservation, and physical relationship are separate concepts. An item can validly be Sold and still Installed while dismantling is pending.
- Administrator maintains small category, expected-component, and mechanical-service catalogs. Definitions are not physical inventory, and exact initial catalog content is operational configuration.
- Seller or Administrator may register a newly received assembly's **initial observed inventory baseline** directly. This receipt operation reviews the category's general expected-component list as `PRESENT`, `MISSING`, or `NOT_APPLICABLE`, links real present children, records `MISSING_AT_RECEIPT` only for applicable absences, derives completeness, and preserves actor/time/provenance without a Work Order or evidence.
- After the baseline exists, physical dismantling and installation always pass through a Mechanic Work Order. A Seller or Administrator cannot represent post-baseline physical work by directly editing hierarchy or by reopening the baseline.
- Administrator alone may append a protected correction when the original receipt baseline was recorded incorrectly and no physical change occurred. The correction preserves original and corrected provenance, cannot rerun HIER-011, and cannot silently rewrite later immutable events.
- A Work Order represents exactly one piece and has a type—Dismantling or Installation—plus a controlled lifecycle, assignment, technical context, and BEFORE/AFTER evidence. This is a module and type concept, not a final database schema.
- Creating an order does not change hierarchy. After baseline registration, only successful Work Order completion represents real physical relationship change; the separate protected correction may repair baseline-derived relationship facts and direct-parent completeness only when receipt reality was originally recorded incorrectly.
- A protected `No desarmar` root blocks separate sale or dismantling throughout its descendant subtree. Administrator alone may apply or remove the protection.
- A parent is Complete only when it has zero unresolved Known Missing Components, whether the origin is `MISSING_AT_RECEIPT` or `REMOVED_AFTER_BASELINE`. Completeness never cascades to higher ancestors and is independent of engine testing.
- Each invoice uses exactly one currency, `DOP` or `USD`; payments and refunds match it, and no operational invoice, payment, or refund currency conversion is supported. Acquisition cost is always stored in `DOP`. FX conversion is used only to derive the `USD`-equivalent acquisition cost for profitability on `USD` invoices. Each line's monetary results are rounded to two decimals, and invoice totals use those already rounded line values. Successful confirmation assigns one shared, never-reused `FAC-000001` sequence. An unavailable FX rate never blocks confirmation.
- Drafts have no automatic expiry. Administrator recovery may release an abandoned Draft/reservation through a named audited operation.
- A complete-assembly sale is rejected while relevant Pending or In Progress physical Work Orders could change its delivered subtree. After resolution, confirmation rereads the current tree and preserves an immutable snapshot of the exact hierarchy delivered.
- Critical transitions use short PostgreSQL transactions, constraints, conditional writes, and optimistic checks. No distributed locking, broker, workflow engine, event sourcing, or microservice boundary is needed.

## Phased Delivery Compatibility

The production delivery order in `DEVELOPMENT_PLAN.md` intentionally ships billing and basic Accounts Receivable before the full inventory/hierarchy/Work-Order surface. This does **not** change the final architecture or domain invariants. Early releases enable only the line types and workflows whose dependencies are complete; later inventory-backed and physical-work behaviors plug into the same modular-monolith boundaries without rewriting historical invoices.

Basic Accounts Receivable is a read/query concern over the existing Sales + Payments source of truth, not a second financial ledger. Basic Accounts Payable is currently `PENDING VALIDATION` in `FEATURES/15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md`; no supplier/payable module is authorized until that feature is confirmed.

## Recommended Architecture Style

### Choice: modular monolith

**What it is:** one backend application and one relational database, organized internally into business-focused modules with explicit dependencies. The frontend is a separate build artifact but is served under the same web origin in production.

**Why it fits this problem:** the defining operations cross several concerns. Selling an installed component must coordinate the invoice, unique item, active relationship, direct parent's completeness, reservation, and history. A single process and PostgreSQL transaction provide a clear consistency boundary.

**Why it fits one developer:** there is one backend to run, debug, test, migrate, deploy, and monitor. Feature modules still prevent the codebase from becoming one undifferentiated set of files.

**Simpler alternative:** a conventional Express application organized only by technical folders is initially faster, but sales and hierarchy rules would soon spread across unrelated controllers and utilities. That simplicity would be temporary.

**More sophisticated alternative:** microservices with messaging could isolate deployment and scaling, but would turn atomic inventory-sale changes into distributed consistency and failure-recovery problems. That is unnecessary operational and conceptual cost for the current team and workload.

**Tradeoff:** a modular monolith relies on code review and tests to preserve boundaries; the runtime does not enforce them. Modules should call each other's public services or defined application interfaces, not reach directly into another module's repositories.

## Frontend Direction

### Choice: React + TypeScript + Vite responsive SPA

**What:** a responsive single-page web application using React for interactive screens, TypeScript for shared developer understanding, and Vite for a small, fast development/build setup.

**Why:** inventory search, hierarchy navigation, sale drafts, validation feedback, and before/after state changes are interaction-heavy. One responsive SPA serves office computers and modern phones, avoiding a separate native application.

**Solo-developer fit:** this is a common, well-documented stack with a small core. The frontend can be organized by the same features as the backend and can consume one same-origin HTTP API.

**Alternatives considered:**

- Server-rendered templates would reduce frontend tooling, but complex sale state and hierarchy interaction would migrate into ad hoc browser code.
- Next.js or another full-stack React framework adds server-rendering and routing capabilities that are not currently needed for a private operational application.
- A native mobile app would improve device-specific integration but doubles delivery and support effort without a validated need.

**Tradeoff:** an SPA requires deliberate loading, error, stale-data, and accessibility states. It also creates a client build to version. These costs are justified by the operational interaction, but a large client state framework should not be added until local component state and targeted server-state caching prove insufficient.

Frontend responsibilities should be presentation, user interaction, local form state, and calling the API. It must not be the authority for permissions, prices, reservations, or inventory transitions.

### Mobile-first Mechanic surface

The Mechanic experience is a focused responsive surface optimized for phones, intermittent mobile interaction, large touch targets, camera capture, clear upload state, and retry-safe actions. It exposes only Work Order ID, type, status, piece, relevant source/destination parent, effective location, technical notes, assignment, and BEFORE/AFTER evidence.

Customer identity and contact data, invoice details, prices, acquisition cost, payments, balances, refunds, profit, margin, and all other commercial or financial data must be absent from Mechanic responses, not merely hidden by the interface. Administrator and Seller surfaces may be broader, but the server remains the permission authority.

## Backend Direction

### Recommended stack: Node.js + TypeScript + Express + PostgreSQL + Prisma

- **Node.js and TypeScript:** use one language across frontend and backend and make application contracts easier to understand. The workload is primarily request/response and database I/O, which fits Node well. TypeScript reduces accidental state and payload mistakes but does not replace runtime validation.
- **Express:** provides an intentionally small HTTP layer. It matches the required route → controller → service → repository flow and lets the project add only the middleware it needs. Its flexibility is also its risk, so module conventions and central middleware are required.
- **PostgreSQL:** is the system of record. Relational constraints, transactions, row-level concurrency controls, recursive querying, JSONB, and mature managed hosting all fit the hierarchy and sale consistency problem.
- **Prisma:** offers typed queries, migrations, and transactions while keeping most persistence code readable for one developer. Prisma access should stay in repositories or transaction-aware persistence helpers, never controllers.

**Simpler alternative:** SQLite would be easy locally, but its concurrency behavior and production migration path are a poor fit for simultaneous reservations, sales, and managed deployment.

**More structured alternative:** NestJS could enforce modules and dependency injection. It is reasonable for a larger team, but introduces framework concepts and ceremony that do not yet solve a demonstrated problem. Fastify could improve throughput, but expected workload does not justify optimizing the HTTP framework first.

**Tradeoffs:** Express does not impose architecture, Prisma cannot express every advanced PostgreSQL operation elegantly, and Node's single event loop is unsuitable for CPU-heavy work. Keep the business design independent of Express and Prisma so isolated raw SQL or background processing can be added only where evidence requires it.

No library recommendation in this document authorizes installation. Versions and final packages should be selected during implementation.

## Logical Modules

Requirement ranges below refer to the stable IDs preserved inside the corresponding `FEATURES/*.md` specifications.

| Module                   | Responsibility                                                                                                                                                  | Shared requirement range         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Access                   | Sign-in, sign-out, sessions, active-user checks, password lifecycle                                                                                             | `AUTH-001–AUTH-005`              |
| Users                    | Administrator-managed account lifecycle within Feature 01 (`users` module)                                                                                      | `AUTH-003`, `AUTH-004`           |
| Administration           | Catalog administration, protected cost/baseline/invoice-currency corrections, named operational recovery, and consistency diagnostics                           | `ADMIN-001–ADMIN-002`            |
| Inventory                | Unique physical item identity, descriptive fields, operational states                                                                                           | `INV-001–INV-006`                |
| Quantity Stock           | Interchangeable product records, on-hand quantities, atomic adjustments                                                                                         | `QTY-001–QTY-003`                |
| Categories               | Controlled categories, category-specific attributes, and general expected-component definitions for assembly categories                                         | `CAT-001–CAT-003`                |
| Hierarchy                | Initial observed baselines, current parent, relationship history, Known Missing Components and origins, dismantling rules, completeness                         | `HIER-001–HIER-011`              |
| Search                   | Search, filters, result projection, parent/location context                                                                                                     | `SEARCH-001–SEARCH-003`          |
| Locations                | Free-text location and effective inherited location                                                                                                             | `LOC-001–LOC-002`                |
| Photos                   | Photo metadata, primary selection, object-storage coordination                                                                                                  | `PHOTO-001`                      |
| Customers                | Generic and identified customers, fiscal identity snapshots                                                                                                     | `CUST-001–CUST-003`              |
| Reservations             | Draft-linked holds, conflicts, eligible release, and abandoned-Draft recovery without automatic expiry                                                          | `RES-001–RES-003`                |
| Sales                    | Draft/completed/cancelled invoice lifecycle, one DOP/USD currency, internal numbering, and totals                                                               | `SALE-001–SALE-008`              |
| Sale Lines               | Unique items, quantity products, catalog-selected services, shipping, and descriptive lines                                                                     | `LINE-001–LINE-006`              |
| Costs and Profitability  | `DOP` acquisition cost, invoice-currency gross profit, FX enrichment for `USD` invoices, administrator-recorded profit when cost is unknown, finance visibility | `COST-001–COST-005`              |
| Payments                 | Same-invoice-currency cash/credit, partial and mixed-method records, balances, and refunds                                                                      | `PAY-001–PAY-005`                |
| Cancellation and Refunds | Cancellation reason, inventory outcome, refund records, and linked physical-work branches                                                                       | `CANCEL-001–CANCEL-005`          |
| Work Orders              | One-piece Dismantling and Installation operations, lifecycle, assignment, claim, and recovery                                                                   | `WO-001–WO-010`                  |
| Evidence                 | BEFORE/AFTER photo classification, upload state, authorization, and retention linkage                                                                           | `PHOTO-001`, `WO-005`, `WO-010`  |
| Invoice Documents        | Immutable invoice facts and reproducible internal PDF output                                                                                                    | `SALE-003–SALE-004`, `ADMIN-002` |
| History                  | Append-only operational events and cross-record traceability                                                                                                    | `HIST-001–HIST-003`              |

Search is logically separate because it composes read data from inventory, quantity stock, hierarchy, location, photos, and protection state. It should not own those records. Work Orders coordinate physical operations but do not own inventory identity or invoice facts. Evidence owns upload and classification facts but cannot complete an order by itself. History records business evidence but should not decide another module's rules.

## Code Organization

Organize primarily by feature, with a consistent internal flow:

```text
feature/
  routes
  controller
  service
  repository
  validation
  types
```

- **Routes** declare HTTP paths and attach middleware.
- **Controllers** translate HTTP input/output and call services; they contain no business rules and never use Prisma.
- **Services** own application orchestration and business decisions. They are independent of Express request/response objects.
- **Repositories** own database access, query shape, and transaction-aware persistence.
- **Middleware** handles shared HTTP concerns such as session authentication, authorization, request validation, rate limiting, logging, and error mapping.

Use shared infrastructure only for genuinely cross-cutting concerns: database client, object-storage adapter, a small FX-rate adapter for `USD` profitability, clock/ID abstractions where testing requires them, errors, and logging. Avoid a generic `utils` dumping ground. The FX-rate adapter is not a sales, payments, or conversion module.

Do not create an artificial domain layer merely to mirror every service with another class. For this project, focused services plus explicit policies/value checks are enough. A richer domain model would become appropriate only if rules become difficult to express and test without it.

## Domain Boundaries

- Inventory owns a real item's identity and operational state; categories own Expected Component Definitions; hierarchy owns relationships between uniquely tracked items and each direct parent's Known Missing Components.
- Quantity stock does not participate in physical hierarchy in the MVP. Only individually tracked items may participate in parent-child physical relationships.
- Categories define allowed descriptive attributes and expected-component definitions but do not own or create physical inventory lifecycle.
- Reservations temporarily control sellability; they do not mark an item sold.
- Sales own invoice state and immutable completed-sale snapshots.
- Sale lines describe what was sold. They may point to a unique item or quantity product, select a mechanical-service catalog entry with negotiated price, or represent a non-stock shipping/descriptive line.
- Sales own the invoice's single DOP/USD currency and internal `FAC-` identity. Payments own same-currency money received and outstanding-balance facts; invoice completion and payment completion are separate because credit sales are normal.
- Cancellation records that the sale was cancelled; refunds record money returned. Neither may erase the original sale or payment.
- Acquisition cost is always stored in `DOP` and is separate from the negotiated selling price. Profitability is a secondary enrichment in the invoice currency: a `DOP` invoice subtracts the stored cost directly, and a `USD` invoice derives `costUsd = storedCostDop / exchangeRateDopPerUsd` without changing the stored cost. Seller and Administrator may view acquisition cost, Seller cannot edit protected cost, and only Administrator may view profit, margin, or profitability statistics.
- Work Orders own post-baseline physical-operation state and assignment. They request later hierarchy changes only through their completion transaction; initial observed baseline registration is a separate Inventory/Hierarchy operation.
- Evidence owns durable references and BEFORE/AFTER classification. A completed Work Order must retain its evidence and technical history.
- Invoice Documents render preserved invoice facts. PDF generation failure does not invalidate an otherwise committed sale.
- History receives facts from the service executing the transaction. It distinguishes receipt-baseline provenance from Work-Order-generated relationship events and is not a replacement for current state.

Cross-module workflows should have one coordinating application service that uses the participating repositories within one transaction. Avoid circular module calls.

## Category-Specific Attributes

### Recommendation: controlled JSONB for category-specific details

Keep the practical shared base—UUID identity, public `internalCode`, name, category, brand, model, optional part/serial numbers, condition, acquisition cost when known or estimated, free-text location, notes, and photos—conceptually separate from small category details. A controlled JSONB document remains one possible implementation for varying details, with permitted keys, types, labels, and required status defined by category policy and validated by the application.

**Problem solved:** assemblies may require a few specific facts, Tires need type, size, and diameter, and Rims need material/type and size. Requiring one wide record creates many irrelevant fields. Assembly expected-component lists are handled by the explicit model below rather than hidden inside category JSONB.

**Why this is the simplest reasonable choice:** PostgreSQL supports JSONB natively, Prisma can persist it, and one developer can add a controlled category definition without introducing a table or deployment change for every attribute. It remains simpler than a full dynamic form/EAV engine.

**Controls required:** reject unknown keys, validate configured types and allowed values, and add indexes only for attributes that become proven search/filter requirements. Unknown real-world identifiers remain optional. Exact catalog values and display/input normalization are non-blocking operational details, not reasons to create a generic dynamic metadata platform.

**Extremes avoided:**

- A single free-form JSON object is easy but allows spelling drift, invalid values, and unsearchable data.
- A full entity-attribute-value model is very flexible but makes validation, querying, and reporting substantially harder.
- Separate detail tables for every category give strong database constraints but create many sparse, evolving structures.

**Tradeoff:** JSONB shifts some integrity from static columns to category validation and makes broad reporting less direct. If one category later gains stable, heavily queried, financially important attributes, it can earn a dedicated detail table without changing the initial recommendation.

This is a strategy, not a final schema.

## Hybrid Inventory

The system needs two explicit inventory modes:

1. **Individually tracked items:** used engines, alternators, assemblies, and other physical units that require a unique internal identity, condition, photos, provenance, and possible parent relationship.

**Item identity for production:**

- Persist a UUID as the primary key and a separate unique `internalCode` (`{prefix}-{six digits}`) as the public, never-reused warehouse code.
- Store `codePrefix` on the category. Generate `internalCode` in the inventory service inside the create transaction by locking a per-category sequence row (same pattern as invoice `FAC-` / `facSeq`). Prisma `@default` cannot encode a per-category prefix.
- Do not accept the public code from the client on create. Do not derive the next number with `MAX(internalCode)`.
- The in-memory frontend mock keeps the public code in `Item.id` (seed examples: `MOT-001`) so existing demo URLs work. Backend work must not copy that shortcut into PostgreSQL.

2. **Quantity stock:** interchangeable products where the business tracks a shared description and on-hand count, such as ten equivalent units.

The mode must be explicit at creation and determine allowed operations. Individually tracked items are sold once and can participate in hierarchy. Quantity stock is sold by quantity and decremented atomically; individual units do not receive fabricated IDs or relationship history.

Sale lines can include either mode alongside services, shipping, purchased-to-order parts, or brief generic descriptions. Only inventory-backed lines change stock.

**Simpler alternative:** model everything as a unique item. This preserves identity but makes common stock cumbersome and invites bulk fake records. **Opposite extreme:** model everything as quantity, which destroys provenance and hierarchy. The hybrid model adds branching rules to sales and search, but accurately matches the business.

Inventory mode is immutable after creation: an individually tracked item cannot be converted into quantity stock, and a quantity-stock record cannot be converted into an individually tracked item. If the original mode was incorrect, the error must be handled through an eligible audited correction rather than changing the record's inventory mode.

Quantity balances may be corrected only by Administrator through an explicit audited stock-adjustment operation. Seller and Mechanic cannot perform this correction. Normal eligible quantity-stock receipts / entries remain ordinary operations available to Seller and Administrator. A correction must preserve the previous quantity, adjustment/difference, resulting quantity, actor, timestamp, and reason instead of silently overwriting the prior balance.

The technical treatment of when a purchased-to-order item becomes stock versus a descriptive sale line remains a non-blocking implementation detail.

### Cost and profitability rules

- Acquisition cost is always recorded in `DOP`, including individually tracked inventory, weighted-average quantity cost, externally sourced resale cost, and an entered estimate. The employee converts a foreign purchase price outside the application; the MVP stores neither the original purchase currency nor a manual purchase rate.
- Quantity-based interchangeable stock uses weighted-average acquisition cost in `DOP`. Receipts update the pool's average; sales consume quantity at the current average. FIFO and LIFO are outside the MVP.
- A component obtained inside a purchased assembly may have an actual cost, a manually estimated cost, or unknown cost. The system never invents an allocation, divides assembly cost automatically, or silently converts unknown cost to zero.
- Gross profit for a line with unknown cost is itself unknown, not zero. Gross profit is expressed in the invoice currency. A `DOP` invoice subtracts the stored `DOP` cost directly. A `USD` invoice obtains an exchange rate, normalizes it to `exchangeRateDopPerUsd` (the `DOP` required for `1 USD`, so `1 USD = DOP 61.50` gives `61.50`), derives `costUsd = storedCostDop / exchangeRateDopPerUsd`, and subtracts that basis from the `USD` selling price. The stored `DOP` cost is never mutated.
- A successful `USD` profitability result preserves the normalized rate value, provider or source, relevant rate date/time, and the time the rate was obtained and the calculation completed. A completed result must not silently change because live rates moved. If the rate cannot be obtained, profitability is `UNAVAILABLE / PENDING FX RATE` with a reason such as `Exchange rate unavailable for USD profitability calculation.` The commercial sale remains valid.
- Seller and Administrator may view acquisition cost. Seller may not edit protected acquisition cost; Administrator uses an audited correction. Profit, margin, profitability statistics, pending-rate reasons, and rate provenance are Administrator-only.

## Hierarchy

- Each uniquely tracked item has at most one current direct parent.
- An item may be both a child and a parent.
- Current relationships and closed historical relationships are distinct. A current relationship also has an auditable origin: initial observed receipt baseline or later Work Order completion.
- Relationship creation must reject self-parenting and cycles.
- Installed/Independent physical state never replaces commercial availability. Available/Installed and Sold/Installed are both valid combinations.
- Administrator alone may apply or remove `No desarmar`. The restriction is evaluated against the complete ancestor chain and blocks separate sale or Dismantling Work Orders for every descendant of the protected root. It does not block sale of that root as a complete unit.
- Initial received-assembly registration may create observed current relationships without a Work Order, but only while committing the first baseline and its provenance. Sale confirmation never changes a current relationship or completeness.
- A newly registered independent piece has no parent. After baseline, parent is not ordinary editable descriptive data; Administrator selects the destination parent while creating an Installation Work Order, and only Mechanic completion creates the relation.
- Dismantling completion closes the direct relationship, records that component type as known missing on the immediate parent, and changes only that parent to Incomplete.
- Installation-order creation does not create a relationship. Installation completion creates it only after assignment, evidence, destination, second-parent, and cycle checks pass.
- Completeness is system-derived from all unresolved Known Missing Components and is never a user-editable selector. The received checklist creates `MISSING_AT_RECEIPT` only for `MISSING`; `NOT_APPLICABLE` creates no missing condition. Dismantling any registered child creates `REMOVED_AFTER_BASELINE`, including for a type outside the original checklist.
- Installation completion may satisfy a compatible Known Missing Component of either origin with the real individually tracked installed item. Restoring one of several missing components leaves the parent Incomplete; when none remain, the direct parent becomes Complete automatically.
- A Known Missing Component is knowledge about an absence, not an inventory item and not a current or historical parent-child relationship. A removed-origin condition may reference the former real child and completed Dismantling Work Order.
- Engine testing remains outside the MVP and is not inferred from completeness.
- Completeness does not automatically propagate to grandparents.
- A removed unsold child becomes independent and may have no location; location after removal is optional.

Cycle prevention should use both an application-level ancestor check for a useful error and a transaction-safe recheck of the affected hierarchy before the conditional relationship write. The persistence design must also enforce one current parent per child, one committed initial baseline per received assembly, and one active operation for the same physical intent. Exact tables and constraints remain detailed-design decisions.

## Expected Components and Baseline Relationship Representation

The domain needs these explicit concepts without becoming a manufacturing or ERP system:

1. **Catalog Category Definition:** Administrator-maintained category structure and small controlled attributes; it never creates stock.
2. **Expected Component Definition:** a general category-scoped list for categories treated as assemblies. A concrete received unit reviews each definition as `PRESENT`, `MISSING`, or `NOT_APPLICABLE`.
3. **Service Catalog Entry:** an Administrator-maintained mechanical-service type selected on an invoice line; its negotiated price belongs to the line, not the catalog.
4. **Real Inventory Item:** an individually tracked physical unit with its own identity and attributes. At receipt it may be linked to the assembly with observed-baseline provenance.
5. **Current Physical Relationship:** the current direct parent-child fact for two real inventory items, separate from closed relationship history and from absence knowledge.
6. **Known Missing Component:** an unresolved absence for one direct parent. `MISSING_AT_RECEIPT` references applicable expected/category semantics and no physical item; `REMOVED_AFTER_BASELINE` may reference the removed real item and completed Dismantling Work Order. Neither origin creates a fake item.
7. **Invoice Currency and Internal Number:** one `DOP` or `USD` currency per invoice and one shared `FAC-` confirmation sequence. Neither implies operational conversion or NCF issuance. A `USD` invoice may obtain a normalized `exchangeRateDopPerUsd` value solely to derive the USD-equivalent acquisition-cost basis for profitability.
8. **Work Order:** the one-piece instruction and evidence record for real post-baseline dismantling or installation. Completion changes physical relationships and may create or resolve missing knowledge.
9. **Baseline Provenance:** actor, timestamp, observed relationships, three-state checklist outcomes, derived completeness, and receipt context preserved by HIER-011.
10. **Protected Administrative Correction:** an additive Administrator-only operation with reason and before/corrected states for eligible acquisition-cost, receipt-baseline, or completed/no-payment invoice-currency correction.

### Alternatives considered

- **Category definition plus per-assembly checklist result:** keep one small general expected-type list per assembly category and preserve each received unit's `PRESENT`/`MISSING`/`NOT_APPLICABLE` review. Present results reference real items, missing results create absence knowledge, and not-applicable results create neither.
- **Hardcoded nullable component columns:** one column per possible alternator, turbo, starter, and future category slot looks simple initially but creates sparse records, repeated migrations, and unclear handling when categories vary.
- **Manufacturing BOM/ERP model:** revisions, quantities, substitutions, production planning, and multi-level engineering BOM behavior exceed the needs of a small used-parts business.
- **Generic EAV/metadata/workflow engine:** maximum flexibility would weaken validation and make normal queries, completeness, and maintenance harder for one developer.

### Recommendation

Use the first alternative with small Administrator-maintained definitions, an assembly-specific three-state receipt review, one current-relationship concept, explicit Known Missing Component records with one of the two validated origins, and additive correction history. Only `PRESENT` references a real item; `MISSING` creates an absence; `NOT_APPLICABLE` creates neither.

Initial completeness is derived from all unresolved Known Missing Components. Later Dismantling creates `REMOVED_AFTER_BASELINE`; later Installation links the real item and may resolve a compatible condition from either origin. Exact records, tables, fields, simple category-based matching, and constraints remain non-blocking development decisions; this plan does not finalize a Prisma schema.

## Transactions

PostgreSQL transactions are mandatory where partial completion would create a false inventory or financial state. Prisma transaction support is the default coordination mechanism; repositories participating in a workflow must share the same transaction context.

### Initial received-assembly baseline

In one transaction, validate that the received assembly has no committed baseline, register or validate the root and every `PRESENT` child identity, apply category minimums, preserve all three checklist results, reject cycles or second parents, create initial observed relationships, create missing conditions only for `MISSING`, derive completeness, and append actor/time/receipt provenance. `MISSING` and `NOT_APPLICABLE` never create inventory. Failure leaves no partial state and creates no Work Order or evidence requirement.

### Protected initial-baseline correction

Administrator alone may request a named correction after the business verifies that receipt reality was recorded incorrectly and no physical change occurred. In one transaction, validate the original baseline, affected identities, one-parent/no-cycle rules, proposed three-state checklist and relationship facts, direct-parent completeness, and dependencies on later immutable events. When safe, update the applicable current baseline-derived understanding and append actor, timestamp, reason, before state, and corrected state while preserving the original event.

The operation never reruns HIER-011, creates a fake Work Order, bypasses later physical-work rules, or rewrites completed invoices, immutable assembly-sale snapshots, completed Work Orders, evidence, payments/refunds, or later relationship history. If those events would be contradicted, surface the conflict for protected administrative reconciliation rather than silently mutate records. A generic reconciliation engine is not part of this plan.

### Protected cost and invoice-currency corrections

Administrator may correct protected acquisition cost through an audited named operation; the corrected value remains a `DOP` amount. A `Completed` invoice's currency may be corrected only when it has no payment records. Both operations require reason, actor, timestamp, before value, corrected value, and additive history.

Draft currency remains an ordinary Seller/Administrator edit. Once a completed invoice has any payment, direct currency correction is rejected; cancellation/reversal and correct reissuance are required. The architecture must not convert operational amounts—line prices, paid amounts, balances, or refunds—to repair the transaction.

A successful currency correction leaves the stored acquisition cost in `DOP` and then re-derives profitability under the corrected currency as a **secondary enrichment outside the correction's atomic boundary**. `DOP → USD` uses the FX profitability flow; if the rate cannot be obtained, the correction remains committed and profitability becomes `UNAVAILABLE / PENDING FX RATE`. `USD → DOP` computes gross profit directly in `DOP` with no provider call. Neither direction reruns the sale or inventory transaction, and profitability must not remain expressed under the obsolete currency.

### Mechanic order claim

One conditional transaction changes an unassigned Pending order to In Progress and assigns the acting Mechanic. A zero-row result means another claim or state change won; the losing request rereads the order and must not overwrite the winner.

### Installed-piece sale confirmation

In one transaction:

1. Revalidate the Draft, reservation ownership, item availability, current relationship, duplicate inclusion, and the full ancestor chain for `No desarmar`.
2. Confirm the invoice from an immutable commercial snapshot, assign the next shared `FAC-` number, and mark the piece Sold.
3. Consume the reservation.
4. Create a new Pending Dismantling Work Order when no appropriate active order exists, or reuse the appropriate Pending or In Progress order already representing the same physical operation without overwriting its status, assignment, evidence, earlier invoice linkage, or history.
5. Append linked business history.

The relationship stays current, the piece stays Installed, and the parent keeps its existing completeness. Any failure rolls back every commercial step and Work Order creation/reuse linkage.

The external FX-rate lookup is **outside** this atomic commercial transaction. A failed, timed-out, or missing rate leaves the sale, reservation consumption, Sold transition, and Work Order creation/reuse committed, and records profitability as `UNAVAILABLE / PENDING FX RATE`. The FX provider is not part of the inventory-sale success boundary.

### Dismantling completion

In one transaction, verify that the order is In Progress, belongs to the acting Mechanic, still targets the expected piece and current source relationship, and has at least one durable BEFORE and AFTER photo. Accept an optional new free-text location from that assigned Mechanic, then complete the order, close and historize the relationship, make the piece Independent without changing a Sold piece back to Available, create a `REMOVED_AFTER_BASELINE` Known Missing Component referencing the removed real item and Work Order, mark only that parent Incomplete, and append history. The scoped location input is optional and grants no general inventory editing.

### Installation completion

In one transaction, verify order state, current assignment, durable evidence, piece, and destination. Revalidate no self-parenting, no cycle, no second current parent, and no conflicting active physical operation. Create the current relationship, resolve a compatible Known Missing Component from either origin where applicable, recalculate all unresolved conditions, make the direct parent Complete only when none remain, complete the order, and append history. The real installed item remains distinct from the absence record; higher ancestors do not change.

### Complete-assembly sale

Before confirmation, query for any Pending or In Progress Dismantling or Installation Work Order whose completion could change the selected root, a current descendant, or an item being installed into that subtree. If one exists, reject with a clear business conflict; do not auto-cancel the order, silently exclude a component, or sell the previewed snapshot.

After the physical work is completed, cancelled, or otherwise resolved through its valid workflow, reread the root's complete current descendant set and rebuild or revalidate reservations as necessary. In one transaction, recheck hierarchy stability, reservation, and sellability; reject descendants duplicated as separate lines; mark the root and every included current descendant Sold; consume reservations; and preserve an immutable delivered-hierarchy snapshot. The snapshot records exactly what was delivered and never depends on later relationship edits. The internal lifecycle of current relationship records after sale remains a detailed architecture choice; it must not alter the snapshot or leave included descendants separately Available.

An unavailable FX rate is not a hierarchy-stability conflict. It never aborts this commercial transaction; it only leaves `USD` profitability pending, as with any other sale confirmation.

### Secondary profitability enrichment and recovery

Profitability calculation is a secondary enrichment of a completed commercial transaction, not part of the inventory-sale success boundary. After a valid confirmation or a successful Completed/no-payment currency correction:

1. Obtain an applicable rate from the external FX-rate provider with a bounded timeout.
2. Normalize the provider response to `exchangeRateDopPerUsd` before any arithmetic.
3. Persist the profitability result together with the normalized rate, provider/source, relevant rate date/time, and the time the rate was obtained and the calculation completed.
4. On timeout, provider error, or missing rate, log the failure with useful context, leave the commercial operation unchanged, and record profitability as `UNAVAILABLE / PENDING FX RATE` with a clear reason.

A later named recovery may retry the enrichment once an applicable rate is available. The retry must not rerun the sale, resell inventory, modify payments, or reconfirm the PDF as a sale, and must not present an unrelated later live rate as though it had been the sale-time rate. Completed profitability results never silently follow live-rate changes.

This remains a small in-process lookup plus a named retry. It is not a queue, microservice, event-sourcing pipeline, distributed job platform, or generic integration bus. Observability of unresolved profitability calculations belongs with the existing consistency diagnostics.

### Reservations and quantity stock

A sale Draft creates a reservation for inventory-backed lines and prevents another Draft from confirming the same unique item or reserved quantity. Line removal, discard, or successful confirmation releases/consumes it. Drafts do not expire automatically; Administrator may release an abandoned Draft/reservation only through the named audited recovery operation.

Quantity confirmation must use a conditional atomic decrement so stock cannot become negative. Reservation creation and release must adjust reserved availability consistently under concurrency.

### Cancellation, payments, and refunds

A completed sale is never edited back into a draft or deleted. Each Administrator-selected cancellation branch is one atomic business boundary around invoice cancellation, eligible inventory restoration, applicable refund records, linked Work Order state, and additive history. If linked dismantling is Pending, cancellation also cancels that order, restores eligible availability, and leaves hierarchy and completeness unchanged. If dismantling is Completed, the eligible piece becomes Available but stays Independent and the parent stays Incomplete; reinstallation requires a new Installation Work Order.

When dismantling is In Progress, Administrator must coordinate with the assigned Mechanic and explicitly record a reasoned choice: stop after verifying the piece can remain Installed, or cancel/refund the invoice while physical work continues. In the latter case the Available/Installed piece may be sold again and confirmation must reuse the existing active order.

If money was received, cancellation also requires a refund in the invoice currency. Invoice, payment, and refund states remain separate. Internal records can be committed atomically; an external payment-provider call, if ever added, cannot be part of a database transaction and would require an idempotent workflow with retry/reconciliation.

### Secondary PDF generation

Invoice confirmation commits the valid commercial sale and immutable invoice facts without depending on PDF rendering or object-storage success. PDF render/store is a recoverable secondary operation: failure records operational state and an error identifier, while Administrator regeneration reads the preserved snapshot and never reruns sale confirmation.

## Concurrency

Concurrency must be designed around expected conflicts, not treated as a rare error:

- Use database constraints for unique public item codes (`internalCode`) and UUID primary keys, plus other invariant uniqueness.
- Lock the per-category item-code sequence in the same transaction as item insert, matching invoice `FAC-` allocation.
- Use row locks, conditional updates, or optimistic version checks when confirming sales, changing relationships, reserving stock, and decrementing quantities.
- Revalidate all relevant facts at confirmation even when the UI showed them moments earlier.
- Make confirmation and refund commands idempotent so a browser retry cannot duplicate them.
- Return a specific conflict response that tells the user to refresh and review; never silently overwrite.
- Add appropriate indexes for current-parent lookup, ancestor/protection checks, active operations, available inventory, reservations, search fields, sale identifiers, and history references after query shapes are known.
- Avoid loading unbounded trees or histories; use bounded projections and pagination where applicable.

The validated races are handled inside the modular monolith without distributed locks:

- **Two Drafts reserve or confirm one unique item:** enforce at most one active reservation for that item and use a conditional state/version update at confirmation; one transaction wins and the other receives a conflict.
- **Quantity overselling:** atomically reserve or decrement only when `on-hand - reserved` is sufficient, protected by a database check and conditional write so stock cannot become negative.
- **Two Mechanics claim one Pending order:** one conditional update changes Pending/unassigned to In Progress/assigned. The affected-row result identifies the sole winner.
- **Duplicate active physical operations:** enforce uniqueness for an active operation's piece, type, and relevant source/destination intent. Creation first looks up a compatible active order and reuses it; a concurrent duplicate loses to the constraint and rereads the winner.
- **Sale confirmation versus hierarchy change:** protect and revalidate the item, expected current relationship, relevant hierarchy version, and `No desarmar` ancestor chain in the sale transaction. Complete-assembly confirmation also rejects Pending or In Progress physical Work Orders that could change the delivered subtree, including incoming installation pieces, and rereads the post-resolution tree. A stale side fails rather than confirming against a different physical context.
- **Work Order completion versus invoice cancellation:** condition both transitions on the expected order and invoice versions/states and serialize their affected rows. The second transaction must reread and follow the now-valid cancellation branch or report a conflict.
- **Administrator reassignment versus Mechanic action:** completion and modification condition on both order version and assigned Mechanic. Release/reassignment increments that version, so a stale Mechanic action cannot commit.
- **Competing hierarchy changes:** installation/dismantling completion rechecks source/destination, one-current-parent, cycle, and hierarchy version in the transaction. Uniqueness and conditional writes reject the loser.

The exact isolation level and lock strategy should be proven with integration tests against PostgreSQL, not assumed from unit tests or SQLite behavior.

## Authentication

### Recommendation: same-origin server sessions with secure HttpOnly cookies

The backend creates a revocable server-side session after verifying a nominative active account. The browser receives only an opaque session identifier in a cookie configured with `HttpOnly`, `Secure` in production, and an intentional `SameSite` policy. Store session state in a persistent shared store suitable for the deployment; PostgreSQL is sufficient initially.

**Why:** the product is a browser-based first-party application, not a public API ecosystem. Server sessions simplify logout, disabled-account enforcement, credential revocation, and secret handling. Keeping frontend and API under one origin also avoids broad CORS configuration.

**Alternative:** access/refresh JWTs are useful across multiple independent clients and services, but add token storage, rotation, revocation, and theft-recovery complexity without a current benefit.

Passwords must be hashed with a reputable adaptive algorithm such as Argon2id or bcrypt using current guidance. Add login rate limiting, generic credential errors, session rotation after login, CSRF protection for state-changing requests, and secure headers. The final package choice occurs during implementation.

## Authorization

Authentication answers who the user is; authorization answers whether that user may perform this action. Every protected operation must be checked in the backend service or authorization middleware, not only hidden in React.

The MVP has three roles:

- **Administrator:** performs normal Seller operations and alone manages users and business catalogs; applies/removes `No desarmar`; creates manual Dismantling and Installation Work Orders; cancels confirmed invoices and registers same-currency refunds; performs named protected cost, receipt-baseline, and completed/no-payment currency corrections; uses operational recovery; and views profitability.
- **Seller:** performs normal inventory, customer, Draft, reservation, negotiated-price, and sale operations using maintained catalogs. Seller may register the required full initial payment when confirming a cash sale and trigger creation/reuse of a Dismantling Work Order. Seller cannot register later payments, open CxC, receive invoice payment state/balance/movements or acquisition cost, maintain catalogs, edit protected cost, correct a committed baseline or completed invoice currency, create/complete standalone physical orders, directly change post-baseline hierarchy, cancel/refund, manage `No desarmar`, view profitability, or perform protected recovery.
- **Mechanic:** views and acts only on the restricted mobile Work Order projection. Any active-order modification or completion must verify that the Mechanic is currently assigned. The assigned Mechanic may optionally enter the removed piece's free-text location during Dismantling completion but has no general inventory-edit permission. The role receives no customer, invoice, price, cost, payment, refund, balance, profit, margin, or other commercial/financial data.

Prefer explicit permission checks tied to operations over permissions encoded by screen. Follow least privilege and record protected actions with actor and reason.

## Fiscal Calculation and Invoice PDFs

- The negotiated final entered price includes ITBIS for taxable product and merchandise lines.
- The MVP rate is fixed at 18%. The system derives the taxable base and included tax from the final line amount; it does not add tax on top of that entered amount.
- Individually tracked parts, quantity products, externally sourced resale parts, and generic merchandise are taxable. Mechanical service and delivery/shipping lines are non-taxable.
- Mechanical service type is selected from the Administrator-maintained service catalog and its final price is negotiated on the invoice line.
- Delivery may be omitted; provided no-charge delivery uses numeric amount `0`, never textual `N/A`; charged delivery uses a positive numeric amount.
- Each invoice has one `DOP` or `USD` currency; lines, totals, payments, balances, refunds, and profitability results match it, while stored acquisition cost stays in `DOP`. Mixed-currency invoices and operational invoice, payment, or refund conversion are excluded. One narrow FX conversion exists for `USD` profitability only, using `exchangeRateDopPerUsd` as defined above. Provider selection, endpoint, timeout, caching, historical-rate lookup, and retry mechanics are non-blocking implementation details; no provider is selected here.
- Each invoice line is calculated and rounded to two decimal places individually. Invoice totals are then calculated from those already rounded line values. Rounding is a calculation rule, not merely display formatting, and must not be deferred so that the only rounding happens at the final invoice total.
- Successful confirmation assigns the next unique, never-reused internal number in one shared `FAC-000001` sequence. Cancelled numbers remain used. The number is not the NCF.
- The internal printable invoice is a PDF and visibly includes `NCF: ______________________` for the manual external process. There is no DGII integration, NCF generation, validation, or assignment in the MVP.
- The confirmed invoice preserves all facts needed to regenerate exactly the same document. PDF generation/storage status is operational state, not invoice validity: a failed PDF can be regenerated by Administrator without reopening or rolling back the sale.
- Final PDF layout and legal/footer wording remain later output-design details; they do not reopen currency, per-line two-decimal rounding, numbering, tax, or NCF behavior.

## Work Order Lifecycle and Evidence

- A Work Order represents one physical piece and one operation type: Dismantling or Installation.
- Normal lifecycle is Pending → In Progress → Completed. Eligible orders may be Cancelled under the validated cancellation rules; Completed history is never cancelled or erased.
- Pending orders are visible to Mechanics without commercial context. `Take order` atomically assigns the acting Mechanic and moves the order to In Progress.
- Only the assigned Mechanic may add technical notes/evidence or complete an active order. Administrator may release, reassign, or cancel an eligible order through controlled recovery with actor, reason, timestamp, and before/after history.
- Completion requires at least one durable photo classified BEFORE and at least one classified AFTER. Multiple photos in either class are allowed.
- Completed records preserve piece, type, relevant source/destination, assigned Mechanic, timestamps, evidence, technical notes, and history. Reversal is a new opposite Work Order.
- Sale confirmation creates a new Pending or reuses a matching active Pending/In Progress Dismantling Work Order; manual Dismantling and all Installation Work Orders are Administrator-created. Order creation alone never changes hierarchy. Initial baseline registration is not an order and does not weaken evidence requirements for later physical work.

## Validation

Use three layers:

1. **Request validation:** shape, type, length, format, enumerated values, and rejected unknown fields at the HTTP boundary.
2. **Business validation:** availability, reservation ownership, hierarchy, permission, invoice state, and payment rules in services.
3. **Database integrity:** unique constraints, foreign keys, checks, and transactional conditions for invariants that must survive concurrent requests.

A TypeScript runtime-schema library such as Zod is a reasonable conceptual choice because TypeScript types disappear at runtime. Alternatives include Joi and Valibot. Select and install one only during implementation after evaluating integration and bundle needs.

Prevent mass assignment by mapping validated input to allowed service commands instead of passing request bodies directly to Prisma.

## Error Handling

Define a small application error taxonomy: validation, authentication, forbidden, not found, state conflict, and unexpected failure. A central error middleware translates these into consistent HTTP responses with a request/correlation ID.

Expected conflicts should identify the business fact that changed without exposing internal SQL or stack traces. Production clients receive generic unexpected-error messages. Detailed stack and database information belongs only in protected logs.

## Logging

Use structured logs suitable for managed-platform collection:

- request/error correlation ID, timestamp, severity, operation, duration, outcome, and safe actor/item/sale/order identifiers;
- explicit operational context for sale confirmation, Work Order claim/completion/reassignment, PDF generation, evidence upload, cancellation, refund, permission changes, recovery actions, FX-rate lookup failures, unresolved profitability calculations, consistency failures, and concurrency conflicts;
- no passwords, session values, tokens, acquisition-cost payloads, full payment details, or unnecessary customer identity;
- environment-configurable verbosity and retention.

A structured logger such as Pino is conceptually appropriate for Node, but no package should be installed from this plan. History is business-facing evidence; logs are operational diagnostics. Do not treat one as the other.

Every unexpected client-visible failure should return a safe error ID that support can correlate to protected logs. Readiness should report whether the application can safely serve its essential dependencies, while liveness reports whether the process is responsive; neither endpoint may expose secrets or detailed internal failures.

## Photos and File Storage

Store photo bytes in S3-compatible object storage and keep only metadata, ownership, ordering/primary status, and object keys in PostgreSQL.

**Why:** database backups stay smaller, managed object storage handles durable blobs efficiently, and the application can enforce authorization around uploads and reads.

Upload rules must validate authorization, size, allowed MIME type, extension/signature consistency, and image processing limits. Generate non-guessable object keys; never trust a user-provided storage path. Prefer short-lived signed upload/read operations or backend-mediated access according to the hosting provider.

Object and database updates cannot share one ACID transaction. Use staged uploads and cleanup/reconciliation for orphaned objects. Deleting an item should not silently destroy historical photo evidence; retention policy is pending.

Work Order evidence requires an explicit reliable state: a photo is not completion evidence until upload and durable-object verification succeed and authorized metadata links it to the order and BEFORE/AFTER class. Mobile retries use an idempotent upload/finalization identity so reconnects do not create ambiguous duplicates. Failed or abandoned uploads remain retryable or discoverable by controlled reconciliation; Administrator recovery may retry or relink only through named, audited operations.

Local development may use a compatible local object-store emulator or a filesystem adapter behind the same interface, but production behavior must be integration-tested against the chosen provider.

## Administration and Operational Recovery

Administrator recovery is a small set of named business operations, never a SQL console, raw record editor, arbitrary state selector, or bypass around domain invariants.

Supported recovery responsibilities include inspecting/releasing abandoned reservations; inspecting/releasing/reassigning/cancelling eligible Work Orders; regenerating a failed invoice PDF; retrying or recovering failed evidence uploads where safe; and retrying a pending `USD` profitability calculation. Each action enforces current state, requires a reason where appropriate, and preserves actor, timestamp, before/after state, and history. Administrator cannot mark physical work Completed without valid assignment flow and required durable evidence. A profitability retry cannot rerun a sale or invent a rate.

Provide read-only consistency diagnostics for:

- negative on-hand or reserved quantity and reserved quantity exceeding stock;
- stuck, abandoned-Draft, or orphan reservations;
- more than one current parent, hierarchy cycles, and broken relationship history;
- duplicate active physical operations;
- Work Orders with impossible assignment/state/evidence combinations;
- inconsistent invoice, payment, cancellation, or refund balances;
- unresolved `UNAVAILABLE / PENDING FX RATE` profitability results;
- Sold/Available, Installed/Independent, snapshot, and history combinations that violate validated transitions;
- invoice PDFs or photo evidence whose metadata/object state cannot be reconciled.

Diagnostics should identify affected business records and safe error context. Repairs remain explicit controlled operations; diagnostics must not silently mutate data.

## Testing

Recommended conceptual tool direction:

- **Unit tests:** Vitest or Jest for pure policy and service behavior.
- **API integration tests:** Supertest or equivalent against the Express app.
- **Database integration tests:** real PostgreSQL for transactions, constraints, recursive hierarchy behavior, locks, and race conditions.
- **End-to-end tests:** Playwright for the smallest critical browser journeys.

Prioritize behavior over implementation details. Essential suites include:

- initial received-assembly registration records `PRESENT` children as real items, `MISSING_AT_RECEIPT` conditions without inventory IDs, `NOT_APPLICABLE` without missing conditions, derived completeness, and baseline provenance without Work Orders or evidence;
- initial baseline creation rejects a repeat/reopen, cycle, second parent, or partial commit; protected correction preserves original/corrected provenance and rejects contradictions with later immutable history; every real later hierarchy change still requires valid Work Order completion;
- installed-piece sale atomically confirms commercial state and creates/reuses an order without changing hierarchy or completeness;
- a forced failure at each installed-sale, dismantling-completion, and installation-completion stage leaves no partial state;
- complete-assembly sale rejects relevant Pending/In Progress physical work, rereads the tree after resolution, includes all current descendants, rejects duplicate inclusion, and preserves an immutable delivered snapshot;
- `No desarmar` blocks separate sale/dismantling across the full subtree and is Administrator-only;
- dismantling changes only the direct parent, creates `REMOVED_AFTER_BASELINE`, and supports optional assigned-Mechanic location; installation may resolve either origin and restores Complete only after every Known Missing Component is resolved;
- cycle, self-parent, and second-parent prevention, including competing hierarchy completions;
- two users reserve or sell the same unique item and concurrent quantity operations never oversell;
- two Mechanics claim one Pending order and only one succeeds;
- concurrent creation/reuse cannot produce duplicate active physical operations;
- sale versus hierarchy change, Work Order completion versus invoice cancellation, and reassignment versus stale Mechanic action each produce one valid outcome and one explicit conflict;
- DOP/USD single-currency invoices, same-currency partial/mixed-method payments and refunds, and rejection of operational cross-currency records;
- shared `FAC-` numbering at confirmation, non-reuse after cancellation, Draft currency edits, protected completed/no-payment correction that re-derives profitability under the corrected currency without converting operational amounts, and rejection after payment;
- each validated Pending/In-Progress/Completed cancellation branch preserves invoice, payment, Work Order, relationship, evidence, and refund history;
- `DOP` acquisition-cost storage, `DOP` invoice profit with no FX, `USD` invoice profit using `costUsd = storedCostDop / exchangeRateDopPerUsd`, rate-provenance persistence, and unknown-cost profitability behavior;
- FX provider failure leaving a valid sale with `UNAVAILABLE / PENDING FX RATE` rather than a rejected confirmation or an invented rate;
- later profitability recovery completing the calculation without rerunning the sale, and a completed result not silently following live rates;
- two-decimal per-line included-product-ITBIS derivation, totals summed from rounded line values, and non-taxable catalog-service/shipping behavior;
- PDF generation failure leaves the sale valid and deterministic regeneration reproduces the document;
- Seller cannot access profitability or Administrator operations; Mechanic cannot receive any commercial/financial projection;
- upload type/size/authorization failures, mobile retries, duplicate finalization, and storage/database reconciliation.

Avoid excessive mocks for repository behavior. Concurrency and transaction guarantees must run against PostgreSQL. Libraries are recommendations only; install nothing as part of this documentation phase.

## Security

- Treat every browser payload, query, uploaded file, and object identifier as untrusted.
- Enforce session and authorization checks server-side for every protected operation.
- Keep the production frontend and API same-origin; configure CORS narrowly if a separate origin ever becomes necessary.
- Use parameterized ORM/query operations and review any raw SQL separately.
- Apply secure headers, CSRF defenses, login brute-force protection, and rate limits to sensitive operations.
- Validate and constrain uploads; do not serve user content with executable types.
- Keep secrets outside source control and rotate them after suspected exposure.
- Avoid leaking stack traces, database errors, internal object keys, cost/profit data, or customer PII.
- Encrypt transport with HTTPS and rely on managed storage encryption where available.
- Back up and test restoration of both relational records and photo objects.
- Audit dependency vulnerabilities during CI, but do not auto-upgrade production dependencies without tests.

## Future Scalability

Keep the modular monolith and scale it only from measured evidence:

1. Measure slow queries and add justified indexes/projections before adding infrastructure.
2. Use bounded queries, pagination, and justified PostgreSQL indexes before adding another data technology.
3. Tune database connections and application resources based on observed load.
4. Add narrowly scoped asynchronous in-process or scheduled work only if measured request latency requires it, preserving idempotency and recovery in PostgreSQL.

Microservices, brokers, Kubernetes, event sourcing, distributed locking, and workflow engines are not part of this plan. Possible future fiscal integration, import costing, advanced reporting, native mobile, and SaaS multi-tenancy should not distort the MVP model now. The principal tradeoff is deliberate: preserve strong transactional correctness and understandable operations today.

## Remaining Detailed-Design Decisions

No core business decision in this plan blocks MVP v1 scope freeze. The following are implementation or output-design details to settle before their affected work:

- exact initial catalog entries, input/display normalization, and simple category-based repeated-component matching;
- technical lifecycle of current relationship records after complete-assembly sale while preserving the validated Sold tree, snapshot, and cancellation invariants;
- purchased-to-order technical treatment;
- photo retention and access policy;
- FX-rate provider selection, endpoint, timeout, retry mechanism, caching strategy, and historical-rate retrieval mechanics behind the validated `USD`-profitability behavior;
- final invoice PDF layout and legal/footer wording.
