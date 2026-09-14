# Feature 05 — Hierarchy, Received Baseline, Completeness, and No Desarmar

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `HIER-001, HIER-002, HIER-003, HIER-004, HIER-005, HIER-006, HIER-007, HIER-008, HIER-009, HIER-010, HIER-011`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 6 — Hierarchical Inventory**

**Implementation (2026-09-10):** Production API **not started**. Frontend `[x]` is prototype mock.

## What this feature does

Represent multi-level assemblies, one current parent, initial observed receipt baselines, Known Missing Components, derived direct-parent completeness, relationship history, and protected `No desarmar` behavior.

## Architecture ownership

Primary logical module: **hierarchy**.

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

Model current physical relationship separately from historical relationship events. Each tracked item has at most one current direct parent. Use database constraints plus service validation to prevent self-parenting, second parents, and cycles.

The one-time received-assembly baseline is a special transaction, not a Work Order. It records checklist outcomes (`PRESENT`, `MISSING`, `NOT_APPLICABLE`), creates/links real present children, creates `MISSING_AT_RECEIPT` Known Missing Components for applicable absences, derives only the direct parent's completeness, and records receipt provenance.

After the baseline is committed, actual physical installation/desarme can change hierarchy only through successful Work-Order completion. Administrator baseline correction is a protected additive correction for verified recording mistakes; it cannot reopen baseline registration or rewrite later immutable history.

Completeness is derived from unresolved Known Missing Components for the direct parent only. Do not cascade completeness to ancestors.

`No desarmar` is an Administrator-controlled restriction on a root that blocks separate sale/desarme through its descendant subtree while still allowing the protected root to be sold as a complete unit when otherwise eligible.

## Feature-level acceptance criteria

- Multi-level hierarchy is supported with one parent per child and no cycles.
- Initial baseline can record PRESENT/MISSING/NOT_APPLICABLE without fake Work Orders or phantom inventory.
- Baseline is committed once and is not reopened.
- Missing applicable components create absence records, not inventory items.
- Completeness is derived and affects only the direct parent.
- Post-baseline physical changes cannot be represented by direct Seller/Admin hierarchy edits.
- `No desarmar` blocks descendant separate sale/desarme and only Administrator can apply/remove it.
- Relationship and baseline history remain reconstructable.

## Implementation checklist

### Domain / persistence

- [ ] Define current relationship and closed relationship-history representation.
- [ ] Enforce at most one current parent.
- [ ] Implement cycle detection and ancestor checks.
- [ ] Define Expected Component Definition references and Known Missing Component records/origins.
- [ ] Implement one-time received-baseline transaction.
- [ ] Implement derived direct-parent completeness query/update policy.
- [ ] Implement protected baseline-correction command.
- [ ] Implement `No desarmar` subtree eligibility checks.
- [ ] Add hierarchy version/concurrency protection for later sale/Work-Order coordination.

### Frontend

- [x] Prototype assembly baseline registration/checklist; production API integration remains part of Release 6.
- [x] Hierarchy/tree detail.
- [x] Missing-component and completeness display.
- [x] Administrator `No desarmar` controls.
- [x] Protected baseline-correction UI with reason and preview.

### Tests

- [ ] Second-parent/self/cycle rejection.
- [ ] PRESENT/MISSING/NOT_APPLICABLE baseline scenarios.
- [x] Direct-parent-only completeness.
- [ ] Baseline cannot be rerun.
- [x] Seller cannot correct baseline.
- [x] Protected subtree sale/desarme rejection.
- [ ] Concurrent hierarchy-change conflict tests.

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### HIER-001 — Multi-Level Assemblies

**Name:** Hierarchical physical inventory  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** An individually tracked item may contain tracked children and may itself be a child, supporting structures such as Truck → Engine → Alternator.  
**Business Reason:** The system must reflect the physical composition of used truck inventory.  
**Preconditions:** Every present physical node is an individually tracked item.  
**Main Flow:** Seller or Administrator may establish successive valid parent-child levels while registering the initial observed hierarchy of a received assembly under HIER-011. After the baseline exists, only completed Installation Work Orders attach registered items.  
**Business Rules:** Every item retains its own identity and state; relationship provenance distinguishes initial receipt from later Work-Order completion; only categories explicitly treated as assemblies use internal hierarchy/checklists.  
**Important Exceptions/Edge Cases:** Ordinary simple parts such as a normal Alternator need no expected-component checklist. Quantity products and Known Missing Components are not physical hierarchy nodes. A `REMOVED_AFTER_BASELINE` condition may reference the former real child and its Dismantling Work Order without becoming an inventory item or relationship.  
**Dependencies:** INV-001, HIER-002, HIER-011.  
**Acceptance Notes:** A three-level received hierarchy is navigable without fake installation orders or duplicated item identities, and later attachment still requires Installation Work Order completion.

