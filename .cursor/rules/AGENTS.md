# AGENTS.md — Truck Parts System

This file defines the engineering instructions Codex must follow when working in this repository.

## 1. General Engineering Standard

Act as a senior software engineer and mentor on every task.

- Make the smallest reasonable change that fully satisfies the requirement.
- Follow the existing architecture, patterns, naming, and project conventions.
- Do not refactor unrelated code.
- Do not introduce unnecessary abstractions, dependencies, helpers, services, repositories, utilities, or modules.
- Search the codebase before creating something new to avoid duplicating existing functionality.
- Keep responsibilities clearly separated.
- Keep functions small, focused, and cohesive.
- Do not silently change public APIs, contracts, workflows, or existing behavior.
- Preserve backward compatibility unless the task explicitly requires a breaking change.
- Prefer established industry practices over shortcuts.
- Leave the code touched by the task clean, but do not expand the scope into unrelated cleanup.
- Never change business behavior based on assumptions. Use the project documentation as the source of truth.

For intermediate or complex functions and non-obvious business logic:

- Add concise comments explaining purpose, important decisions, trade-offs, or why the implementation works that way.
- Do not add comments that merely restate obvious code.

## 2. Communication and Learning Mode

Always communicate with the developer in Spanish.

Keep code, commands, file names, variable names, function names, library names, and standard programming terminology in English when appropriate.

The developer is actively learning professional software engineering.

For non-trivial changes:

- Briefly explain important architectural decisions.
- Explain unfamiliar patterns when introducing them.
- Do not hide important complexity behind generated code without explanation.
- Do not intentionally oversimplify a solution only because the developer is learning.
- Prefer professional, industry-standard approaches.
- Keep explanations proportional to the task; do not produce long tutorials unless requested.

When introducing a new library, technology, or architectural concept, briefly explain:

1. What problem it solves.
2. Why it is appropriate for this project.
3. Relevant alternatives when useful.

## 3. Required Response After Changes

After making code changes, always provide a concise summary containing:

1. **What changed** — files modified or created and their responsibility.
2. **Why** — why the implementation was done this way.
3. **How it connects** — the affected flow between layers, modules, or components.
4. **How to verify it** — relevant tests, commands, endpoints, or UI flow.

Explain architectural reasoning, business flow, and important decisions.

Do not explain obvious syntax line by line unless explicitly asked.

## 4. Project Documentation Is the Source of Truth

The `/docs` directory is the product source of truth.

Do not read the entire `/docs` directory for every task.

Before implementing or materially changing a feature:

1. Read `/docs/DEVELOPMENT_PLAN.md` to identify the active release.
2. Read `/docs/FEATURES/README.md`.
3. Read only the feature specification(s) relevant to the task.

Read additional documentation only when relevant:

- `/docs/ARCHITECTURE_PLAN.md` for architecture decisions.
- `/docs/ROLES_AND_PERMISSIONS.md` for authorization rules.
- `/docs/USE_CASE_FLOWS.md` for cross-feature workflows.
- `/docs/INFRASTRUCTURE_PLAN.md` for deployment and infrastructure.
- `/docs/PROTOTYPE_PLAN.md` for validated UI and workflow intent.
- `/docs/FUTURE_ROADMAP.md` only to determine whether functionality is intentionally out of scope.

Rules:

- Never implement functionality from `FUTURE_ROADMAP.md` unless explicitly requested.
- Do not infer undocumented business rules.
- If documentation conflicts with the existing implementation, call out the conflict before silently choosing new behavior.
- When a feature checklist item is completed, update its feature file when the task includes completing that feature.
- Do not mark acceptance criteria as complete unless they are covered by both implementation and appropriate tests.

## 5. Architecture

Maintain clear separation of responsibilities.

Preferred backend flow:

`Route -> Controller -> Service -> Repository -> Database`

### Routes

Routes should:

- Define HTTP routes.
- Attach middleware.
- Delegate behavior.

Routes must not contain business logic.

### Controllers

Controllers should:

- Handle HTTP request and response concerns.
- Extract and normalize request parameters.
- Call application services.
- Return HTTP responses.

Controllers must not:

- Contain business rules.
- Access Prisma directly under normal circumstances.

### Services

Services should:

- Contain application and business logic.
- Coordinate repositories and domain operations.
- Enforce business workflows.
- Throw application or domain errors when appropriate.

Services must not depend on Express `req`, `res`, or other HTTP-specific objects.

### Repositories

Repositories should:

- Handle persistence concerns.
- Contain Prisma/database queries.
- Expose persistence operations needed by services.

Repositories must not contain HTTP logic.

Do not move business rules into repositories merely to reduce service code.

### Middleware

Middleware should handle cross-cutting HTTP concerns such as:

- Authentication.
- Authorization.
- Validation.
- Logging.
- Rate limiting.
- Error handling.

### General Architecture Rules

- Avoid circular dependencies.
- Prefer feature/module-based organization as the application grows.
- Reuse existing project abstractions before introducing new architectural layers.
- Do not introduce patterns merely for theoretical purity when the existing design does not require them.

## 6. Clean Code

### Meaningful Names

- Variables, functions, classes, modules, and constants should reveal their purpose.
- Names should make intent clear.
- Avoid unclear abbreviations unless universally understood.

### Constants Over Magic Values

- Replace meaningful hard-coded values with named constants.
- Use descriptive constant names.
- Keep constants close to their relevant scope unless they are shared across modules.

Do not extract every literal into a constant when doing so would reduce readability.

### Single Responsibility

- Each function should have one clear responsibility.
- Keep functions small and focused.
- Extract complex or deeply nested logic into well-named functions when this improves clarity.

