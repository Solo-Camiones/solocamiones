---
name: debug-issue
description: Systematically investigate, identify, explain, fix, test, and document a bug or unexpected behavior without guessing its root cause.
---

# Debug Issue

Investigate and resolve bugs using evidence from the repository and runtime behavior.

Never modify code before identifying a plausible root cause supported by evidence.

# 1. Understand the issue

Determine:

- expected behavior;
- actual behavior;
- reproduction steps;
- environment;
- relevant error messages;
- when the issue started, if known.

If essential information is missing, ask the user.

Do not assume symptoms are the root cause.

# 2. Investigate

Inspect relevant:

- code;
- logs;
- tests;
- database/schema;
- API contracts;
- configuration;
- environment variables;
- dependencies;
- recent changes when useful.

Trace the execution path responsible for the behavior.

Prefer evidence over speculation.

# 3. Reproduce

When possible, reproduce the issue.

Identify:

- entry point;
- failing path;
- conditions required;
- affected layer.

Do not claim reproduction unless actually reproduced.

# 4. Root cause analysis

Separate:

SYMPTOM
ROOT CAUSE
CONTRIBUTING FACTORS

Explain the evidence connecting the root cause to the observed behavior.

If multiple causes remain possible, continue investigating.

Do not select one arbitrarily.

# 5. Impact analysis

Before fixing, determine whether the issue affects:

- other workflows;
- database state;
- API behavior;
- frontend behavior;
- authorization;
- business rules;
- existing users/data;
- tests;
- documentation.

# 6. Proposed fix

Explain:

- root cause;
- proposed fix;
- files likely affected;
- potential side effects.

If the fix requires a new business decision or changes expected behavior, ask the user before proceeding.

Otherwise continue with the fix.

# 7. Implement

Apply the smallest fix that addresses the root cause.

Avoid:

- unrelated refactors;
- suppressing errors without fixing the cause;
- weakening validation;
- deleting failing tests;
- bypassing security controls.

# 8. Regression protection

Add or update tests when appropriate.

The test should reproduce the bug before the fix and verify the corrected behavior.

# 9. Validate

Run relevant:

- tests;
- typecheck;
- lint;
- build;
- integration checks.

Clearly distinguish executed checks from checks that could not be executed.

# 10. Documentation impact

Inspect the final diff.

Determine whether the fix changes:

- business behavior;
- workflows;
- API contracts;
- configuration;
- architecture;
- operational procedures.

Update canonical documentation when necessary.

Do not document internal bug-fix details unless they affect expected system behavior.

# 11. Final report

Report:

## Root cause
## Fix
## Files changed
## Tests added/updated
## Validation
## Documentation impact
## Remaining risks