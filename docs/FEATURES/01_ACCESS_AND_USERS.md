# Feature 01 — Access and Users

## Status and authority

**CONFIRMED.** This file is the implementation source of truth for requirement IDs: `AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005`.

The old consolidated requirements/validation files are intentionally no longer required. If another retained document conflicts with a requirement block below, update that retained document rather than weakening this feature specification.

## Delivery

**Release 1 foundation; required before any production business flow**

**Implementation (2026-09-10):** Production API + HTTP UI done. Release 1 **COMPLETED**.

## What this feature does

Provide individual authenticated access, the fixed Administrator/Seller/Mechanic role model, safe deactivation, and server-side authorization.

## Architecture ownership

This is one product feature with two implementation modules:

- **`access`:** login, logout, session lookup, authentication, active-user checks.
- **`users`:** Administrator user-management commands.

Both modules may share the same user model and user repository.

Follow the project-wide convention in each module:

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

### Confirmed implementation decisions

These decisions close prior documentation gaps and are authoritative for Release 1:

1. **Login identity:** use unique `username` as the login identifier.
2. **First Administrator:** create through a one-time CLI bootstrap command. Do not hardcode production credentials. The bootstrap must reject creating another initial Administrator when any user already exists.
3. **User profile fields (MVP):**
   - `name` — required
   - `username` — required, unique
   - `phone` — optional
   - `email` — optional
   - `role` — required (`ADMINISTRATOR`, `SELLER`, `MECHANIC`)
   - `active` — required
   - `passwordHash` — required
   - `mustChangePassword` — server-managed boolean for mandatory initial password change (M8 decision, 2026-09-05)
   - `createdAt` / `updatedAt`
   - Do not add other required MVP fields.
4. **Password policy (MVP):** minimum 6 characters; no additional complexity rules in the MVP.
5. **Mechanic scope in Release 1:** verify only a minimal session projection and negative authorization tests. Full Work Order data projection belongs to the release that implements Work Orders.
6. **History in Release 1:** implement the reusable event envelope and record user-lifecycle events only. Owner-approved M9 scope (2026-09-05): creation including CLI bootstrap; actual role/active transitions; profile edits with before/after name, username, phone and email; voluntary/required own-password changes with restriction metadata only; recovery request, approval, rejection, expiry and cancellation. All events append inside the state-changing transaction; failed commands append no success and no-op field edits append no change event. Public requests have anonymous actors, expiry and bootstrap have explicit system attribution; authenticated actions retain the user FK even after deactivation. No passwords, hashes or session credentials enter history. Other business event types are added with their owning features.
7. **Administrator-created credentials (owner decision, 2026-09-05; delivery 2026-09-13):** creation accepts no password. The server assigns the initial password from the `INITIAL_PASSWORD` environment variable (documented default `solocamiones`), stores only its Argon2id hash and sets `mustChangePassword = true`. The HTTP 201 create body includes that plaintext once (`Cache-Control: no-store`) so the creating administrator can deliver it in person; it must not appear in history, list, get, patch, session, or logs. Administrators cannot freely change or reset another user's password; recovery requires a pending user request and approval by another administrator after identity verification; administrative create/update schemas reject credential fields and the flag. Every user, including Administrator, changes their own password only through their own profile, verifying their current password.
8. **Mandatory initial change:** initial login establishes restricted access to session lookup, own profile and logout only. All other authenticated operations are denied server-side until the user chooses a password of at least six Unicode characters different from the initial password. Editing profile contact data alone does not clear the flag. Login/session/profile responses expose the flag for every role. Use `403 FORBIDDEN` with `details.reason = PASSWORD_CHANGE_REQUIRED` for restricted operations.
9. **Completion and compatibility:** atomically update the password hash, clear the flag and revoke all sessions; clear the current cookie and require login with the new password. Concurrent attempts must not overwrite a completed password change. Existing users and the interactive bootstrap retain their credentials with the flag set to `false`; new administrative accounts explicitly set it to `true`. Activation and role changes never reset credentials or the flag. Forgotten-password recovery is implemented in M8: one pending request per active account, expiring after 24 hours. Another active Administrator without a pending password change may approve (explicit personal/phone identity verification) or reject, never their own request. Approval generates a random temporary password without expiration, shown once for personal delivery, stores only its hash, requires change and revokes all sessions atomically. There is no email recovery, local recovery command or mandatory second administrator; a sole locked-out administrator cannot recover through the application.

