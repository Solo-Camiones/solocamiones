# Development Plan — Phased Production Delivery

## Purpose

This document replaces the previous dependency-first development sequence.

The **final MVP scope remains intact**, but production delivery is reorganized around the owner's current business priority:

1. Billing / invoicing.
2. Payments and basic Accounts Receivable.
3. Basic Accounts Payable **only after its missing rules are validated**.
4. Base inventory and inventory-backed sales.
5. Hierarchical inventory.
6. Mechanic physical-work workflow.
7. Final integration, recovery, and MVP acceptance.

A **Release** is a usable production subset. A release being complete does **not** mean the Final MVP is complete.

---

# 1. Cursor execution rules

For every task:

1. Identify the active Release below.
2. Read `FEATURES/README.md`.
3. Read only the feature specs listed for the active task.
4. Read `ARCHITECTURE_PLAN.md` only when architecture, module boundaries, transaction rules, or technical tradeoffs are relevant.
5. Read `ROLES_AND_PERMISSIONS.md` for authorization behavior.
6. Read `USE_CASE_FLOWS.md` for cross-feature workflows.
7. Never implement a later-release business workflow merely because its feature spec exists, **unless this plan already records that the owner pulled that slice forward**.
8. Never weaken a confirmed invariant to make an early release faster.
9. Unsupported later paths must be explicitly unavailable/rejected, not approximated.
10. Production data created in an early release must remain valid after later releases are enabled.
11. `FEATURES/15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md` is not implementable until promoted to `CONFIRMED`.
12. Prototype-mock checklists marked `[x]` are **not** production API. Prefer the snapshot below over an old `[x]` when they disagree.

---

# Current implementation snapshot (2026-09-11)

Owner pulled **Release 3 financial work** into the local codebase before Release 2’s web profitability swap and exit gate. Future tasks must not re-build payments, CxC, or non-inventory cancellation, and must not treat inventory/Work-Order `[x]` mock items as PostgreSQL/API.

**Owner decisions (2026-09-10 / exit gate 2026-09-11):**

1. Release 2 **Billing Core is COMPLETED** locally (M25 closed 2026-09-11: browser walkthrough + full test suites). First production deploy still requires the operational gate in this file.
2. Release 3 stays **open**. The pulled-forward slice is not the full spec: remaining Feature 12/13 checklist items that belong to this release must still be implemented. Do not skip them.
3. No `plans_api/plan_release_3.md` for now; `docs/done_api/release_3.md` is the delivery record.
4. Prototype-mock `[x]` items stay `[x]` with mock/API notes; do not uncheck them.
5. Invoice **document activity** (detail GET + HTTP UI) is pulled forward: confirm, payment, PDF, cancel, and Administrator-only profit/FX. Draft meta edits and line add/update/remove are **not** invoice activity: do not append them, and hide any already-stored rows of those types. Do not delete `HistoryEvent` rows.

