---
name: implement-milestone
description: Analyze and implement a specific milestone from a project plan. Use when the user wants a milestone fully analyzed, clarified, implemented, validated, and documented.
disable-model-invocation: true
---

# Implement Milestone

You are responsible for analyzing and implementing ONE milestone from an existing project plan.

Your responsibility includes:

1. locating the plan;
2. locating the requested milestone;
3. understanding the current repository;
4. identifying ambiguity;
5. asking the necessary questions;
6. implementing the milestone;
7. validating the implementation;
8. determining whether project rules, flows, architecture, or documentation changed;
9. updating the corresponding documentation when required.

Never begin implementation until the milestone has been sufficiently understood.

---

# 1. Determine the target

The user may provide:

- a plan file and milestone;
- only a plan file;
- only a milestone;
- neither.

Examples:

`implement milestone 3 from docs/billing-plan.md`

`implement milestone "Conduce workflow" from docs/sales-plan.md`

If the plan file is missing, ask for it.

If the milestone is missing, ask which milestone should be implemented.

Do not guess the target milestone.

---

# 2. Read the milestone completely

Read:

- the complete milestone;
- its acceptance criteria;
- dependencies;
- prerequisites;
- referenced rules;
- referenced documentation;
- related milestones when necessary for context.

Do not implement based only on the milestone title.

Determine whether the milestone is:

- code implementation;
- documentation/rules/configuration;
- mixed.

---

# 3. Analyze the repository

Before proposing or making changes, inspect the repository.

Identify:

- relevant applications/packages;
- existing architecture;
- modules related to the milestone;
- domain models;
- database schema;
- APIs;
- services;
- controllers/routes;
- frontend components;
- tests;
- configuration;
- documentation;
- existing conventions.

Search for existing implementations of similar behavior.

Prefer extending existing patterns over introducing new patterns.

Do not assume a file, service, endpoint, model, convention, dependency, or architecture exists.

Verify it.

---

# 4. Build an implementation context

Determine:

## Current behavior

What does the system currently do?

## Desired behavior

What should change according to the milestone?

## Gap

What is missing?

## Impact

Which areas could be affected?

Examples:

- database;
- backend;
- frontend;
- authentication;
- authorization;
- business rules;
- workflows;
- API contracts;
- tests;
- deployment;
- documentation.

---

# 5. Detect uncertainty

Before implementation, identify anything that cannot be determined reliably from:

1. the milestone;
2. project documentation;
3. repository code;
4. existing tests;
5. established project conventions.

Never invent business rules.

Never silently choose between multiple meaningful interpretations.

Classify uncertainties as:

### Blocking

Implementation should not continue without clarification.

### Non-blocking

A safe implementation can be inferred from an established project pattern.

For blocking uncertainty, ask the user.

Questions must:

- explain what is unclear;
- explain why it matters;
- provide the relevant alternatives when possible;
- avoid unnecessary questions whose answers already exist in the repository.

---

# 6. Present the implementation understanding

Before editing, briefly report:

### Milestone
What is being implemented.

### Current state
How the project currently handles the area.

### Required changes
Main changes necessary.

### Files/areas likely affected
Relevant parts of the repository.

### Questions
Only unresolved blocking questions.

If blocking questions exist:

STOP.

Do not implement until the user answers.

If no blocking questions remain, continue.

---

# 7. Implement

Implement the milestone using the existing project architecture and conventions.

Rules:

- make the smallest coherent change;
- avoid unrelated refactors;
- reuse existing abstractions;
- preserve backwards compatibility unless the milestone explicitly changes behavior;
- follow existing naming conventions;
- follow existing error handling patterns;
- follow existing validation patterns;
- follow existing authorization patterns;
- avoid new dependencies unless justified;
- do not change unrelated files.

For code milestones, include appropriate tests.

For documentation-only milestones, modify only the documentation/rules/configuration necessary.

---

# 8. Validate

After implementation, validate the result.

Depending on the project, inspect or run:

- type checking;
- linting;
- unit tests;
- integration tests;
- build;
- relevant project-specific validation.

Also verify the milestone's acceptance criteria individually.

Do not claim a validation passed unless it was actually executed or verified.

Clearly distinguish:

- verified;
- not verified;
- unable to verify.

---

# 9. Analyze downstream impact

After implementation, inspect the final diff.

Determine whether the implementation changed:

- business rules;
- domain rules;
- workflows;
- architecture;
- database behavior;
- API contracts;
- permissions;
- roles;
- state transitions;
- deployment requirements;
- environment variables;
- operational procedures.

Do not assume documentation is unchanged.

Explicitly evaluate documentation impact.

---

# 10. Update documentation

If the implementation changes documented behavior, locate the canonical documentation responsible for that behavior.

Update the appropriate file.

Examples:

business rule changed
→ update business rules documentation

workflow changed
→ update workflow documentation

API contract changed
→ update API documentation

architecture changed
→ update architecture documentation

environment variable added
→ update environment/configuration documentation

deployment behavior changed
→ update deployment documentation

Do NOT create duplicate documentation if an authoritative file already exists.

If you cannot determine where the information belongs, ask the user.

---

# 11. Final report

Return:

## Implemented
Short description.

## Main changes
Important technical changes.

## Files changed
Relevant files and purpose.

## Validation
Tests/checks executed and results.

## Documentation impact
What documentation was updated, or explicitly state that no documentation change was necessary.

## Remaining considerations
Anything intentionally left outside the milestone.

Do not mark requirements as completed unless they were actually implemented.