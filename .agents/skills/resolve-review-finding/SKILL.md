---
name: resolve-review-finding
description: Analyze findings from code reviews or security reviews, determine their real impact on the project, propose an appropriate remediation, wait for explicit user authorization, and only then implement and validate the fix.
---

# Resolve Review Finding

Use this skill when the user provides a finding discovered during:

- Code review
- Security review
- Static analysis
- Dependency analysis
- SonarQube / SonarCloud
- CodeQL
- Automated review tools
- AI-assisted review
- Manual engineering review

The goal is to determine whether the finding actually applies to the current project, understand its impact, propose the safest and most appropriate remediation, and implement it only after explicit user approval.

## Core rule

NEVER modify code, configuration, documentation, dependencies, tests, migrations, infrastructure, or project files during the analysis phase.

Analysis and implementation are two separate phases.

You MUST receive explicit authorization from the user before making any modification.

Examples of valid authorization:

- "Corrígelo"
- "Procede"
- "Implementa la solución"
- "Haz el fix"
- "Aplica los cambios"
- "Sí"

If authorization is ambiguous, ask for confirmation.

---

# Phase 1 — Receive the finding

The user may provide:

- The complete review finding
- An error message
- A vulnerability description
- A CodeQL/Sonar finding
- A file and line reference
- A recommendation from another AI agent
- A code snippet
- A description of unexpected behavior

If the finding lacks information needed to investigate it correctly, ask the user for the missing information.

Do NOT assume missing details.

---

# Phase 2 — Investigate the project

Before reaching a conclusion, inspect the relevant parts of the codebase.

Determine:

1. Where the finding originates.
2. Which files/modules/components are involved.
3. What code path is affected.
4. Whether the finding is actually valid in the current implementation.
5. Whether existing protections already mitigate it.
6. Whether the finding could be a false positive.
7. What dependencies or systems interact with the affected code.
8. Whether fixing it could introduce regressions or behavioral changes.

Trace the implementation far enough to understand the real context.

Do not analyze the finding in isolation if related code affects its behavior.

For security findings, inspect relevant trust boundaries, validation, authorization, authentication, data flow, and external inputs when applicable.

---

# Phase 3 — Classify the finding

Determine the finding type, for example:

- Bug
- Security vulnerability
- Code quality
- Reliability
- Performance
- Maintainability
- Architecture
- Configuration
- Dependency
- Testing
- Infrastructure

Also determine:

### Validity

Use one of:

- Confirmed
- Likely valid
- Needs more information
- False positive

Explain why.

### Severity

Use one of:

- Critical
- High
- Medium
- Low
- Informational

Severity must be based on the actual project context, not only on the review tool's original severity.

Explain the reasoning.

---

# Phase 4 — Impact analysis

Explain what happens if the finding is not fixed.

Analyze relevant impact such as:

- Security
- Data integrity
- Authentication
- Authorization
- Business logic
- User experience
- Availability
- Performance
- Maintainability
- Deployment
- Infrastructure
- Database
- API behavior
- Frontend behavior

Identify the affected scope.

Clearly distinguish:

- Current confirmed impact
- Potential impact
- Conditions required for the problem to occur

Do not exaggerate hypothetical risks.

---

# Phase 5 — Root cause

Identify the root cause whenever possible.

Do not only describe the symptom.

Explain:

- Why the issue exists
- What implementation decision causes it
- What conditions trigger it
- Why existing protections or tests did not prevent it, when relevant

---

# Phase 6 — Proposed remediation

Determine the best solution that fits the existing project architecture and conventions.

Prefer the smallest safe change that fixes the root cause.

Explain:

### Recommended solution

Describe exactly what should change and why.

### Files likely affected

List the files/modules that would probably need modification.

### Expected behavior after the fix

Explain how the system should behave once corrected.

### Risks

Describe possible:

- Regressions
- Breaking changes
- Compatibility issues
- Migration requirements
- Deployment implications

### Tests required

Identify tests that should be added or updated.

When appropriate include:

- Unit tests
- Integration tests
- API tests
- Security regression tests
- Frontend tests
- Manual verification

---

# Phase 7 — Stop and request authorization

After completing the analysis, STOP.

Present a concise summary using this structure:

## Finding

[Finding being analyzed]

## Verdict

Validity:
Severity:
Type:

## Why it happens

[Root cause]

## Impact

[Actual impact on the project]

## Proposed fix

[Recommended remediation]

## Files likely affected

[Files/modules]

## Risks / considerations

[Relevant risks]

## Validation plan

[Tests/checks that should be performed]

## Authorization

No changes have been made.

Ask:

"¿Quieres que proceda con la implementación de esta corrección?"

DO NOT continue until the user explicitly authorizes implementation.

---

# Phase 8 — Implementation

Only enter this phase after explicit user authorization.

Before editing:

1. Re-check the affected code.
2. Confirm the proposed solution still matches the current codebase.
3. Identify any changes since the initial analysis.

Then implement the smallest safe fix.

Follow:

- Existing architecture
- Existing naming conventions
- Existing coding style
- Existing error handling patterns
- Existing security patterns
- Existing testing strategy

Do not perform unrelated refactors.

Do not fix unrelated findings unless the user authorizes them.

If another issue is discovered while implementing the fix, report it separately instead of silently expanding the scope.

---

# Phase 9 — Validation

After implementation:

1. Run relevant tests.
2. Run lint/type checking when applicable.
3. Run relevant security/static analysis when available.
4. Verify the original finding is resolved.
5. Check for obvious regressions.

Do not claim success if validation fails.

Clearly report any validation that could not be executed.

---

# Phase 10 — Documentation impact

After the fix, determine whether the change affects:

- Business rules
- Application flows
- API contracts
- Security rules
- Authentication/authorization
- Architecture
- Infrastructure
- Deployment
- Environment variables
- Database behavior
- Developer instructions

If documentation should change, identify the appropriate existing documentation file.

Update documentation only when the implementation actually changes documented behavior or rules.

Do not create unnecessary documentation.

---

# Final report

After implementation provide:

## Changes made

[Summary]

## Files modified

[List]

## Tests / validation

[Results]

## Original finding

Resolved / Partially resolved / Not resolved

## Documentation

[Updated / No update required]

## Additional findings

Report newly discovered issues separately.

Do not implement additional findings without authorization.
