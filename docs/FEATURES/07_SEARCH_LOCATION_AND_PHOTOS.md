# Feature 07 — Search, Free Location, and Item Photos

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `SEARCH-001, SEARCH-002, SEARCH-003, LOC-001, LOC-002, PHOTO-001`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 4 — Base Inventory; hierarchy-aware projections expand in Release 6**

**Implementation (2026-09-10):** Production API **not started** (no search/photo persistence). Frontend search `[x]` is prototype mock.

## What this feature does

Make used parts findable by practical identifiers, show independent/installed/quantity/historical results correctly, provide effective free-text location, and support multiple photos with a primary image.

## Architecture ownership

Primary logical module: **search / locations / photos**.

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

Search is a read/composition module. It queries Inventory, Quantity Stock, Hierarchy, Location, Photo, protection, and historical sale data but does not own those records.

Use PostgreSQL indexes based on tested query patterns and bounded pagination. Start with validated exact/partial operational fields; do not add a separate search engine unless measured need justifies it.

Location is free text. An installed item derives effective location from its current root ancestor; an independent item uses its own location. On Dismantling completion the removed piece's new location is optional and may remain blank.

Photo bytes live in private S3-compatible object storage; PostgreSQL stores metadata, ordering, primary selection, ownership, and object keys. Missing photos never block inventory registration.

## Feature-level acceptance criteria

- Search covers validated operational fields and shows installed and independent inventory distinctly.
- Quantity results expose derived available-to-reserve, not an editable availability state.
- Sold items are excluded from normal available search but can be queried historically.
- Effective location is correct for installed versus independent items.
- Removed-piece location may remain blank.
- Multiple photos persist and one can be selected as primary.
- Mechanic cannot use general commercial search endpoints.

## Implementation checklist

### Backend
- [ ] Define paginated search projection.
- [ ] Implement validated search fields and filters.
- [ ] Add indexes after query-plan/testing evidence.
- [ ] Implement historical sold lookup.
- [ ] Implement effective-location resolver.
- [ ] Implement item photo metadata and storage adapter.
- [ ] Validate upload MIME/size/signature and object authorization.

### Frontend
- [x] Inventory search/results.
- [x] Installed/independent/quantity state display.
- [x] Historical filter/view.
- [x] Free-text location edit/display.
- [ ] Photo gallery, upload, primary selection, edit/remove rules.

### Tests
- [x] Installed and independent examples both searchable.
- [x] Sold exclusion/history inclusion.
- [x] Effective root-location inheritance.
- [ ] Optional post-removal location.
- [ ] Multiple-photo/primary behavior.
- [ ] Unauthorized object access and Mechanic search denial.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### SEARCH-001 — Operational Search Fields

**Name:** Find inventory by known information  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Search must use practical identifiers and descriptions, including the public internal code, name, category, part number, serial, brand, and applicable truck/engine/category attributes. Production lookup may accept the public code in the URL while resolving to the UUID primary key.  
**Business Reason:** Staff often know only one fragment of a used part's identity.  
**Main Flow:** User enters a term or filter; matching inventory is returned.  
**Business Rules:** Searchable fields follow approved category formats.  
**Important Exceptions/Edge Cases:** Missing optional fields must not hide an otherwise matching item.  
**Dependencies:** INV-001, INV-002, CAT-001.  
**Acceptance Notes:** Representative searches locate items through each approved identifier type.

---

### SEARCH-002 — Installed and Quantity Results

**Name:** Unified inventory discovery  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Normal search must include Available independent items, Available installed items, and quantity products with available-to-reserve stock.  
**Business Reason:** Physical installation or stock model must not make sellable inventory invisible.  
**Main Flow:** Results identify inventory type, availability, reservation effect, parent relationship, and effective location as applicable.  
**Business Rules:** Installed is shown as `Instalado en [parent]`, not as availability.  
**Important Exceptions/Edge Cases:** Restricted components remain visible but must indicate they cannot be separately sold.  
**Dependencies:** HIER-003, QTY-001, LOC-001, RES-001.  
**Acceptance Notes:** One search can show an installed unit, independent unit, and quantity product distinctly.

---

### SEARCH-003 — Historical Sold Lookup

**Name:** Find sold inventory without offering it  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** Sold items must be excluded from normal available inventory but remain retrievable through history or an explicit filter.  
**Business Reason:** Staff need traceability without accidentally reselling stock.  
**Main Flow:** User enables historical lookup and opens the sold item, sale, and former parent references.  
**Business Rules:** Historical visibility never restores availability.  
**Important Exceptions/Edge Cases:** Cancelled-sale restoration follows CANCEL-003.  
**Dependencies:** INV-004, HIST-001, CANCEL-003.  
**Acceptance Notes:** Sold inventory is absent from normal availability and present in historical results.

---

### LOC-001 — Free-Text and Effective Location

**Name:** Practical physical location  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Inventory may have an optional free-text location; an installed item's effective location is inherited from its current root ancestor.  
**Business Reason:** The business lacks a structured zone/rack system but still needs to find parts.  
**Main Flow:** Seller or Administrator records or edits ordinary location; search and detail show effective location for descendants. The assigned Mechanic may enter only the removed piece's optional post-removal location through LOC-002.  
**Business Rules:** MVP has no mandatory structured warehouse positions; Mechanic may view effective location only in Work Order context and may record an optional post-removal location only through LOC-002.  
**Important Exceptions/Edge Cases:** An item with no own or root location may have location pending.  
**Dependencies:** HIER-001, INV-005.  
**Acceptance Notes:** A nested component displays the current root's location without copying it as its own.

---

### LOC-002 — Optional Post-Removal Location

**Name:** Location may remain pending after removal  
**Status:** CONFIRMED  
**Actors:** Administrator, Mechanic  
**Requirement:** Completing a Dismantling Work Order may optionally record a new free-text location, but location must not be required for completion.  
**Business Reason:** The owner confirmed that the destination may not yet be known.  
**Main Flow:** The assigned Mechanic completes physical removal and either enters a location or leaves it pending.  
**Business Rules:** Lack of location does not roll back an otherwise valid removal. Only the assigned Mechanic may write this value during completion of that Dismantling Work Order; this does not grant general inventory editing.  
**Important Exceptions/Edge Cases:** The former effective location may remain historical but must not be misrepresented as the new current location. Administrator inspection or correction uses ordinary authorized inventory maintenance or a protected recovery/correction operation rather than impersonating Mechanic completion.  
**Dependencies:** HIER-005, LOC-001, WO-008, HIST-001.  
**Acceptance Notes:** Removal succeeds with a blank current location and records the hierarchy change.

---

### PHOTO-001 — Item Photos

**Name:** Multiple item photos  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An individually tracked item may have multiple photos, one designated as primary, added or corrected after registration.  
**Business Reason:** Visual identification is important for used parts with incomplete markings.  
**Main Flow:** User uploads valid photos, selects a primary image, and saves.  
**Business Rules:** Photos support identification and do not replace inventory identity.  
**Important Exceptions/Edge Cases:** Missing photos do not prevent registration; storage and upload controls are later architecture decisions.  
**Dependencies:** INV-001, INV-005.  
**Acceptance Notes:** Multiple images persist and exactly one is treated as primary when selected.
