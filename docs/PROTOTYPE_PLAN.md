# PROTOTYPE PLAN — Validated Figma Make Reference

## Purpose

This document defines what the current Figma Make prototype demonstrates and what product/UI behavior it is intended to validate. It is a **design and workflow reference**, not a production implementation contract.

Business rules belong in `FEATURES/*.md`. Implementation order belongs in `DEVELOPMENT_PLAN.md`.

Cursor should consult this document only when implementing or reviewing UI/UX behavior that should match the approved prototype.

---

# 1. Prototype Status

The current prototype is a broad interactive demonstration of the final product concept. It includes more than the first production release and therefore must **not** be interpreted as the development sequence.

The production application will be implemented incrementally according to `DEVELOPMENT_PLAN.md`.

The prototype may show functionality from later releases before that functionality exists in production.

---

# 2. Product Experience Demonstrated

The prototype presents one responsive operational system named **SoloCamiones** with three role-specific experiences:

- Administrator
- Seller
- Mechanic

Administrator and Seller work primarily in the desktop operational shell. Mechanic receives a separate restricted, mobile-first Work Order interface.

The prototype demonstrates that commercial, financial, inventory, and physical-work states remain distinct rather than collapsing into one generic status.

Important concepts visible in the UI include:

- Commercial availability: Available / Sold.
- Physical relationship: Installed / Independent.
- Parent completeness: Complete / Incomplete.
- Invoice state: Draft / Completed / Cancelled.
- Payment state and outstanding balance.
- Work Order state: Pending / In Progress / Completed / eligible cancellation.

---

# 3. Main Navigation by Role

## Administrator

The prototype exposes:

1. Dashboard
2. Inventory
3. Sales and Invoices
4. Customers
5. Work Orders
6. Catalogs
7. Users
8. Profitability
9. Administration and Recovery

## Seller

The production HTTP UI for Seller exposes:

1. Dashboard
2. Inventory
3. Sales and Invoices (including quotes)
4. Customers (`CASH` create; no credit-term fields)

Seller must not see Accounts Receivable, later-payment actions, billing cost fields, or payment-movement lists. Prototype mocks that still show Seller CxC or tax-inclusive-only POS are stale relative to Features 08/10/12.

## Mechanic

Mechanic does not use the commercial sidebar. The role opens directly into the restricted Work Order experience.

The Mechanic interface must not expose customer, invoice, selling-price, acquisition-cost, payment, balance, refund, margin, or profitability information.

---

# 4. Login and Demo Controls

The current prototype uses simulated authentication for demonstration.

It provides demo users representing the three supported roles and allows a presenter to enter predefined scenarios quickly.

Prototype-only controls include:

- switching role without real authentication;
- resetting seeded demo data;
- selecting predefined demo scenarios;
- simulated password/error behavior.

These controls are not production requirements.

---

# 5. Dashboard

## Purpose

Provide a quick operational overview appropriate to the current user's permissions.

## Demonstrated information

Examples include:

- available inventory;
- invoices created today;
- outstanding customer balance;
- open Drafts or Administrator-only gross profit;
- pending Dismantling Work Orders;
- Work Orders in progress;
- incomplete assemblies;
- recent invoices and activity;
- pending USD profitability calculations for Administrator.

## Prototype interpretation

Dashboard metrics are useful reference designs, but each metric should only be implemented when the underlying feature exists in the active production release.

For example, the first billing release should not require Work Order or hierarchical-inventory KPIs.

---

# 6. Inventory Experience

## Inventory list

The prototype shows both individually tracked inventory and quantity stock.

The list communicates important concepts independently:

- commercial state;
- physical relationship/current parent;
- completeness;
- reservation status;
- inventory mode;
- `No desarmar` restrictions where applicable.

An installed item remains visible as inventory rather than disappearing into its parent assembly.

## Inventory registration

The prototype demonstrates a multi-step registration experience.

### Standard item/product information

Representative inputs include:

- immutable internal identity (assigned public code; production adds a UUID key);
- name;
- category;
- condition;
- brand;
- model;
- part number;
- serial;
- acquisition cost in DOP;
- cost provenance;
- free-text location;
- category-specific attributes;
- notes;
- photos.

### Quantity stock

Quantity mode additionally demonstrates:

- initial quantity;
- unit acquisition cost;
- later merchandise receipts;
- weighted-average cost behavior;
- Administrator-only audited balance adjustment.

### Received assembly baseline

For assembly categories, the prototype contains a second registration step for observed composition at receipt.

It demonstrates classification of expected components and derived completeness without pretending that receipt registration is a Mechanic Work Order.

The exact domain rules remain defined in the Hierarchy/Baseline feature specification.

---

# 7. Inventory Detail

The detail screen is intended to provide one place to understand the current item and its history.

Depending on item type and role, it may show:

- identity and descriptive information;
- commercial state;
- physical relationship;
- current parent;
- effective/free-text location;
- completeness;
- acquisition cost visibility;
- photos;
- hierarchy/descendants;
- quantity balances;
- Work Orders;
- historical events;
- protected Administrator operations.