| Slice | Production API + tests | HTTP UI (`VITE_USE_MOCK_API` ≠ `true`) | Prototype mock only |
|---|---|---|---|
| Release 1 Access/Users | Done | Done | Done |
| Release 2 Billing Core (customers, service catalog, non-inventory lines, confirm/`FAC-`, PDF, cost/FX/profit, profitability HTTP) | Done | Done (M25 closed 2026-09-11) | Full demo including profit |
| Release 3 payments, balances, basic CxC, non-inventory cancel/refund | **Pulled forward — done** (`InvoicePayment`, due date, `POST /payments`, `GET /receivables`, `POST /cancel`) | **Pulled forward — done** (pay, CxC `/receivables`, cancel). Confirm may record an initial payment | Done |
| Release 3 remaining | **Still required** now that R2 is closed: Feature 12 open checklist (receivables filters by customer, invoice, payment state including Paid/Paid-late, date, and currency; UI must use API query params). Aging/collections stay deferred as specified. Inventory/WO cancellation is R5/R7, not this remainder. | Same filters on `/receivables` HTTP UI | — |
| Release 3B Accounts Payable | Not started | Not started | Not in confirmed scope |
| Release 4 inventory / quantity / inventory categories | **Not started** (no Item/Qty models) | Service catalog only; inventory category UI hidden | Registration, qty, category attributes |
| Release 5 reservations and ITEM/QTY sales | **Not started**; ITEM/QTY draft lines return business **409** | Capabilities off | Lines, reserve, consume |
| Release 6 hierarchy / baseline | **Not started** | Off | Checklist, tree, No desarmar |
| Release 7 Work Orders / installed-assembly sale | **Not started** | Off | Desktop + mechanic flows |
| Release 8 protected corrections, recovery, diagnostics | PDF regenerate **done**. USD profit retry is **`POST /api/profitability/:invoiceId/retry`**, not a recovery module. Cost/currency/baseline corrections **not** in API | PDF regenerate in invoice detail. Profit retry/manual gross-profit **HTTP wired (M24)** on `/profitability`. Recovery module still mock | Currency correction, recovery screens, WO/reservation recovery |

**Partial modules (do not “finish” by duplicating the done half):**

- **Profitability:** API (DOP, COST-005, FX pending/retry) and HTTP UI swap (M24) exist. Dashboard KPIs are not swapped.
- **Catalogs:** mechanical **services** are Release 2 HTTP; **inventory categories/attributes** remain Release 4.
- **Sales confirmation:** Billing Core plus pulled-forward optional initial payment and `dueDate` (Release 3). `Cliente contado` requires a full initial payment (owner 2026-09-11).
- **Cancellation:** financial/non-inventory API+HTTP done; inventory restoration and Work-Order branches are mock-only until Releases 5/7.
- **History:** envelope + user/customer/catalog/invoice confirmation/payment/PDF/cancellation events in the writing transaction; invoice detail GET + HTTP UI project that timeline (profit/FX Administrator-only). Draft meta and line add/update/remove are not appended and are hidden if already stored. No standalone history API; no per-item/order projections; ADMIN-002 mostly open.
- **CxC:** ledger + open-receivables read model done; remaining Feature 12 filters are **still in scope** (implement now that R2 M25 is closed).

---

# 2. Development architecture baseline

Use the retained architecture direction:

- Frontend: React + TypeScript + Vite.
- Backend: Node.js + TypeScript + Express.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- Architecture: modular monolith.
- Feature-internal flow: route → controller → service → repository.
- Business decisions: services.
- Database access: repositories/transaction-aware persistence.
- Runtime validation at HTTP boundaries.
- Server-side authorization for every protected command.
- Database transactions/constraints for critical consistency.
- Same-origin server-side sessions.
- Private S3-compatible object storage when photo/evidence blobs are introduced.

Do not introduce microservices, brokers, Kubernetes, event sourcing, or distributed locking for the MVP.

---

# 3. Quality rule for every release

No release is considered production-ready merely because the UI works.

Every release requires, at minimum in the development environment:

- migrations reviewed and reproducible;
- unit tests for pure business calculations/policies;
- integration tests against PostgreSQL for transactional behavior;
- authorization negative tests;
- runtime input validation;
- structured errors/logging;
- no known path that creates partial financial or inventory state in the flows implemented so far.

Additional production-operational requirements — HTTPS, secrets outside source control, database backup, tested restore, release/rollback procedure, staging verification — apply **before the first production deployment**, not necessarily within every local-development release. See **First production deployment** below.

---

# Release 0 — Owner Approval Snapshot

**Status: COMPLETED (owner-approved).**

## Objective

Freeze the already-defined business behavior and the approved prototype state before production code.

This is a short gate, not another broad requirements exercise.

## Work

