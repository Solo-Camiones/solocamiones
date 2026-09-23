---
name: update-documentation
description: Analyze the current implementation and synchronize canonical project documentation with the actual behavior of the system without inventing undocumented behavior.
---

# Update Documentation

Synchronize project documentation with the actual implementation.

The repository implementation is evidence of technical behavior.

Explicit business decisions and canonical business-rule documentation take precedence for business intent.

Never invent rules to fill documentation gaps.

# 1. Determine scope

The user may provide:

- milestone;
- feature;
- branch;
- diff;
- commit;
- module;
- documentation file;
- entire repository.

If scope is unclear, ask.

# 2. Locate documentation

Identify existing documentation relevant to the scope.

Look for:

- README;
- docs/;
- architecture documentation;
- business rules;
- workflows;
- API documentation;
- deployment documentation;
- environment/configuration documentation;
- AGENTS.md;
- project rules.

Prefer updating canonical documentation over creating new files.

# 3. Inspect implementation

Determine the actual current behavior from:

- code;
- schema;
- routes;
- services;
- tests;
- configuration;
- infrastructure;
- relevant git changes.

Do not document behavior solely because a filename or comment suggests it exists.

Verify implementation.

# 4. Compare

Classify documentation as:

UP TO DATE
OUTDATED
MISSING
CONTRADICTORY
UNCLEAR

Identify concrete discrepancies.

# 5. Resolve conflicts carefully

If code contradicts documentation:

Do not automatically assume the code is correct.

Determine whether:

A. documentation is outdated;
B. implementation is incorrect;
C. a business decision is ambiguous.

If the correct source of truth cannot be determined, ask the user.

# 6. Update documentation

Update only affected documentation.

Requirements:

- concise;
- factual;
- consistent terminology;
- reflect current behavior;
- preserve useful existing context;
- avoid implementation trivia unless technically relevant.

Do not duplicate information across multiple documents unnecessarily.

# 7. Rules and workflows

Pay special attention to changes involving:

- business rules;
- states;
- state transitions;
- permissions;
- roles;
- validation;
- billing;
- inventory;
- fiscal behavior;
- external integrations.

These changes should be documented explicitly.

# 8. Technical documentation

Update when relevant:

- API contracts;
- environment variables;
- database behavior;
- architecture;
- deployment;
- Docker;
- CI/CD;
- infrastructure;
- external services.

# 9. Validate documentation

After editing:

- reread modified sections;
- verify links/references;
- check terminology consistency;
- compare against implementation again.

# 10. Report

Return:

## Documentation updated
Files changed.

## Changes documented
Important behavior added/changed.

## Conflicts discovered
Code/documentation inconsistencies.

## Questions
Any unresolved source-of-truth issues.