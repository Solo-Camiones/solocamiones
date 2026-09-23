---
name: plan-milestone
description: Analyze a project milestone, inspect the repository, identify uncertainties, ask clarifying questions, and explain exactly how it should be implemented without modifying the project until explicit approval is given.
disable-model-invocation: true
---

# Plan Milestone

Analyze ONE milestone from a project plan and produce an implementation strategy.

You MAY:

- read files;
- search the repository;
- inspect code;
- inspect documentation;
- inspect git history when useful;
- inspect tests;
- inspect schemas;
- inspect configuration;
- run read-only analysis commands.

You MUST NOT:

- modify files;
- create files;
- delete files;
- apply patches;
- implement code;
- change documentation;
- perform destructive commands;

until the user explicitly authorizes implementation.

---

# 1. Determine the target

Determine:

- plan file;
- milestone.

If either is missing, ask the user.

Never guess the milestone.

---

# 2. Understand the milestone

Read the milestone completely.

Identify:

- objective;
- requirements;
- acceptance criteria;
- dependencies;
- business rules;
- technical constraints.

Classify it as:

- code;
- documentation/configuration;
- mixed.

---

# 3. Inspect the existing implementation

Investigate how the project currently handles the relevant functionality.

Inspect:

- architecture;
- database;
- backend;
- frontend;
- APIs;
- domain models;
- services;
- tests;
- configuration;
- documentation.

Search for similar existing implementations.

Do not assume project structure or behavior.

Verify it.

---

# 4. Compare current vs desired state

Produce:

### Current behavior

What exists today.

### Desired behavior

What the milestone requires.

### Gap

What must change.

### Impact

Which areas of the system could be affected.

---

# 5. Identify uncertainty

Determine what cannot be answered from the repository or documentation.

Never invent business rules.

Never silently choose between meaningful alternatives.

Identify anything that cannot be determined explicitly and confidently from the milestone, repository, documentation, tests, or established project conventions.

Never invent or assume requirements, business rules, technical decisions, expected behavior, or user intent.

Ask about ANY uncertainty, ambiguity, missing information, conflicting information, or situation where multiple reasonable approaches exist.

Do not limit questions only to issues that block implementation.

If you have a genuine doubt, ask.

Do not silently choose between multiple reasonable alternatives.

For every question:

- explain what is unclear;
- explain why it matters;
- provide the relevant options when possible;
- explain technical or business trade-offs when useful;
- state which existing evidence led to the question.

Do not ask questions whose answers can be reliably determined by inspecting the repository or existing documentation.

If ANY unresolved question remains:

STOP and wait for the user's answer before continuing with the final implementation plan.

---

# 6. Design the implementation

Once requirements are sufficiently clear, produce a concrete implementation proposal.

Explain:

### Architecture

How the feature should fit into the current architecture.

### Backend

Models, services, APIs, validations, authorization, etc.

### Database

Schema or migration changes if required.

### Frontend

Components, state, API integration and UX changes.

### Tests

Tests required to validate the milestone.

### Documentation

Which documentation may need updates.

### Risks

Possible regressions, edge cases and compatibility concerns.

---

# 7. Proposed file changes

List likely files as:

CREATE
MODIFY
DELETE

Explain why each change would be necessary.

Do not actually modify them.

---

# 8. Implementation sequence

Provide the recommended implementation order.

Example:

1. schema/domain changes
2. migration
3. backend logic
4. API
5. frontend
6. automated tests
7. documentation
8. final validation

Adapt this sequence to the actual milestone.

---

# 9. Wait for approval

End with:

"Analysis complete. No project files have been modified.

If you want me to proceed with this implementation, explicitly authorize the implementation."

Do not implement based on vague acknowledgements.

Implementation requires clear authorization such as:

- "implement it";
- "proceed";
- "go ahead with the implementation";
- equivalent explicit instruction.

---

# 10. After approval

After explicit approval:

1. implement the agreed plan;
2. follow existing project conventions;
3. run relevant validation;
4. inspect the final diff;
5. analyze documentation impact;
6. update canonical documentation when required;
7. report the result.

If implementation reveals ANY new uncertainty, ambiguity, missing requirement, conflicting information, or decision that was not identified during analysis:

STOP.

Explain the newly discovered uncertainty and ask the user before continuing.

Never resolve a newly discovered uncertainty by assumption, even if one option appears more likely or easier to implement.