- Confirm that the current prototype represents the intended user workflows sufficiently to begin implementation.
- Record any prototype feedback directly into the affected `FEATURES/*.md`, `ROLES_AND_PERMISSIONS.md`, or `USE_CASE_FLOWS.md`.
- Validate the blocking Accounts Payable questions in `FEATURES/15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md` if the owner wants CxP in the first financial delivery sequence.
- Do not reopen confirmed requirements unless the owner explicitly changes the business rule.

## Exit gate

- The owner approves the implementation direction.
- No unresolved change affects Release 1–3 billing/CxC behavior.
- Accounts Payable is either:
  - promoted to `CONFIRMED`, or
  - explicitly skipped until later without blocking Billing/CxC.

---

# Release 1 — Application Foundation and Access (Local Development)

**Status: COMPLETED.**

## Business outcome

Create the application foundation and Access/Users capability in a **local development environment** so Release 2 can begin storing invoice/customer data safely once Billing is implemented.

Release 1 does **not** include staging, production deployment, managed hosting, HTTPS in a deployed environment, or operational backup/restore drills. The application is developed and verified on the developer machine only.

An optional local Docker Compose path (nginx on host port 5173, unpublished API, optional Cloudflare quick tunnel to nginx port 8080) is a developer convenience for same-origin demos. It is **not** production HTTPS, staging, or the first production deployment described in `INFRASTRUCTURE_PLAN.md`.

## Feature specs

- `FEATURES/01_ACCESS_AND_USERS.md`
- Cross-cutting foundation from `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md` (history envelope and user-lifecycle events only)

## Scope

### Project foundation

- Frontend/backend project structure.
- TypeScript configuration.
- Modular feature conventions.
- Local PostgreSQL connection.
- Prisma baseline and migration workflow.
- Runtime validation/error conventions.
- Structured logging and error IDs (local).
- Test harness and CI checks runnable locally or in CI without deployment.

### Authentication and authorization

- Individual login by unique `username`.
- Administrator / Seller / Mechanic fixed role model.
- Session management.
- User activation/deactivation.
- Administrator user management.
- Server-side authorization.

### Minimum history

- Reusable event envelope.
- User-lifecycle events only in this release.

### Local development environment

- Local frontend/backend execution.
- Local PostgreSQL (native or container).
- `.env.example` with secret names only.
- Documented local setup and test commands.

## Intentionally not built

Invoices, customers, inventory, Work Orders, photos, CxC, CxP, staging, production deployment, managed backups, production HTTPS verification.

## Exit gate

- Access and Users is fully functional and tested in the **local environment**.
- Supported roles can authenticate locally; invalid, inactive, and unauthorized direct API requests fail.
- Migrations apply cleanly on a fresh local database.
- Feature 01 acceptance criteria and Release 1 history slice are covered by automated tests where applicable and by browser verification for UI flows.

---

# First production deployment (prerequisite before Release 2 goes live)

The **first production deployment** occurs only after **Release 2 — Billing Core** is complete. Until then, all releases through Release 1 are local-development releases.

Before the first real production use, complete the operational baseline defined in `INFRASTRUCTURE_PLAN.md`, including at minimum:

- hosting provider selection;
- owner-approved RPO/RTO;
- separate staging and production environments;
- HTTPS and secure cookies in deployed environments;
- secrets management outside source control;
- database backup and tested restore;
- deploy/rollback procedure;
- staging smoke tests appropriate to the functionality being deployed.

Release 1 work must not be blocked waiting for these decisions, but Release 2 must not go live without them.

---

# Release 2 — Billing Core

**Status: COMPLETED (local, 2026-09-11).** M25 exit gate closed: owner browser walkthrough plus unit, web, and API integration suites. Payments, CxC, and non-inventory cancellation were **pulled into this codebase** (see Release 3); they are not remaining R2 work. First production use still requires the operational gate above. This completion does **not** complete Release 3 or the Final MVP.

## Business outcome

The company can create, confirm, and print internal invoices before the complex inventory module is finished.