---

### HIER-002 — One Parent and No Cycles

**Name:** Valid current hierarchy  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** An item may have at most one current parent and cannot be attached to itself or any descendant.  
**Business Reason:** Physical location must be unambiguous and recursive structures must remain valid.  
**Preconditions:** Parent and child exist.  
**Main Flow:** Before initial baseline relationship creation or Installation Work Order completion, the system checks current parent and ancestry; valid relations are created and invalid ones rejected.  
**Business Rules:** Historical parents do not count as current parents.  
**Important Exceptions/Edge Cases:** Concurrent baseline or Work-Order attachments must not create two parents or a cycle.  
**Dependencies:** INV-001, HIST-001.  
**Acceptance Notes:** Self-parent, descendant-parent, and second-current-parent attempts fail unchanged in both authorized relationship-creation paths.

---

### HIER-003 — Installed and Available

**Name:** Installed components remain commercial inventory  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A component may remain Available, searchable, reservable, and individually sellable while installed, unless `No desarmar` applies.  
**Business Reason:** Installed parts are a primary source of sellable inventory.  
**Main Flow:** Search or sale identifies the item and displays its current parent without changing availability.  
**Business Rules:** `Installed` never automatically means `No disponible`.  
**Important Exceptions/Edge Cases:** Restricted subtrees block removal and separate sale under HIER-008; a confirmed installed-item sale remains Sold and Installed until the Work Order is completed.  
**Dependencies:** INV-003, SEARCH-002, HIER-008.  
**Acceptance Notes:** An Available installed alternator appears in normal search and can enter a draft when unrestricted.

---

### HIER-004 — Relationship History

**Name:** Preserve component provenance  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Creating an initial parent-child relation must preserve parent, child, time, actor, and receipt-baseline provenance. Ending or later creating a relation must preserve the applicable Work Order and related invoice when present. A protected correction of erroneous receipt provenance must preserve both the original and corrected understanding.  
**Business Reason:** Staff must explain how an assembly arrived and every later relationship change.  
**Preconditions:** The operation is an eligible initial baseline or valid Work Order completion.  
**Main Flow:** Initial baseline registration creates current relationships with receipt provenance and no Work Order; Dismantling completion closes a current relation; Installation completion creates a later current relation; a verified receipt-error correction may adjust the current baseline-derived understanding without claiming physical movement; each operation writes linked history.  
**Business Rules:** Closed relations never appear as current but remain queryable; baseline and Work-Order relationship origins remain distinguishable; a protected correction is additive and may repair an originally misrecorded parent only when physical reality did not change and later immutable events are not contradicted.  
**Important Exceptions/Edge Cases:** Initial baseline history has no Work Order or `BEFORE`/`AFTER` evidence. Administrative correction must not erase prior provenance, reopen HIER-011, bypass Work Order evidence, or rewrite later completed physical history.  
**Dependencies:** HIER-002, HIST-001, HIST-002.  
**Acceptance Notes:** A received child shows baseline actor/time/provenance; a later removed or installed item shows its corresponding Work Order and relationship history.

---

### HIER-005 — Post-Baseline Physical Hierarchy Changes Require Work Orders

**Name:** No direct post-baseline physical hierarchy editing  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Seller and Administrator must never represent post-baseline physical dismantling or installation by directly editing hierarchy; every later physical hierarchy change must be completed through the applicable Mechanic Work Order. HIER-011 is the one-time observed receipt-registration path; only the Administrator-only protected correction may repair a verified error in that recorded receipt reality.  
**Business Reason:** Received reality must be captured without fake installation work, while later commercial intent and physical work remain separate and evidenced.  
**Preconditions:** For HIER-011, a newly received assembly has no established baseline. Otherwise a later physical removal or installation is needed.  
**Main Flow:** Initial registration records observed relationships with provenance but no Work Order or evidence. Afterward, Administrator creates an Installation Work Order by selecting an eligible independent piece and destination parent, or an eligible operation creates/reuses a Dismantling Work Order; the assigned Mechanic performs and completes it with evidence; only valid completion changes hierarchy.  
**Business Rules:** Initial registration cannot be reopened or reused as an edit path; Seller cannot create standalone physical Work Orders; Administrator may create manual Work Orders; Mechanic can affect hierarchy only by valid completion. Correcting a verified receipt-recording error uses INV-006 and does not rerun HIER-011.  
**Important Exceptions/Edge Cases:** Protected administrative correction is not a substitute for real physical work, cannot become free rebaselining, and cannot bypass Work Order evidence, completion rules, or later immutable history.  
**Dependencies:** HIER-002, HIER-004, HIER-008, HIER-011, WO-001, WO-008, WO-009, ADMIN-001.  
**Acceptance Notes:** Initial observed linking succeeds for Seller or Administrator without a Work Order; the same direct action after baseline fails; protected corrections cannot imitate physical work.

