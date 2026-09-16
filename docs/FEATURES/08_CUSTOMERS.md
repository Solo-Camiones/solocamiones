# Feature 08 — Customers and Invoice Customer Snapshot

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `CUST-001, CUST-002, CUST-003, CUST-004, CUST-005, CUST-006, CUST-007`.

`CUST-004` through `CUST-007` were added 2026-09-15 as the canonical customer/credit rules for the pre-production business change set. Do not implement those IDs from `docs/pre_production_business_changes/IMPLEMENTATION_PLAN.md`; this file is authoritative.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 2 — Billing Core**

**Implementation (2026-09-10):** Production API + HTTP UI done for `CUST-001`–`CUST-003` (`/api/customers`, POS customer select, confirmation snapshot).

**Pre-production change set (2026-09-15):** `CUST-004`–`CUST-007` are specified. Paso 2 persisted `customerType` / limit / term with a `CASH` backfill. Paso 3 implements Administrator/Seller write rules, classification history, and the directory filter.

## What this feature does

Support reusable customer information, a default `Cliente contado` for eligible nonfiscal sales, an internal `CASH` / `CREDIT` classification with Administrator-owned credit terms, and immutable customer details on completed invoices.

## Architecture ownership

Primary logical module: **customers**.

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

Customers are lightweight reusable records, not a CRM. Keep name, contacts, RNC/Cédula, address, notes, internal `customerType`, and credit terms only when the type is `CREDIT`.

Provide a stable generic customer such as `Cliente contado` for eligible nonfiscal counter sales. That generic identity remains `CASH`, cannot satisfy fiscal RNC/Cédula requirements, and cannot be sold on credit.

`customerType` is an internal classification independent of `name`. Do not prefix names with “contado” or “crédito”. The only record that keeps the literal name `Cliente contado` is the generic default customer.

Integrity:

- `CASH`: `creditLimitDop` and `creditTermDays` must be null.
- `CREDIT`: RNC/Cédula, a positive DOP limit, and a term of 30, 45, 60, 90, or 120 days are required.
- The API rejects invalid combinations; it never silently ignores extra credit fields.
- Existing named customers backfill as `CASH` without renaming anyone. Promotion to `CREDIT` is an explicit Administrator operation.

Authorization:

- Administrator may create and edit `CASH` and `CREDIT`, including limit and term.
- Seller may create only `CASH` customers and may not change type, limit, or term.
- Seller may select an existing `CREDIT` customer on a sale; that is not a customer-maintenance permission.

A customer may have **multiple contacts** (name, phone, email, optional title). Phone and email belong on contacts, not on the customer record. Contacts may be empty (`Cliente Contado`). Directory search remains name/RNC only.

At invoice confirmation, copy the applicable customer data into an immutable invoice customer snapshot, including type and credit terms then in force. This includes the primary contact's phone; if that contact has no phone, preserve a blank value without falling back to another contact. Later edits to the reusable customer record must not alter already completed invoices. Historical invoices keep the phone blank when its confirmation-time value cannot be reconstructed reliably.

## Feature-level acceptance criteria

- Seller/Administrator can find, create, and edit ordinary customer data.
- Seller can create only `CASH` customers; Administrator can create/edit `CASH` and `CREDIT`.
- Eligible nonfiscal sale can use `Cliente contado`.
- `Cliente contado` cannot be sold on credit: confirmation requires a full initial payment equal to the invoice total.
- `CREDIT` requires RNC/Cédula, positive DOP limit, and an allowed term; `CASH` forbids those credit fields.
- A named `CASH` customer with valid RNC/Cédula may receive a fiscal-value invoice; the generic default customer never may.
- A `CREDIT` customer with open balance cannot be changed to `CASH`.
- Paying an invoice does not change customer type.
- Classification, limit, and term changes record `before/after` history.
- Fiscal-value invoice rejects missing required customer identity.
- Completed invoice preserves its customer snapshot when the source customer is later edited.
- Mechanic has no customer access.

## Implementation checklist

### Backend