## Feature specs

Primary:

- `FEATURES/08_CUSTOMERS.md`
- `FEATURES/10_SALES_AND_INVOICES.md`
- `FEATURES/11_COST_AND_PROFITABILITY.md`
- `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`

Permissions:

- `FEATURES/01_ACCESS_AND_USERS.md`
- `ROLES_AND_PERMISSIONS.md`

## Scope

### Customers

- Customer search/create/edit.
- `Cliente contado`.
- Fiscal customer identity validation.
- Immutable completed-invoice customer snapshot.

### Invoice lifecycle

- Draft.
- Completed.
- Cancelled state exists in the domain; full physical restoration branches come later.
- Non-inventory **cancel/refund and payments** were pulled forward (Release 3 financial slice); they are implemented in this codebase, not deferred.
- DOP or USD per invoice.
- Shared unique never-reused `FAC-` numbering assigned only at successful confirmation.
- Decimal-safe per-line calculations.
- Invoice totals from already-rounded line values.

### Line types enabled in this release

Enable line types that do **not** require inventory synchronization:

- Generic free-form merchandise.
- Mechanical service.
- Delivery/shipping.
- External resale line may be enabled once its DOP cost/profit behavior from `FEATURES/11_COST_AND_PROFITABILITY.md` is complete.

Do **not** enable tracked-item or quantity inventory lines yet.

### Tax/output

- Fixed 18% included ITBIS for taxable merchandise lines.
- Service and delivery non-taxable.
- Internal printable PDF.
- Blank NCF field for external/manual process.
- No DGII integration.
- PDF regeneration from immutable invoice facts.

### Cost/profitability needed by enabled lines

- Negotiated final selling price.
- DOP acquisition cost where applicable.
- Actual/estimated/unknown behavior.
- Administrator-only profitability boundary.
- USD profitability may be completed here or before the first USD invoice requiring it goes live; FX failure must never invalidate the invoice.

## Critical temporary limitation

Release 2 invoices do not yet represent inventory-backed stock movements.

A generic/free-form or external-resale line must never:

- create local inventory;
- reserve local inventory;
- decrement local quantity;
- mark a tracked item Sold;
- change hierarchy;
- create a Work Order.

UI must not imply inventory synchronization for unsupported lines.

## Testing focus

- FAC concurrency/non-reuse.
- DOP/USD single-currency validation.
- tax-inclusive 18% calculations.
- two-decimal per-line rounding.
- immutable customer snapshot.
- PDF failure/regeneration.
- permission boundaries.
- unknown cost handling.
- retry/idempotency of confirmation.

## Exit gate

A Seller can:

1. select/create a customer or use Cliente contado where eligible;
2. create a Draft;
3. add supported non-inventory lines;
4. confirm a valid DOP/USD invoice;
5. receive a unique FAC number;
6. print/regenerate the internal PDF;

without any fake inventory side effect.

---

# Release 3 — Payments and Basic Accounts Receivable

**Status: PARTIALLY IMPLEMENTED (pulled forward during Release 2).** Do not re-implement the financial slice that already exists. **This release is not done:** remaining Feature 12 checklist items (and any other R3-owned open items) must still be implemented now that Release 2 is closed. Inventory/Work-Order cancellation is **not** part of this remainder (Releases 5/7).

## Business outcome

The company can immediately track credit sales and know who owes money.

## Feature specs

- `FEATURES/12_PAYMENTS_AND_ACCOUNTS_RECEIVABLE.md`
- financial portions of `FEATURES/13_CANCELLATION_AND_REFUNDS.md`
- `FEATURES/10_SALES_AND_INVOICES.md`
- `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`

## Scope

### Payments

- No initial payment / credit.
- Full payment.
- Partial payment.
- Multiple payments.
- Cash, transfer, and cheque payment methods using separate records.
- Same invoice currency.
- Additive ledger.
- Duplicate-submission protection.
- Fixed due date at the end of the local calendar day 30 days after confirmation.
- Derived Pending / Overdue / Paid / Paid late / Cancelled state.
- Derived outstanding balance.