The production implementation should progressively expose these sections as their corresponding releases become available rather than building all detail functionality at once.

---

# 8. Sales and Invoice Experience

## Sales list

The prototype provides a central `Ventas y Facturas` area for Draft and completed invoices.

A completed invoice keeps its immutable historical information while payments, refunds, and other additive events appear separately.

## Point of Sale / Draft editor

The prototype demonstrates one invoice editor capable of eventually handling several line types:

- individually tracked inventory item;
- quantity product;
- generic merchandise;
- externally sourced resale part;
- mechanical service;
- delivery/shipping.

The production application must **not enable all line types immediately** merely because the prototype displays them.

Early Billing Core should enable only the line types assigned to that release in `DEVELOPMENT_PLAN.md` and the applicable feature specifications.

## Invoice behavior demonstrated

The prototype shows:

- Draft has no `FAC-` number yet;
- exactly one invoice currency, DOP or USD;
- negotiated final price per line;
- taxable versus non-taxable lines;
- included ITBIS breakdown;
- invoice totals;
- customer selection;
- confirmation;
- completed invoice detail;
- printable internal invoice/PDF representation;
- payments and outstanding balance;
- cancellation/refund flows;
- Administrator-only profitability and protected currency correction.

## Installed-item warning

When an installed item is included in a Draft, the prototype explicitly explains that invoice confirmation represents the commercial sale, not physical removal.

The intended later-state transition is:

```text
Available + Installed
        ↓ invoice confirmation
Sold + Installed
        ↓ Dismantling Work Order completion
Sold + Independent
```

The direct parent remains Complete until the valid physical Dismantling Work Order is completed.

---

# 9. Payments and Basic Accounts Receivable

The current prototype already demonstrates invoice-level payment behavior:

- no payment;
- partial payment;
- multiple payments;
- different payment methods through separate payment records;
- current paid amount;
- outstanding balance;
- additive payment/refund history.

The Dashboard also demonstrates the concept of a total outstanding customer balance.

For the production **Basic Accounts Receivable** release, treat the prototype as visual direction for Administrator invoice payment detail and open-receivables, plus:

- derived labels `PENDIENTE` / `ABONADO` / `VENCIDA` / `ABONADA VENCIDA`;
- issued date = confirmation date;
- searchable customer selector and `Generar estado de cuenta` (STMT-001).

Seller does not use this area. Accounts Payable is not part of this prototype's active MVP implementation plan.

---

# 10. Customers

The prototype includes a dedicated customer area and customer selection during billing.

The UI direction supports:

- searching customers;
- creating customers;
- internal `CASH` / `CREDIT` as fields, never as name prefixes;
- Administrator-only credit limit and term;
- generic `Cliente Contado` behavior;
- preserved invoice customer data.

This is not intended to become a CRM.

---

# 11. Work Orders — Administrator/Seller Context

The prototype contains an operational Work Order area for the authorized desktop roles.

It demonstrates:

- Dismantling and Installation Work Orders;
- order type;
- status;
- affected piece;
- source/destination context;
- evidence visibility;
- manual order creation where authorized;
- Administrator cancellation/recovery actions.

The exact permissions and transaction behavior remain governed by `ROLES_AND_PERMISSIONS.md`, `USE_CASE_FLOWS.md`, and the Work Orders feature specification.

---

# 12. Mechanic Mobile Experience

The Mechanic prototype is deliberately separate from the commercial application experience.

## Queue

Mechanic can view eligible Pending Work Orders and open an order.

## Claim

Mechanic can take a Pending order. Production must make this claim atomic so two Mechanics cannot both acquire the same order.

## Execution

For the assigned order, the prototype demonstrates:

- physical item/context;
- Work Order type and state;
- technical information;
- BEFORE evidence;
- AFTER evidence;
- optional new free-text location for a dismantled piece;
- completion only after required evidence exists.

## Completion

The UI should make the distinction clear:

> Invoice confirmation records the commercial event. Mechanic completion records the physical event.

---

# 13. Catalogs

Administrator prototype surfaces include management of:

- inventory categories;
- expected-component definitions for assembly categories;
- mechanical-service catalog entries.

Catalog definitions are configuration, not physical inventory.

Seller may use appropriate catalog data but does not maintain these catalogs.

---

# 14. Users and Permissions

The Administrator prototype demonstrates:

- creating users;
- assigning one of the supported roles;
- activating/deactivating users;
- displaying account state.

Production authorization must be enforced server-side. Hiding navigation options is only the UX layer, not the security mechanism.

---

# 15. Profitability

The Administrator-only prototype demonstrates:

- gross profit by invoice;
- separate DOP and USD profitability results;
- pending USD profitability when the required FX rate is unavailable;
- retrying the profitability calculation later;
- preserving the invoice sale regardless of FX-provider availability.

This screen is intentionally absent from Seller and Mechanic navigation.

---

# 16. Administration and Recovery

The Administrator prototype demonstrates a controlled recovery surface rather than unrestricted database editing.

