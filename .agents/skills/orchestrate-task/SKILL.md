# Orchestrate Task

## Purpose

Act as the primary orchestrator for complex development tasks.

When beneficial and supported by the environment, delegate independent or partially independent work to multiple agents in parallel while remaining responsible for coordination, integration, correctness, code quality, and preservation of business rules.

Parallelism is an optimization, not a requirement. Never parallelize work when doing so increases risk unnecessarily.

The primary agent remains responsible for the final result even when work is delegated.

---

## Core Principles

1. **Understand before modifying.**
2. **Do not assume project behavior or business rules.**
3. **Parallelize only when useful and safe.**
4. **The primary agent owns coordination and integration.**
5. **Business rules take priority over implementation convenience.**
6. **Existing project architecture and conventions must be respected.**
7. **Shared-file modifications must be explicitly coordinated.**
8. **Delegated work is never accepted without review.**
9. **A task is not complete merely because the code compiles.**
10. **Prefer correctness, maintainability, security, and clarity over speed.**

---

# 1. Analyze the Task

Before modifying anything:

* Understand the user's request.
* Inspect the relevant code and documentation.
* Identify affected modules, services, components, APIs, database entities, tests, and documentation.
* Identify existing architectural patterns and conventions.
* Identify relevant business rules.
* Identify dependencies between potential subtasks.
* Identify files likely to be modified.
* Identify risks and possible side effects.

Do not invent missing requirements.

If there is uncertainty that could affect implementation, architecture, business behavior, security, data integrity, or user-visible behavior, ask the user.

Do not restrict questions only to blockers.

Ask whenever clarification would materially improve the implementation or prevent an incorrect assumption.

---

# 2. Decide Whether to Parallelize

Determine whether the task can benefit from multiple agents.

Parallelization is appropriate when work can be divided into reasonably independent areas such as:

* backend
* frontend
* tests
* database
* documentation
* security review
* API integration
* refactoring isolated modules
* investigation of separate problems

Do NOT parallelize merely because multiple agents are available.

Prefer sequential execution when:

* subtasks strongly depend on one another;
* the implementation direction is still unclear;
* several agents would heavily modify the same code;
* business rules need to be established first;
* one change determines the design of subsequent changes;
* parallel execution would create unnecessary merge or integration risk.

The primary agent decides the safest execution strategy.

---

# 3. Create a Work Plan

Before delegating, establish a coordination plan.

For every subtask define:

* objective
* scope
* expected output
* files or modules likely to be affected
* dependencies
* relevant business rules
* constraints
* tests or validation expected

Classify subtasks as:

* `INDEPENDENT`
* `DEPENDENT`
* `SHARED_RESOURCE`

Only independent work should normally execute fully in parallel.

Dependent tasks must respect execution order.

Shared-resource tasks require explicit coordination.

---

# 4. Maintain File Ownership

Before agents begin modifying code, establish a lightweight ownership map.

Example:

| Area          | Agent   | Files/Modules | Access      |
| ------------- | ------- | ------------- | ----------- |
| Backend       | Agent A | API/services  | WRITE       |
| Frontend      | Agent B | UI/components | WRITE       |
| Tests         | Agent C | tests         | WRITE       |
| Shared types  | Primary | shared/types  | COORDINATED |
| Prisma schema | Primary | schema.prisma | COORDINATED |

Prefer giving each agent exclusive write ownership over its files.

Agents may inspect files outside their ownership when necessary, but should not modify them without coordination.

---

# 5. Shared File Protocol

Two or more agents must NOT independently modify the same file without coordination.

If multiple subtasks require the same file, the primary agent must choose one of these strategies.

## Strategy A — Single Owner

Preferred.

Assign one agent as the owner of the shared file.

Other agents:

* inspect the file;
* describe the required changes;
* communicate their requirements;
* do not independently modify it.

The owner integrates the necessary changes.

## Strategy B — Sequential Modification

Use when multiple agents genuinely need to modify the same file.

Order the modifications explicitly:

Agent A → complete change → Agent B → integrate next change.

Each agent must inspect the latest version before editing.

## Strategy C — Primary-Agent Integration

Agents work on independent surrounding components and report the changes required in the shared file.

The primary agent performs the final shared-file modification.

This strategy is preferred for critical files such as:

* database schemas
* central configuration
* authentication
* authorization
* shared types
* dependency configuration
* routing
* infrastructure
* CI/CD
* core business logic

Never allow agents to blindly overwrite another agent's work.

---

# 6. Agent Communication

When delegating a task, provide enough context for the agent to work correctly.

Each delegated task should include:

* exact objective
* scope boundaries
* relevant architecture
* relevant business rules
* files it owns
* files it must not modify
* known dependencies
* expected tests
* expected output

Agents must report:

* what they changed
* files modified
* assumptions made
* business rules affected
* tests performed
* unresolved concerns
* changes required from other agents

The primary agent uses these reports to coordinate integration.

---

# 7. Preserve Business Rules

Before accepting any implementation, verify that existing business rules remain valid.

Check:

* state transitions
* permissions and roles
* validations
* calculations
* inventory behavior
* billing behavior
* financial rules
* database constraints
* workflows
* authorization boundaries
* side effects
* domain invariants