### Basic Accounts Receivable

Deliver read models that answer:

- Who owes?
- Which invoice?
- In what currency?
- What was invoiced?
- What has been paid?
- What remains?

Required views:

1. Open receivables.
2. Customer outstanding summary grouped by currency.
3. Invoice receivable/payment detail.

### Early cancellation/refund

For invoices that have **no inventory effects**, implement:

- Administrator-only cancellation.
- Required reason.
- Additive same-currency cancellation refund when money was actually returned.
- Preserved original invoice/payment records.

## Intentionally deferred AR behavior

- aging buckets;
- credit limits;
- interest;
- installment plans;
- collection workflow;
- formal statements;
- automatic reminders;
- bank reconciliation.

## Exit gate

The owner can open one screen and determine every currently open customer balance by invoice and currency, then inspect its complete payment history.

---

# Release 3B — Basic Accounts Payable

## Status

**BLOCKED UNTIL VALIDATED.**

## Feature spec

- `FEATURES/15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md`

## Business outcome after validation

The company can record what it owes and supplier/creditor payments without waiting for a full purchasing/import/accounting module.

## Rule

Do not begin schema/API/UI implementation while the feature file says `PENDING VALIDATION`.

Once validated, rewrite that feature file with stable confirmed IDs/rules and implement only the minimum approved ledger.

## Recommended boundary

If approved, target:

- supplier/creditor identity;
- manually entered payable;
- original amount;
- currency;
- optional/required due date according to owner answer;
- partial/full/multiple supplier payments if approved;
- additive supplier-payment ledger;
- derived payable balance/state;
- open-payables view;
- supplier outstanding summary.

Do not automatically integrate:

- purchase orders;
- inventory receiving;
- imports/containers;
- landed cost;
- general ledger;
- bank reconciliation.

## Sequencing rule

If CxP validation is delayed, continue to Release 4. Release 3B does not block the rest of the already-confirmed MVP.

---

# Release 4 — Base Inventory

**Status: NOT STARTED in production API.** Prototype mock UI exists; do not mark inventory persistence complete. Mechanical service catalog is already Release 2.

## Business outcome

Register and find real stock accurately before linking it to invoice reservations/sales.

## Feature specs

- `FEATURES/02_INVENTORY.md`
- `FEATURES/03_QUANTITY_STOCK.md`
- `FEATURES/04_CATEGORIES_AND_ATTRIBUTES.md`
- `FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md`
- `FEATURES/11_COST_AND_PROFITABILITY.md`

## Scope

### Individually tracked items

- immutable internal identity (UUID + assigned public `internalCode`);
- practical minimum registration;
- enrichment later;
- separate inventory concepts;
- ordinary edits;
- protected correction.

### Quantity stock

- quantity products;
- normal receipts;
- weighted-average DOP cost;
- protected audited adjustments;
- availability derived from on-hand minus reserved.

### Categories

- category minimums/attributes;
- Tire/Rim validated fields;
- Administrator maintenance.

### Search/location/photos

- operational search;
- free-text location;
- independent-item location;
- item photos and primary image;
- historical sold search infrastructure as applicable.

### Cost

- DOP acquisition cost.
- actual / estimated / unknown.
- Seller/Admin cost visibility.
- Administrator protected correction.
- profitability access boundary.

## Temporary limitation

Hierarchical baseline/parent relationships are not enabled until Release 6.

Inventory in this release is operational as independent stock unless later baseline migration/registration is performed through the validated hierarchy feature.

## Exit gate

Real independent and quantity inventory can be registered, corrected through approved paths, searched, photographed, costed, and audited without hierarchy or sale coupling.

---

# Release 5 — Reservations and Inventory-Backed Sales