---

### HIER-006 — Direct-Parent Completeness from Known Missing Components

**Name:** Derive and recalculate direct-parent completeness  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** A direct parent is `Complete` only when it has zero unresolved Known Missing Components; otherwise it is `Incomplete`. This rule applies at initial baseline, after completed physical Work Orders, and after an eligible protected baseline correction.  
**Business Reason:** Assemblies may arrive incomplete, and installing one of several missing components must not falsely represent the parent as complete.  
**Preconditions:** An initial checklist is being committed, a valid Dismantling Work Order is completing, or a valid Installation Work Order is completing.  
**Main Flow:** The initial checklist records each absence as a `MISSING_AT_RECEIPT` Known Missing Component. Dismantling completion records the removed registered child as `REMOVED_AFTER_BASELINE`, including when its type was not on the receipt checklist, and makes the direct parent Incomplete. Installation completion may resolve a compatible condition from either origin, creates the relation, recalculates the direct parent, and records history atomically.  
**Business Rules:** A `MISSING_AT_RECEIPT` condition has no physical item reference. `NOT_APPLICABLE` creates no Known Missing Component. A catalog-grown expected slot on an already-registered unsold assembly starts as provisional `NOT_APPLICABLE` (not a Known Missing Component) until Administrator confirms NA or records `MISSING_AT_RECEIPT`. A `REMOVED_AFTER_BASELINE` condition may reference the former real item and Dismantling Work Order. Completeness is derived and cannot be manually selected or overridden. A Known Missing Component is never an inventory item; engine testing remains outside MVP.  
**Important Exceptions/Edge Cases:** Installing one of multiple missing components leaves the parent Incomplete; an installation that matches no applicable outstanding absence does not falsely resolve one; matching remains simple and category-based; completeness does not cascade.  
**Dependencies:** CAT-001, HIER-002, HIER-004.  
**Acceptance Notes:** An assembly may start Complete or Incomplete; removing any registered child creates a `REMOVED_AFTER_BASELINE` condition; the direct parent becomes Complete exactly when no Known Missing Component remains unresolved.

---

### HIER-007 — No Completeness Cascade

**Name:** Direct-parent completeness only  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Initial baseline derivation and later dismantling or installation completion establish or change completeness only on the applicable direct parent, not on higher ancestors.  
**Business Reason:** The owner explicitly stated that an engine change does not automatically change its truck's completeness.  
**Preconditions:** Completeness is being derived or recalculated under HIER-006.  
**Main Flow:** The baseline or Work-Order operation identifies and updates only the immediate parent.  
**Business Rules:** Ancestors retain their prior completeness unless changed by a separate operation affecting that ancestor as a direct parent; an eligible baseline correction recalculates only its applicable direct parent.  
**Important Exceptions/Edge Cases:** A missing engine component does not automatically change truck completeness; selling an entire assembly changes availability under HIER-010, not completeness cascade.  
**Dependencies:** HIER-001, HIER-002, HIER-006, HIER-011.  
**Acceptance Notes:** Recording or removing an alternator as missing makes its engine Incomplete while the containing truck remains unchanged.

---

### HIER-008 — No Desarmar Enforcement

**Name:** Dismantling restriction  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** `No desarmar` on a root must block separate sale and dismantling of every descendant in that root's subtree.  
**Business Reason:** Some engines or assemblies must be sold without parting them out.  
**Preconditions:** The restriction is active on the relevant assembly.  
**Main Flow:** Separate sale confirmation, manual Dismantling Work Order creation, and physical completion revalidate the relevant ancestry and reject a violation with the protected root identified.  
**Business Rules:** The restriction does not erase component identities or make them Sold; the protected root itself may still be sold as a complete unit.  
**Important Exceptions/Edge Cases:** Search may show protected descendants but must identify that separate sale and dismantling are blocked.  
**Dependencies:** AUTH-005, HIER-001, HIER-003.  
**Acceptance Notes:** Any separate descendant sale or dismantling attempt fails unchanged, while sale of the protected root as a complete assembly remains eligible.

---

### HIER-009 — Administrator Restriction Control

