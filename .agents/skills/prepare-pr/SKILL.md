---
name: prepare-pr
description: Perform a comprehensive pre-PR review of the current branch, validate changes, identify risks, verify documentation, and prepare a PR summary without creating or pushing the PR unless explicitly requested.
---

# Prepare PR

Prepare the current branch for a Pull Request.

Do not push, merge, create a PR, or modify git history unless explicitly requested.

# 1. Determine PR context

Identify:

- current branch;
- target branch;
- commits;
- diff against target.

If target branch cannot be reliably determined, ask the user.

Do not assume main is always the target.

# 2. Understand the changes

Inspect the complete diff.

Determine:

- purpose;
- features;
- fixes;
- refactors;
- documentation changes;
- configuration changes;
- migrations;
- dependencies.

Ignore unrelated repository history.

# 3. Review code

Look for:

- bugs;
- regressions;
- incomplete implementation;
- duplicated logic;
- dead code;
- incorrect error handling;
- inconsistent patterns;
- type issues;
- unsafe assumptions.

# 4. Check milestone/requirements

If the branch corresponds to a milestone or plan:

locate it and verify each acceptance criterion.

Classify each as:

PASS
PARTIAL
FAIL
NOT VERIFIED

Never mark PASS without evidence.

# 5. Security review

Perform a focused security review of changed code.

Inspect relevant:

- authentication;
- authorization;
- validation;
- sensitive data;
- API exposure;
- secrets;
- configuration;
- database access.

Escalate significant findings before recommending PR readiness.

# 6. Tests

Identify tests affected by the changes.

Run relevant project checks when available:

- unit tests;
- integration tests;
- typecheck;
- lint;
- build.

Do not hide failing checks.

# 7. Database

If database/schema changes exist, inspect:

- migrations;
- backwards compatibility;
- constraints;
- indexes;
- destructive operations;
- data migration requirements.

# 8. API compatibility

If API changes exist, inspect:

- request contracts;
- response contracts;
- status codes;
- validation;
- backwards compatibility;
- frontend consumers.

# 9. Documentation

Determine whether the changes affect:

- business rules;
- workflows;
- API;
- architecture;
- configuration;
- deployment;
- security;
- environment variables.

Verify corresponding documentation was updated.

If documentation should be updated but was not, report it.

# 10. Scope integrity

Detect unrelated changes.

Report files or changes that do not appear related to the branch objective.

# 11. Final assessment

Classify issues as:

BLOCKING
IMPORTANT
MINOR
INFORMATIONAL

Do not silently fix BLOCKING or IMPORTANT issues.

Explain them first.

# 12. PR preparation

When no blocking issues remain, generate:

## Suggested PR title

Use the project's naming conventions when identifiable.

## PR description

Include:

### Summary
### What changed
### Why
### Testing
### Documentation
### Database changes
### Security considerations
### Screenshots/manual verification if relevant

# 13. Git safety

Never automatically:

- push;
- force push;
- merge;
- rebase;
- delete branches;
- rewrite commits;
- create tags.

These require explicit user instruction.

# 14. Final report

Return:

## PR readiness
Ready / Needs attention

## Blocking issues

## Important issues

## Validation performed

## Documentation status

## Suggested PR title

## Suggested PR description