### Recommended implementation shape

Use same-origin server-side sessions with secure `HttpOnly` cookies. Authentication establishes identity; authorization is evaluated again at the server for every protected command.

Keep the HTTP layer thin:

```text
access/
  routes
  controller
  service
  repository
  validation
  types

users/
  routes
  controller
  service
  repository
  validation
  types
```

The access service should own login/logout/session invalidation and active-user checks. User-management commands belong to the `users` module but use the same user repository/model. Store password hashes only; never expose or log credentials or session values.

Represent the application role as a fixed enum (`ADMINISTRATOR`, `SELLER`, `MECHANIC`) rather than configurable RBAC. Do not encode authorization only in React. Use operation-level policies/middleware and repeat state-sensitive checks inside services when the action depends on record state.

Deactivation must invalidate future access while preserving historical foreign-key/reference identity. Existing sessions must be revocable or rechecked so a deactivated account cannot continue long-term access.

## Feature-level acceptance criteria

- Active individual credentials can establish a session; invalid or inactive credentials cannot.
- Each active account has exactly one supported role.
- Only Administrator can create/deactivate users or assign roles.
- Server rejects direct unauthorized requests even when the UI is bypassed.
- Deactivation does not erase historical actor attribution.
- Mechanic authorization never grants commercial/financial visibility.
- New administrative accounts must complete a password change in their own profile before operational access, enforced by the API for every role.
- Administrators cannot supply passwords during creation or ordinary updates. Only approved recovery requests can assign a system-generated temporary password.

## Implementation checklist

### Backend / domain
- [x] Define fixed role enum and active/inactive user state.
- [x] Implement user repository and unique `username` constraint.
- [x] Implement one-time CLI bootstrap for the first Administrator when no users exist.
- [x] Implement password hashing, minimum 6-character validation, and credential verification.
- [x] Implement server-side session creation, lookup, rotation, logout, and invalidation.
- [x] Implement active-account guard.
- [x] Implement operation-level authorization helpers/policies.
- [x] Implement Administrator user-management commands in the `users` module (M8).
- [x] Implement initial server-assigned password, persisted change-required flag, restricted access and atomic own-profile completion with session revocation (M8).
- [x] Preserve the user record and identity after deactivation (M8), including historical actor attribution verified by M9 integration coverage.

### Frontend
- [x] Login/logout flow.
- [x] Session-expired / inactive-account handling.
- [x] Original Administrator user-management prototype (`name`, `username`, optional `phone`/`email`, role, active state), covered by tests (WM11). Its password field predates the 2026-09-05 decision and must be removed before HTTP integration.
- [x] Remove password inputs/free reset actions from administrative UI and user payloads; explain initial password, add recovery request resolution and one-time temporary-password display (M11; automated coverage and owner browser verification completed 2026-09-07).
- [x] Adapt login and own profile to mandatory password change, including reload/direct navigation and fresh login after completion (M10: automated component/HTTP coverage and local browser verification; owner confirmed password change and fresh login for all three roles).
- [x] Role-aware navigation without treating hidden controls as security. Prototype mock 2.0-M1.2 also hides on-screen actions the role cannot perform (`can()` + route guards).
- [x] Self-service profile edit (own name, optional phone/email, password) for every active role. Username, role, and active stay administrator-managed. Uses `profile.update`, not `users.manage`. Covered by unit, integration, and component tests.

### Tests
- [x] Valid/invalid/inactive login tests.
- [x] Role matrix negative tests through direct API requests (Release 1 Mechanic scope: minimal session projection only).
- [x] Session invalidation after deactivation (M8).
- [x] Historical records still resolve deactivated actor identity (M9 integration coverage).
- [x] Initial login restriction, credential-field rejection, mandatory change errors/success/concurrency, old-session invalidation and existing-user/bootstrap compatibility (M8).
- [x] Recovery request/approval/rejection, expiry, concurrency and credential delivery; prevention of own resolution and own demotion/deactivation (M8).

## Canonical validated requirements

The blocks below are the final reconciled requirements retained from the previous consolidated catalog. Keep their IDs stable for tests, commits, and traceability.

### AUTH-001 — Individual Accounts