**Name:** Apply or remove No desarmar  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Only an Administrator may apply or remove `No desarmar`.  
**Business Reason:** The owner reserved this commercially sensitive override for administration.  
**Preconditions:** The assembly exists and the actor is an Administrator.  
**Main Flow:** Administrator applies or removes the restriction; the system records actor, time, action, and affected root.  
**Business Rules:** Seller and Mechanic cannot apply, remove, or bypass the restriction.  
**Important Exceptions/Edge Cases:** Changing the restriction does not itself dismantle, install, reserve, or sell anything.  
**Dependencies:** AUTH-005, HIER-008, HIST-001.  
**Acceptance Notes:** Seller and Mechanic are denied; Administrator application and removal succeed with history.

---

### HIER-010 — Assembly Sale

**Name:** Sell a parent with descendants  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** A sale may include an assembly as one inventory line and must atomically mark the selected root and every included current descendant Sold while preserving an immutable snapshot of the exact delivered hierarchy.  
**Business Reason:** Complete engines or trucks are sold as units while component identity, physical certainty, and history remain coherent.  
**Preconditions:** The assembly and included descendants satisfy availability and reservation rules, and no `Pending` or `In Progress` Dismantling or Installation Work Order could change the selected root, a current descendant, or an item being installed into the selected subtree.  
**Main Flow:** The draft previews the exact included tree; confirmation checks for conflicting active physical work and rejects an unstable hierarchy. After that work is resolved, confirmation rereads and revalidates the resulting tree and reservations, marks every delivered node Sold in one transaction, and stores the immutable hierarchy snapshot.  
**Business Rules:** The system never auto-cancels physical work, silently excludes an affected component, or sells an uncertain snapshot; no included descendant remains separately Available or appears as a conflicting invoice line; the snapshot cannot depend on later inventory edits.  
**Important Exceptions/Edge Cases:** Completed or cancelled work requires a fresh tree read and re-reservation/revalidation as necessary. The lifecycle of current relationship records after sale remains an architecture decision, but it cannot alter Sold state or the exact delivered snapshot.  
**Dependencies:** HIER-002, HIER-004, INV-004, WO-001, WO-002, HIST-002.  
**Acceptance Notes:** A relevant active Work Order blocks confirmation with a clear conflict such as `Cannot complete this assembly sale while physical work affecting its structure is active.` After resolution, multi-level descendants become Sold atomically and the completed invoice retains the exact current delivered tree.

---

### HIER-011 — Initial Baseline Assembly Registration

**Name:** Register an assembly as physically received  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator  
**Requirement:** When registering a newly received assembly, Seller or Administrator may record its initial observed hierarchy directly in one controlled baseline operation. Each general expected-component definition is reviewed for that physical assembly as `PRESENT`, `MISSING`, or `NOT_APPLICABLE`.  
**Business Reason:** Used assemblies arrive already composed. Receipt observation must reflect reality without fake Installation Work Orders or phantom parts.  
**Preconditions:** The physical assembly has arrived, no baseline already exists for it, the applicable checklist is sufficiently defined, and every present component meets its category registration minimum.  
**Main Flow:** Register the root assembly; present its category's general expected-component list; classify each definition for this unit; register each `PRESENT` child with its own identity and known data; validate one parent and no cycles; create initial relationships; create `MISSING_AT_RECEIPT` conditions only for `MISSING`; ignore `NOT_APPLICABLE` for inventory, absence, and completeness; derive completeness; and commit atomically with provenance.  
**Business Rules:** This operation is not a Work Order, assigns no Mechanic, and requires no `BEFORE`/`AFTER` evidence. `PRESENT` means a real item and relationship; `MISSING` means an absence record; `NOT_APPLICABLE` means the definition does not apply to this unit. After commit, all later parent changes require eligible Work Order completion.  
**Important Exceptions/Edge Cases:** The operation cannot be rerun or reopened. Adding expected-component definitions to the category after commit does not reopen this path: unsold assemblies receive a provisional NA review for Administrator confirm/`MISSING` under CAT-001. A verified original receipt-recording error uses the Administrator-only INV-006 correction, which preserves the original event and cannot represent later physical work. A duplicate ID, second parent, cycle, invalid checklist result, or concurrent baseline conflict rejects the whole operation without partial state.  
**Dependencies:** INV-001, INV-002, INV-003, INV-006, CAT-001, HIER-002, HIER-004, HIER-006, HIST-001, HIST-002.  
**Acceptance Notes:** A complete received engine creates real child identities and no Known Missing Components; an incomplete one creates identities only for present children plus `MISSING_AT_RECEIPT` conditions, derives `Incomplete`, preserves provenance, and creates no Work Order.