Representative operations shown include:

- releasing stuck/abandoned reservations;
- retrying pending USD profitability calculations;
- reviewing active Work Orders for reassignment/cancellation;
- navigating to protected cost corrections;
- navigating to invoice/PDF recovery operations.

Production recovery actions must remain named, authorized, auditable business operations.

---

# 17. Primary Prototype Scenarios

The Figma Make prototype includes quick-entry demonstration scenarios representing:

1. Sale of an installed piece.
2. Manual dismantling.
3. Installation of a piece.
4. Initial engine/assembly registration.
5. Complete assembly sale.
6. Sale blocked by `No desarmar`.
7. Partial and multiple payments.
8. Cancellation with Pending Work Order.
9. Cancellation with In-Progress Work Order.
10. Cancellation after Completed Dismantling.
11. USD sale with pending profitability calculation.
12. Administrative recovery.

These are useful regression/demo stories, but they do not define development order.

---

# 18. Recommended Owner Demonstration

For owner approval, do not demonstrate every screen equally. Use a business-first walkthrough.

## Part A — Immediate priority: billing and collections

1. Login as Seller.
2. Open Sales and Invoices.
3. Create/select a `CASH` customer or use `Cliente Contado`.
4. Create a Draft; leave `Aplicar ITBIS` off unless the scenario needs tax.
5. Add representative billable lines (no cost fields).
6. Set final negotiated prices as tax-exclusive base when ITBIS is on.
7. Confirm a cash sale and show the assigned `FAC-` number.
8. Open the completed invoice; Seller sees balance/state, not payment movements.
9. Switch to Administrator to register a later payment on a credit invoice and open CxC.
10. Generate an account statement for a customer with open DOP balance.
11. Show a quote issue (`COT-`) and conversion to `FAC-` when that slice is in the demo build.

## Part B — Product differentiator

1. Search for an installed item.
2. Add it to a Draft.
3. Show the installed-item warning.
4. Confirm the sale.
5. Show `Sold + Installed` and the Pending Dismantling Work Order.
6. Switch to Mechanic.
7. Take the order.
8. Add BEFORE and AFTER evidence.
9. Complete it.
10. Show `Sold + Independent` and direct-parent Incomplete.

## Part C — Administrator control

Briefly show:

- user/role management;
- catalogs;
- profitability visibility;
- recovery controls.

The goal is to validate the product direction without implying that every screen will ship in the first release.

---

# 19. What the Prototype Does NOT Authorize

The prototype does not by itself authorize:

- implementing a feature earlier than `DEVELOPMENT_PLAN.md` schedules it;
- copying Figma Make's in-memory/mock architecture into production;
- using simulated authentication in production;
- storing business state only in frontend state;
- trusting UI permission hiding instead of backend authorization;
- implementing demo reset/role-switch/scenario controls in production;
- treating simulated payments as payment-gateway integration;
- treating demo photo buttons as the production upload pipeline;
- treating every dashboard KPI as Release 1 scope;
- implementing Accounts Payable;
- DGII/NCF/e-CF integrations that remain outside MVP.

---

# 20. Cursor Usage Rule

When implementing UI:

1. Read `DEVELOPMENT_PLAN.md` to identify the active release.
2. Read the applicable `FEATURES/*.md` specification.
3. Use this document to understand the approved prototype's interaction and visual intent.
4. Inspect the relevant Figma screen when pixel/layout details matter.
5. Do not implement later-release controls merely because they exist in Figma.
6. Adapt the prototype to the real architecture and production state model rather than copying Figma Make's demo store/business logic blindly.

---

# 21. Approval Checklist

Before treating the prototype as approved, confirm with the owner that:

> This is a stakeholder-validation checklist, not an implementation checklist. Passing automated
> tests or completing an internal UX walkthrough does not mark these items as approved.

- [ ] Billing workflow is understandable and matches daily operation.
- [ ] Customer selection and `Cliente Contado` behavior are acceptable.
- [ ] Invoice line types and negotiated-price interaction are understandable.
- [ ] Invoice totals/ITBIS presentation is acceptable for internal use.
- [ ] Completed invoice and printable-document direction is acceptable.
- [ ] Partial-payment and outstanding-balance workflow solves the immediate collections problem.
- [ ] Seller navigation contains the right operational areas.
- [ ] Administrator-only financial/protected screens are appropriately restricted.
- [ ] Installed-item sale behavior is understandable.
- [ ] `Sold + Installed` before physical Dismantling is acceptable.
- [ ] Mechanic mobile workflow contains enough physical information without exposing commercial data.
- [ ] BEFORE/AFTER evidence requirement is operationally realistic.
- [ ] Inventory registration workflow reflects how assemblies and components are actually received.
- [ ] No-desarmar behavior matches yard policy.
- [ ] Major terminology and labels used in the UI are acceptable to staff.
- [ ] No critical workflow required for the first Billing + Accounts Receivable releases is missing from the prototype/design.

After approval, changes should be treated as controlled product changes rather than silently changing validated behavior during implementation.