- [x] Define customer record and generic-customer strategy. _(API R2 M1: `Customer` + `Cliente contado`; prototipo mock: C0 bloqueado)_
- [x] Implement create/search/edit. _(API R2 M2: `/api/customers`; WM4 mock)_
- [x] Implement fiscal identity validation hook used by Sales. _(API R2 M2: `satisfiesFiscalIdentity`; confirmación fiscal en M7/M12)_
- [x] Implement immutable invoice customer snapshot at confirmation. _(prototipo mock — WM8; API: `customerName`, `customerRnc` y teléfono principal al confirmar)_
- [x] Prevent completed snapshots from following later customer edits. _(prototipo mock — WM8; API R2 M12: GET completed usa el snapshot)_

### Frontend

- [x] Customer search/select/create inside Draft flow. _(WM8: selector en POS; alta sigue en `/customers`)_
- [x] Default `Cliente contado` behavior. _(WM8 `createDraft` usa C0; fiscal lo rechaza; confirmación HTTP/API exige pago inicial completo — owner 2026-09-11)_
- [x] Fiscal-required field feedback. _(checkbox bloqueado + rechazo en servicio)_
- [x] Basic customer maintenance. _(WM4 mock; API R2 M19 HTTP `/customers`)_
- [x] Multiple contacts on a customer. _(prototipo mock — lista dinámica; `prepareCustomerSave`)_

### Tests

- [x] Generic nonfiscal sale succeeds. _(prototipo mock — C0 + `fiscal: false`; API: pago inicial completo)_
- [x] Generic fiscal sale rejected. _(prototipo mock — WM8)_
- [x] Later customer edit leaves completed invoice unchanged. _(prototipo mock — WM8 snapshot; API R2 M12 HTTP)_
- [x] Mechanic access denied. _(WM4 mock `customers.manage`; API R2 M19 HTTP 403 y sin nav)_

### Pre-production customer type and credit

- [x] Persist `customerType`, `creditLimitDop`, and `creditTermDays` with the integrity rules in CUST-004/CUST-005. _(API Paso 2: columnas + CHECK SQL; escritura HTTP en Paso 3)_
- [x] Backfill existing named customers as `CASH` without renaming them; keep the generic customer `CASH`.
- [x] Administrator create/edit of `CREDIT`; Seller create-only `CASH` with HTTP 403 on credit fields. _(API + HTTP UI + mock Paso 3; Seller cannot PATCH existing CREDIT customers)_
- [x] Block `CREDIT` → `CASH` while open receivable balance exists; record classification/limit/term history. _(Open completed balance in DOP or USD; `CUSTOMER_UPDATED` before/after)_
- [x] Allow fiscal-value invoices for named `CASH` customers with valid RNC/Cédula (CUST-007). _(Already `satisfiesFiscalIdentity`; named cash with RNC remains fiscally eligible)_

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### CUST-001 — Basic Customer Records

**Name:** Reusable customer information  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Users may create and find customers using name, phone, RNC/Cédula, address, and notes as applicable.  
**Business Reason:** Sales need buyer identity without building a CRM.  
**Main Flow:** User finds an existing customer or creates one during a draft.  
**Business Rules:** Nonfiscal sales require only the approved minimum.  
**Important Exceptions/Edge Cases:** Duplicate-person handling should not block a sale unless a required fiscal identifier conflicts.  
**Dependencies:** AUTH-001.  
**Acceptance Notes:** Customer creation and selection work without losing draft contents.

---

### CUST-002 — Generic Customer

**Name:** Default cash customer  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** The system must permit a generic default customer such as `Cliente contado` for eligible nonfiscal sales.  
**Business Reason:** Many counter sales do not require named-customer registration.  
**Main Flow:** User retains the default customer and completes a nonfiscal invoice.  
**Business Rules:** Generic customer cannot satisfy a fiscal requirement for customer RNC/Cédula. Generic customer is always `CASH` and cannot be sold on credit: confirmation must record an initial payment equal to the invoice total (owner decision 2026-09-11). Credit terms apply only to customers classified `CREDIT` under CUST-004/CUST-005, not to every named customer.  
**Important Exceptions/Edge Cases:** A sale requiring fiscal identification must select or create a qualifying customer. Confirming `Cliente contado` without a full initial payment is rejected and does not assign a `FAC-` number.  
**Dependencies:** CUST-001, CUST-004, SALE-003, SALE-005.  
**Acceptance Notes:** Nonfiscal generic sale succeeds when paid in full at confirmation; fiscal validation rejects missing required identity; credit terms on `Cliente contado` are rejected.