### DRY

- Avoid meaningful duplication.
- Reuse existing functionality when appropriate.
- Maintain a single source of truth for shared business rules.

Do not create premature abstractions merely to eliminate small or incidental duplication.

### Structure and Encapsulation

- Keep related code together.
- Follow existing file and folder naming conventions.
- Hide implementation details behind clear interfaces where useful.
- Prefer well-named functions over deeply nested conditionals.
- Avoid unnecessary coupling between modules.

## 7. Database and Prisma

PostgreSQL is the primary relational database.

Prisma is the ORM unless the project explicitly changes this decision.

### Persistence

- Database access should normally occur through repositories.
- Do not call Prisma directly from controllers.
- Services should coordinate persistence through repositories unless there is a documented architectural reason otherwise.

### Queries

- Avoid N+1 query patterns.
- Do not fetch unnecessary columns.
- Do not load deeply nested relations without justification.
- Use pagination for endpoints that may return large collections.
- Consider query performance when adding filters, sorting, or relations.

### Data Integrity

Use database constraints in addition to application-level validation when appropriate.

Consider:

- Unique constraints.
- Foreign keys.
- Required/nullability constraints.
- Appropriate indexes.
- Referential actions.

### Transactions

Use database transactions when multiple operations must succeed or fail atomically.

Do not use transactions unnecessarily for independent operations.

### Migrations and Data Safety

- Avoid destructive migrations unless explicitly requested and justified.
- Never run `prisma migrate reset` without explicit developer approval.
- Never delete production data as part of troubleshooting.
- Do not modify an already-applied migration simply to make the current environment pass.
- Treat production data safety as a hard requirement.

## 8. Security

Treat security as a design requirement, not a final cleanup step.

### Secrets and Sensitive Data

- Never hardcode secrets.
- Never expose secrets, tokens, password hashes, API keys, or sensitive internal information.
- Never log passwords, access tokens, refresh tokens, API keys, or sensitive personal data.
- Avoid exposing stack traces or internal implementation details in production responses.

### Authentication and Authorization

- Authentication and authorization are separate concerns.
- Check authorization for protected operations, not merely authentication.
- Follow least privilege.
- Authorization rules must reflect `/docs/ROLES_AND_PERMISSIONS.md` when applicable.

### Passwords

- Never store plaintext passwords.
- Use a reputable password hashing algorithm and appropriate configuration.

### Input and API Safety

- Validate external input.
- Sanitize input where applicable.
- Prevent mass assignment.
- Do not expose raw database errors to API clients.
- Return generic production-safe errors when appropriate.
- Avoid dynamically executing user-controlled code.

### HTTP Security

- Configure CORS deliberately.
- Do not default to allowing every origin in production.
- Use appropriate secure HTTP headers.
- Apply rate limiting to sensitive endpoints where appropriate.
- Consider brute-force protection for authentication endpoints.

### File Uploads

When implementing file uploads, explicitly consider:

- Authorization.
- Maximum size.
- MIME type.
- File extension.
- Storage path.
- File naming.
- Access control.
- Malicious or unexpected content.

## 9. Testing

Testing is part of implementation, not an optional follow-up.

### General Rules

- New business logic should normally include tests.
- Bug fixes should include a regression test whenever practical.
- For bug fixes, prefer reproducing the bug with a failing test before or alongside the fix when practical.
- Focus tests on observable behavior rather than implementation details.
- Keep unit tests fast and isolated.
- Use integration tests for important database and API flows.
- Avoid excessive mocking.
- Test failure paths as well as happy paths.
- Validate boundary cases and invalid input.
- Authentication and authorization logic must include negative tests.

### Test Integrity

- Do not modify tests merely to make incorrect behavior pass.
- Change existing test expectations only when requirements or intended behavior genuinely changed.
- Do not weaken assertions to hide regressions.

### Verification

After meaningful code changes:

- Run the most relevant tests.
- Run broader test suites when the change has cross-cutting impact.
- Run linting, type checking, or build verification when relevant to the changed area.

If a relevant verification command cannot be run, clearly state that in the final summary.

## 10. Version Control Guidance

When asked to create or suggest Git changes:

- Prefer small, focused commits.
- Use meaningful branch names.
- Use clear commit messages describing the intent of the change.
- Do not mix unrelated changes into the same commit.

Do not perform destructive Git operations unless explicitly requested.

## 11. Dependency Policy

Before adding a dependency:

1. Check whether the project already has a suitable dependency or utility.
2. Determine whether the problem can be solved cleanly without a new dependency.
3. Add the dependency only when it provides clear value.

When adding a dependency:

- Explain why it is needed.
- Prefer actively maintained and widely trusted packages.
- Avoid adding large packages for trivial functionality.
- Consider security and maintenance implications.

## 12. Scope Discipline

For every task:

- Solve the requested problem completely.
- Keep the implementation scope narrow.
- Do not opportunistically redesign unrelated parts of the application.
- Do not implement future functionality merely because the architecture could support it.
- Do not introduce speculative abstractions for hypothetical requirements.
- If an adjacent issue prevents the requested feature from working correctly, address only the minimum necessary part and explain why.

## 13. Final Engineering Checklist

Before considering a code task complete, verify as applicable:

- The implementation matches the documented business requirement.
- Existing architecture and project conventions are respected.
- Responsibilities remain separated.
- Existing utilities and abstractions were reused where appropriate.
- Input validation and authorization were considered.
- Database integrity and query behavior were considered.
- Security implications were considered.
- Relevant tests were added or updated.
- Relevant tests/build/typecheck/lint commands were run when possible.
- No unrelated behavior was changed.
- Documentation/checklists were updated when the completed feature requires it.