Never change a business rule merely to simplify implementation.

If a requested feature conflicts with an existing rule, identify the conflict and ask the user before changing the rule.

---

# 8. Follow Project Architecture

All agents must follow existing project conventions unless there is a strong technical reason not to.

Respect:

* folder structure
* naming conventions
* architecture
* API patterns
* error handling
* logging
* validation
* authentication
* authorization
* database access patterns
* testing patterns
* dependency management
* documentation conventions

Avoid introducing a second architectural pattern when an established project pattern already solves the problem.

---

# 9. Code Quality Requirements

All generated or modified code should aim for:

* readability
* maintainability
* cohesion
* low coupling
* clear responsibilities
* explicit error handling
* input validation
* secure defaults
* minimal duplication
* appropriate abstractions
* meaningful naming
* testability

Apply relevant principles such as:

* SOLID
* DRY
* KISS
* separation of concerns
* least privilege
* defense in depth

Do not overengineer simple problems.

Do not create abstractions without a concrete benefit.

---

# 10. Security Review

For affected functionality, inspect for relevant security risks.

Examples:

* authentication bypass
* authorization failures
* missing role checks
* injection
* insecure input handling
* exposed secrets
* unsafe logging
* sensitive-data exposure
* insecure direct object references
* broken validation
* insecure API behavior

Security-sensitive files should preferably be coordinated or reviewed by the primary agent.

---

# 11. Integration Review

After delegated work is complete, the primary agent MUST review the combined implementation.

Do not assume that individually correct changes are collectively correct.

Verify:

### Architecture

* components interact correctly;
* boundaries remain clear;
* no unnecessary coupling was introduced.

### Business Logic

* rules remain consistent across modules;
* no workflow was accidentally changed;
* states and transitions remain valid.

### Interfaces

Verify consistency between:

* frontend ↔ backend
* API ↔ services
* services ↔ database
* types ↔ implementations
* schemas ↔ runtime behavior

### Shared Files

Verify that:

* no agent overwrote another agent's work;
* imports remain valid;
* shared types remain consistent;
* configuration remains coherent.

---

# 12. Validation

Run the relevant project validation whenever available.

Depending on the project, this may include:

* build
* type checking
* lint
* unit tests
* integration tests
* database tests
* security checks
* formatting checks

Do not blindly fix failing tests by changing expected behavior.

Determine whether the failure indicates:

1. an implementation defect;
2. an outdated test;
3. an intentional business-rule change;
4. an unrelated pre-existing issue.

If changing a test would alter the meaning of a business rule, ask before doing so.

---

# 13. Cross-Agent Conflict Resolution

If agents produce conflicting approaches:

1. stop automatic integration;
2. compare both implementations;
3. evaluate them against project architecture;
4. evaluate business-rule impact;
5. evaluate maintainability and security;
6. select or combine the safest compatible approach.

Do not choose an implementation merely because it was produced first.

If the correct choice depends on a product or business decision, ask the user.

---

# 14. Documentation Review

After implementation, determine whether the changes affect:

* business rules
* workflows
* architecture
* API behavior
* database structure
* configuration
* deployment
* security
* operational procedures

If so, update the appropriate project documentation.

Documentation must describe the resulting behavior, not merely the code changes.

---

# 15. Final Quality Gate

Before considering the task complete, the primary agent must verify:

* [ ] User requirements are satisfied.
* [ ] Relevant business rules remain valid.
* [ ] No conflicting agent modifications remain.
* [ ] Shared files were integrated correctly.
* [ ] Project architecture is respected.
* [ ] Code follows project conventions.
* [ ] Error handling is appropriate.
* [ ] Input validation is appropriate.
* [ ] Authorization remains correct.
* [ ] Security implications were reviewed.
* [ ] Relevant tests were added or updated.
* [ ] Existing relevant tests pass.
* [ ] Build/typecheck/lint pass when applicable.
* [ ] No unnecessary duplication was introduced.
* [ ] No obvious dead code was introduced.
* [ ] Documentation was updated when necessary.
* [ ] No unresolved assumptions remain hidden.

If any item cannot be verified, explicitly report it.

---

# 16. Final Report

At completion provide a concise report containing:

## Implementation

What was implemented.

## Parallel Execution

Which agents were used and what each handled.

If parallelization was not used, briefly state why it was unnecessary or unsafe.

## Files

Important files or modules modified.

## Business Rules

Business rules reviewed and whether any were changed.

## Validation

Tests, builds, linting, type checks, or other validation performed.

## Documentation

Documentation updated, if applicable.

## Remaining Concerns

Any unresolved risk, assumption, limitation, or follow-up work.

---

# Critical Rules

Never:

* parallelize blindly;
* let agents independently overwrite shared files;
* assume delegated work is correct;
* modify business rules silently;
* hide assumptions;
* change tests merely to make them pass;
* introduce architectural patterns unnecessarily;
* accept code solely because it compiles;
* mark a task complete without integration review.

The primary agent is the orchestrator and final reviewer.

Delegation distributes work.

It does not distribute responsibility.