**Amended 2026-09-15:** Named customers are no longer implicitly credit-eligible; that rule moved to CUST-004/CUST-005.

---

### CUST-003 — Invoice Customer Snapshot

**Name:** Preserve customer details used at sale  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A completed invoice must preserve the customer identity and details used at confirmation, including required RNC/Cédula for fiscal documents.  
**Business Reason:** Later customer edits must not rewrite issued documents.  
**Preconditions:** A valid draft and customer selection exist.  
**Main Flow:** Confirmation copies the applicable customer information into the invoice record.  
**Business Rules:** Fiscal documents require the validated fiscal identity fields.  
**Important Exceptions/Edge Cases:** Final PDF placement and legal/footer presentation of fiscal fields remain later output-design details; they do not reopen core invoice behavior.  
**Dependencies:** CUST-001, CUST-002, CUST-004, CUST-005, SALE-003.  
**Acceptance Notes:** Editing a customer after sale does not change the completed invoice. Snapshot includes confirmation-time type and credit terms once CUST-004/CUST-005 exist.

---

### CUST-004 — Customer Type

**Name:** Internal cash or credit classification  
**Status:** CONFIRMED  
**Actors:** Administrator (write type); Seller (read/select; create `CASH` only)  
**Requirement:** Every customer has an internal `customerType` of `CASH` or `CREDIT`. The classification is independent of `name` and must never be written into the visible customer name as a prefix or suffix.  
**Business Reason:** Credit is an authorized commercial condition, not a naming convention.  
**Main Flow:** Administrator sets type when creating or editing a customer. Seller creates only `CASH` customers and may later select an existing `CREDIT` customer on a sale.  
**Business Rules:** The generic `Cliente contado` remains `CASH`. Existing named customers backfill as `CASH` without any rename. The API rejects Seller attempts to create or assign `CREDIT`. Paying or partially paying invoices does not change type.  
**Important Exceptions/Edge Cases:** Changing `CREDIT` to `CASH` is forbidden while the customer has open receivable balance (CUST-006). USD invoices cannot use credit even for a `CREDIT` customer (SALE-005, CUST-005).  
**Dependencies:** CUST-001, CUST-002, AUTH-005.  
**Acceptance Notes:** Directory and POS show the customer name unchanged. Filters may expose type as a separate field. A Seller POST that sets `customerType=CREDIT` is rejected with 403. After migration, every existing named customer is `CASH`.

---

### CUST-005 — Credit Limit and Term