**Status: NOT STARTED in production API.** Prototype mock can add ITEM/QTY lines; HTTP API must keep rejecting them until this release.

## Business outcome

Invoices now synchronize with independent tracked items and quantity stock.

## Feature specs

- `FEATURES/09_RESERVATIONS.md`
- `FEATURES/10_SALES_AND_INVOICES.md`
- `FEATURES/03_QUANTITY_STOCK.md`
- `FEATURES/02_INVENTORY.md`
- `FEATURES/11_COST_AND_PROFITABILITY.md`
- applicable parts of `FEATURES/13_CANCELLATION_AND_REFUNDS.md`

## Scope

### Draft reservation

- unique-item holds;
- quantity holds;
- release on line removal/discard;
- consume at successful confirmation;
- no automatic expiry;
- Administrator abandoned-reservation recovery.

### Inventory invoice lines

- individually tracked item line;
- quantity product line;
- external resale remains non-local-stock line.

### Confirmation

- atomic independent tracked-item sale;
- atomic quantity consumption;
- revalidate reservation/state at confirmation;
- safe retry/conflict behavior.

### Financial integration

- existing payment/CxC behavior continues unchanged.
- invoice/payment state remains separate from inventory state.
- inventory-backed cancellations restore eligible commercial stock exactly once.

## Exit gate

Concurrent Drafts cannot oversell, a confirmed inventory invoice updates the correct stock atomically, and financial history remains consistent.

---

# Release 6 — Hierarchical Inventory and Received Assemblies

**Status: NOT STARTED in production API.** Prototype mock baseline/tree only.

## Business outcome

Represent how engines/trucks/assemblies physically arrive, including present and missing components, without using fake Work Orders.

## Feature specs

- `FEATURES/05_HIERARCHY_AND_BASELINE.md`
- expected-component portions of `FEATURES/04_CATEGORIES_AND_ATTRIBUTES.md`
- hierarchy-aware portions of `FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md`
- `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`

## Scope

- multi-level hierarchy;
- one current parent;
- cycle prevention;
- initial observed receipt baseline;
- PRESENT / MISSING / NOT_APPLICABLE;
- real identities only for PRESENT components;
- MISSING_AT_RECEIPT Known Missing Components;
- direct-parent completeness derivation;
- no completeness cascade;
- relationship history;
- protected baseline correction;
- `No desarmar`;
- effective root location for installed items;
- hierarchy-aware search.

## Critical rule

Initial receipt baseline is the only direct initial-parent establishment workflow.

After baseline, actual physical hierarchy change must wait for Release 7 Work Orders.

## Exit gate

A newly received assembly can be represented exactly as observed, including incomplete units, without phantom inventory or false physical-work history.

---

# Release 7 — Mechanic Work Orders and Installed/Assembly Sales

**Status: NOT STARTED in production API.** Prototype mock Work Orders only.

## Business outcome

Complete the product's core differentiator: sell installed parts while commercial sale and physical Desarme remain separate, controlled, and traceable.

## Feature specs

- `FEATURES/06_MECHANIC_WORK_ORDERS.md`
- hierarchy coordination from `FEATURES/05_HIERARCHY_AND_BASELINE.md`
- installed/assembly sale requirements in `FEATURES/10_SALES_AND_INVOICES.md`
- physical branches in `FEATURES/13_CANCELLATION_AND_REFUNDS.md`
- `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`

## Scope

### Work Orders

- Dismantling and Installation.
- one piece per order.
- Pending → In Progress → Completed.
- atomic Mechanic claim.
- assigned-Mechanic-only modification/completion.
- BEFORE/AFTER durable evidence.
- Administrator manual orders/recovery.
- immutable completed history.

### Installed-item sale

At confirmation:

- consume reservation;
- complete invoice;
- mark piece Sold;
- keep piece Installed;
- leave parent completeness unchanged;
- create/reuse active Dismantling Work Order;
- write linked history.

