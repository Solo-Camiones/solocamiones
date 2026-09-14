# FEATURES — Cursor Reading Guide

## Why this folder exists

The former monolithic requirement/validation documents were split into implementation-sized feature specifications.

Each confirmed feature file contains:

- what the feature does;
- delivery timing;
- architecture/implementation guidance;
- feature-level acceptance criteria;
- implementation checklist;
- the **full canonical validated requirement blocks and stable IDs** that apply to that feature.

This folder replaces the need for:

- `MVP_REQUIREMENTS.md`;
- `Requerimientos.md`;
- `Latest-validated-business-answers.md`;
- `OPEN_DECISIONS.md`;
- `PROJECT_CONTEXT.md`.

## Cursor reading rule

Do **not** load every feature file for every task.

For implementation work:

1. Read `../DEVELOPMENT_PLAN.md`.
2. Identify the active release and feature.
3. Read only the matching feature file(s).
4. Read `../ARCHITECTURE_PLAN.md` when architecture/module/transaction guidance is needed.
5. Read `../ROLES_AND_PERMISSIONS.md` for authorization work.
6. Read `../USE_CASE_FLOWS.md` for multi-step business-flow work.
7. Read `../INFRASTRUCTURE_PLAN.md` only for deployment/storage/operations work.
8. Read `../PROTOTYPE_PLAN.md` only for UX/prototype comparison work.
9. Read `../FUTURE_ROADMAP.md` to confirm that an idea is intentionally outside the MVP.

## Source-of-truth rule

For detailed feature behavior, the relevant `FEATURES/*.md` file is authoritative.

Stable requirement IDs remain in the specs for acceptance tests and traceability.

`15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md` is intentionally different: it is **not confirmed scope yet**. Cursor must not implement it until its blocking business questions are answered and the file is promoted to CONFIRMED.

Checklist `[x]` in a feature file may mean **prototype mock**, **production API**, or **HTTP UI**. The snapshot in `../DEVELOPMENT_PLAN.md` is the authority for what is live in PostgreSQL/HTTP. Do not re-implement a later slice that the snapshot already marks done.

## Feature index

| File | Feature | Planned delivery | Production implementation (2026-09-10) |
|---|---|---|---|
| `01_ACCESS_AND_USERS.md` | Authentication, roles, user management, authorization | Release 1 | Done (API + HTTP) |
| `02_INVENTORY.md` | Individually tracked inventory | Release 4 | **Not started** in API; prototype UI only |
| `03_QUANTITY_STOCK.md` | Quantity inventory and weighted-average stock | Release 4 | **Not started** in API; prototype UI only |
| `04_CATEGORIES_AND_ATTRIBUTES.md` | Categories, attributes, expected definitions | Release 4/6 | **Not started** in API. Mechanical **services** catalog is Release 2 (`/api/catalogs/services`), not this file |
| `05_HIERARCHY_AND_BASELINE.md` | Assemblies, receipt baseline, completeness, No desarmar | Release 6 | **Not started** in API; prototype UI only |
| `06_MECHANIC_WORK_ORDERS.md` | Desarme/Installation orders and evidence | Release 7 | **Not started** in API; prototype UI only |
| `07_SEARCH_LOCATION_AND_PHOTOS.md` | Search, effective location, photos | Release 4/6 | **Not started** in API; prototype search UI only |
| `08_CUSTOMERS.md` | Customers, Cliente contado, invoice snapshot | Release 2 | Done (API + HTTP) |
| `09_RESERVATIONS.md` | Draft-linked inventory reservations | Release 5 | **Not started** in API; some mock recovery UI `[x]` |
| `10_SALES_AND_INVOICES.md` | Invoice lifecycle, line types, taxes, PDF, sale confirmation | Release 2/5/7 | **R2 done** (non-inventory + PDF). ITEM/QTY/installed **API not started** (409 / capabilities off). Confirm may include pulled-forward initial payment |
| `11_COST_AND_PROFITABILITY.md` | DOP cost, profit, USD FX enrichment | Release 2/4/5 | **API done** for invoice-line cost/FX/profit. **HTTP UI done (R2 M24)**. Inventory cost correction **not** in API |
| `12_PAYMENTS_AND_ACCOUNTS_RECEIVABLE.md` | Payments, balances, basic CxC | Release 3 | **Pulled forward — core API + HTTP done. Release still open:** remaining checklist filters must still be implemented now that R2 is closed |
| `13_CANCELLATION_AND_REFUNDS.md` | Cancellation, refunds, restoration | Release 3/5/7 | **Financial/non-inventory pulled forward — API + HTTP done**. Inventory/WO branches **mock only** |
| `14_HISTORY_ADMIN_AND_RECOVERY.md` | History, protected corrections, recovery, diagnostics | Cross-cutting/Release 8 | Envelope + owning-feature events **partial**. Invoice detail activity timeline **done** (document-level only). PDF regenerate **done**. FX retry on profitability API. Rest of ADMIN-002/diagnostics **open** |
| `15_ACCOUNTS_PAYABLE_PENDING_VALIDATION.md` | Basic CxP proposal | Pending validation | Do not implement |