**Name:** Individual user access  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Each user must access the system through an active individual account.  
**Business Reason:** Operational and financial actions must be attributable to a person.  
**Preconditions:** The account exists and is active.  
**Main Flow:** User submits credentials; the system verifies the account and starts an authenticated session.  
**Business Rules:** Shared anonymous operational accounts are not allowed. Administrator-created accounts initially use the server-assigned `INITIAL_PASSWORD` (documented default `solocamiones`), shown once to the creating administrator, with mandatory own-profile password change before operational access. Only the account owner changes their password, with current-password verification.
**Important Exceptions/Edge Cases:** Historical actions remain attributable after account deactivation.  
**Dependencies:** None.  
**Acceptance Notes:** Valid active credentials succeed; invalid or inactive credentials do not. Accounts with a pending initial change receive restricted access only; completing the change revokes all sessions and requires a new login.

---

### AUTH-002 — Three-Role Model

**Name:** Administrator, Seller, and Mechanic roles  
**Status:** CONFIRMED  
**Actors:** Administrator, Seller, Mechanic  
**Requirement:** The MVP must use exactly three application roles: Administrator, Seller, and Mechanic, without introducing configurable enterprise RBAC.  
**Business Reason:** Commercial, protected administrative, and physical-work responsibilities require distinct information and authority boundaries.  
**Main Flow:** An Administrator assigns one role; protected behavior follows that role.  
**Business Rules:** Administrator includes normal Seller capabilities plus protected administration; Seller performs normal commercial and inventory operations; Mechanic is limited to the Work Order queue and assigned-order execution with only the information defined by WO-003.  
**Important Exceptions/Edge Cases:** Mechanic is not a general inventory or commercial role and cannot gain Seller visibility through a Work Order assignment.  
**Dependencies:** AUTH-001.  
**Acceptance Notes:** Each active account has exactly one of the three roles, and each protected operation enforces the corresponding boundary.

---

### AUTH-003 — User Management

**Name:** Administrator-managed users  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Administrators may create users, assign Administrator, Seller, or Mechanic, and activate or deactivate accounts.  
**Business Reason:** Access must be controlled without direct data changes.  
**Preconditions:** The acting user is an Administrator.  
**Main Flow:** Administrator enters user information, assigns a role, and saves the account state. The creating administrator sees the server-assigned initial password once.  
**Business Rules:** Seller and Mechanic cannot manage accounts or roles. Administrator creation accepts no password: the server assigns the initial credential from `INITIAL_PASSWORD` (documented default `solocamiones`) and the mandatory-change flag. Administrators cannot freely change/reset existing account passwords or clear that flag through ordinary user endpoints, including for their own account; own-password changes use the profile flow. The only recovery exception is a pending request approved by another administrator with identity verification; the system generates the temporary credential. Self-deactivation/demotion is forbidden and at least one active Administrator must remain.
**Important Exceptions/Edge Cases:** A unique `username` cannot be assigned to conflicting accounts.  
**Dependencies:** AUTH-001, AUTH-002.  
**Acceptance Notes:** Server-side checks allow Administrators and reject Seller and Mechanic.

---

### AUTH-004 — Deactivation Without History Loss

**Name:** Safe account deactivation  
**Status:** CONFIRMED  
**Actors:** Administrator  
**Requirement:** Deactivation must prevent future login without deleting or anonymizing historical actions.  
**Business Reason:** Former staff must lose access while audit history stays understandable.  
**Preconditions:** The target account exists.  
**Main Flow:** Administrator deactivates the account; active access ends; prior records retain the user identity.  
**Business Rules:** Deactivation is not physical deletion.  
**Important Exceptions/Edge Cases:** Existing sessions must not retain unauthorized long-term access.  
**Dependencies:** AUTH-001, AUTH-003, HIST-002.  
**Acceptance Notes:** A deactivated user cannot authenticate, and prior events still name that user.

---

### AUTH-005 — Server-Side Authorization

**Name:** Enforced authorization  
**Status:** CONFIRMED  
**Actors:** Seller, Administrator, Mechanic  
**Requirement:** Every protected action must be authorized by the server when executed, not only hidden in the interface.  
**Business Reason:** UI-only restrictions can be bypassed and expose sensitive business operations.  
**Preconditions:** An authenticated user requests a protected action.  
**Main Flow:** The system checks identity, role, and action-specific rules before changing data.  
**Business Rules:** Denial leaves business state unchanged.  
**Important Exceptions/Edge Cases:** Stale sessions and direct requests receive the same checks.  
**Dependencies:** AUTH-001, AUTH-002.  
**Acceptance Notes:** Unauthorized direct action attempts fail without partial changes.