**Name:** DOP credit limit and fixed term  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** A `CREDIT` customer must have a positive `creditLimitDop` and a `creditTermDays` value of 30, 45, 60, 90, or 120. A `CASH` customer must have both fields null. Credit and its limit exist only in DOP.  
**Business Reason:** Exposure and due dates must be explicit, currency-safe, and not Administrator-overridable at confirmation.  
**Main Flow:** Administrator enters limit and term when classifying a customer as `CREDIT`. Confirmation copies the then-current type and term onto the invoice snapshot. For a credit invoice, `dueDate` is the local confirmation date plus **that customer's chosen `creditTermDays`**, not a universal +30.  
**Business Rules:** Limit is greater than zero. Credit confirmation is allowed only in DOP. The former Release 3 rule “every invoice due date = confirmation + 30 calendar days” is withdrawn for **new credit invoices**. Allowed terms are only 30, 45, 60, 90, or 120; if the Administrator chooses 30, the due date happens to be +30 because that is the customer term, not because 30 is hard-coded. The due date is snapshotted at confirmation; later edits to the customer term do not rewrite completed invoices. Existing completed invoices keep their already stored due dates. Open credit exposure is existing unpaid completed DOP balances plus the new invoice’s remaining balance after any initial payment the actor is allowed to record. Confirmation must reject the sale, including when the actor is Administrator, if that sum would exceed the limit. The check runs inside the same serializable transaction that assigns `FAC-`. Seller confirms credit with zero initial payment, so the new exposure is the full invoice total. Administrator may record a partial initial payment on credit confirmation; only the resulting balance counts toward the limit. `CASH` confirmation must settle the gross total in full. Invalid payloads (limit/term on `CASH`, missing limit/term on `CREDIT`, non-allowed term, non-DOP credit) are validation errors, not ignored fields.  
**Important Exceptions/Edge Cases:** Two concurrent credit confirmations against the same customer must not both succeed if together they would exceed the limit. The profitability FX rate is never used to convert limits, payments, or balances. Zero is not an approved “blocked credit” sentinel.  
**Dependencies:** CUST-004, SALE-005, PAY-001, HIST-001.  
**Acceptance Notes:** A `CREDIT` customer with limit `10000.00` and two concurrent confirmations of `6000.00` each yields exactly one completed invoice and one conflict. A USD draft for a `CREDIT` customer cannot confirm with a remaining balance. Seller cannot send a credit initial payment. Administrator can confirm credit with a partial payment of `2000.00` on a `5000.00` invoice when remaining open exposure plus `3000.00` stays within the limit. A customer with `creditTermDays = 45` confirmed on 2026-09-15 has `dueDate` at end of 2026-10-30 in `America/Santo_Domingo`, not 2026-10-15. A customer with term 90 confirmed the same day is due 2026-12-14, not +30.

---

### CUST-006 — Credit Classification Changes

**Name:** History and restrictions on type, limit, and term  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Changes to `customerType`, `creditLimitDop`, and `creditTermDays` must append `before/after` history. A `CREDIT` customer with any open receivable balance cannot be changed to `CASH`.  
**Business Reason:** Credit condition is an audited administrative act; collections must not be erased by reclassification.  
**Main Flow:** Administrator edits classification or terms; the server re-reads open balances, rejects forbidden downgrades, and records actor, timestamp, and before/after values.  
**Business Rules:** Settling invoices does not itself reclassify the customer; a paid `CREDIT` customer remains `CREDIT` until an Administrator changes type. Seller is denied these edits. Completed invoice snapshots keep the terms used at confirmation.  
**Important Exceptions/Edge Cases:** Open balance includes every completed DOP invoice with positive outstanding amount for that customer. Cancelled invoices do not block the change.  
**Dependencies:** CUST-004, CUST-005, PAY-001, HIST-001.  
**Acceptance Notes:** Editing limit from `10000.00` to `15000.00` stores both values. A customer with one `ABONADO` invoice of remaining `500.00` cannot become `CASH`. After that invoice is `PAID`, Administrator may change the type.

---

### CUST-007 — Named Cash Fiscal Eligibility

**Name:** Fiscal identity for named cash customers  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A named `CASH` customer with a valid RNC/Cédula may receive a fiscal-value invoice. The generic `Cliente contado` never may, even if `Aplicar ITBIS` is selected. A named customer without valid identification cannot emit a fiscal document.  
**Business Reason:** Comprobante fiscal depends on buyer identity, not on credit classification or on whether ITBIS is applied.  
**Main Flow:** User selects fiscal document type; the server requires a named customer that `satisfiesFiscalIdentity`.  
**Business Rules:** `Aplicar ITBIS` (SALE-009) is independent: the generic cash customer may calculate ITBIS and still be rejected for fiscal emission. `CREDIT` customers already require identification, so they remain fiscally eligible when that identity is valid.  
**Important Exceptions/Edge Cases:** Missing or invalid RNC/Cédula on a named cash customer blocks fiscal emission without forcing the customer to become `CREDIT`.  
**Dependencies:** CUST-002, CUST-004, SALE-003, SALE-009.  
**Acceptance Notes:** Named cash customer with RNC confirms fiscal. Generic `Cliente contado` with `Aplicar ITBIS` calculates tax and still rejects fiscal. Named cash customer without RNC rejects fiscal and may still complete a nonfiscal cash sale.