At Dismantling completion:

- close relationship;
- piece becomes Independent;
- Sold remains Sold;
- direct parent becomes Incomplete;
- higher ancestors unchanged.

### Installation

- Administrator creates order.
- creation does not change hierarchy.
- Mechanic completion creates valid relationship and resolves compatible missing condition.

### Complete assembly sale

- reject unstable delivered subtree while relevant active physical work exists;
- reread current tree after resolution;
- atomically sell root/current descendants;
- preserve immutable delivered hierarchy snapshot.

### Physical cancellation branches

Complete Pending / In-Progress / Completed Desarme invoice-cancellation behavior.

## Exit gate

The end-to-end validated path works under concurrency:

`Available + Installed`
→ Draft reservation
→ invoice confirmation
→ `Sold + Installed` + active Desarme
→ Mechanic evidence/completion
→ `Sold + Independent`
→ direct parent `Incomplete`

with linked immutable history.

---

# Release 8 — Administration, Recovery, Hardening, and MVP Acceptance

**Status: PARTIAL.** Failed-PDF regenerate is already in the sales/PDF API and invoice HTTP UI. Pending-FX retry lives on the profitability API, not on a recovery router. Other ADMIN-002 commands, diagnostics, and production operational hardening remain this release.

## Business outcome

Close the remaining confirmed Final-MVP requirements and make the integrated system supportable without raw database intervention.

## Feature specs

- `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`
- every feature spec for final regression.

## Scope

### Protected administration

- user/catalog controls;
- acquisition-cost correction;
- initial-baseline correction;
- completed/no-payment invoice currency correction;
- `No desarmar`;
- other confirmed protected operations.

### Recovery

- abandoned Draft/reservation release;
- Work-Order release/reassign/cancel;
- PDF regeneration;
- evidence upload recovery where safe;
- pending USD profitability retry.

### Diagnostics

- negative/invalid quantity state;
- orphan/stuck reservations;
- multiple parents/cycles;
- duplicate active physical operations;
- impossible Work-Order state/evidence;
- impossible invoice/payment/refund balances;
- unresolved profitability;
- cross-store PDF/photo/evidence inconsistencies where applicable.

### Final operational readiness

- full authorization regression;
- PostgreSQL concurrency regression;
- backup/restore drill including object storage now in use;
- migration dry run;
- production security review;
- monitoring/alerting checks;
- documented incident/recovery procedures;
- controlled pilot.

## Final MVP gate

The MVP is accepted only when:

- every `CONFIRMED` requirement in `FEATURES/01` through `FEATURES/14` has a passing acceptance path;
- no temporary release limitation contradicts the final behavior;
- production recovery does not require arbitrary SQL edits;
- the owner validates the integrated workflows;
- any unfinished CxP item is classified separately according to its owner-approved status rather than silently counted as completed MVP behavior.

---

# 4. Recommended Git/work unit strategy

For each checklist item or small vertical slice:

1. create a short-lived feature/fix branch;
2. implement one coherent behavior;
3. add/update automated tests in the same branch;
4. run lint/typecheck/unit/integration checks;
5. review the diff;
6. merge only releasable changes to `main`;
7. use feature visibility/route availability to keep later-release behavior inaccessible rather than maintaining long-lived environment branches.

Tag production releases.

---

# 5. Definition of “feature complete”

A feature is not complete because its CRUD screens exist.

It is complete when:

- its confirmed requirement IDs have automated or clearly documented acceptance coverage;
- authorization matches `ROLES_AND_PERMISSIONS.md`;
- its cross-feature state transitions match `USE_CASE_FLOWS.md`;
- concurrent/retry behavior is safe where applicable;
- history is written correctly;
- unsupported behavior fails safely;
- migrations and rollback/recovery implications are understood;
- the feature can be operated in the active production release without depending on unfinished UI illusions or manual database editing.
