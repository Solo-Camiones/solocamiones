---
name: security-review
description: Perform an evidence-based security review of code, features, APIs, authentication, authorization, data handling, dependencies, configuration, and infrastructure. Do not modify files without explicit approval.
---

# Security Review

Perform a security-focused review of the requested scope.

DEFAULT MODE: READ ONLY.

Do not modify project files unless the user explicitly authorizes remediation.

# 1. Determine scope

The user may specify:

- repository;
- feature;
- milestone;
- branch/diff;
- API;
- module;
- authentication flow;
- deployment configuration.

If no scope is specified, ask what should be reviewed.

# 2. Understand the architecture

Inspect relevant:

- entry points;
- trust boundaries;
- authentication;
- authorization;
- API endpoints;
- database access;
- external integrations;
- secrets/configuration;
- infrastructure;
- frontend/backend boundaries.

Do not assume security controls exist.

Verify them.

# 3. Review attack surface

Evaluate relevant areas including:

## Authentication

- credential handling;
- session/token management;
- expiration;
- refresh behavior;
- logout/invalidation;
- brute-force protections.

## Authorization

- role checks;
- resource ownership;
- privilege escalation;
- missing server-side authorization;
- IDOR/BOLA risks.

## Input handling

- validation;
- injection;
- SQL injection;
- XSS;
- command injection;
- path traversal;
- unsafe parsing.

## API

- exposed endpoints;
- authentication requirements;
- authorization;
- mass assignment;
- excessive data exposure;
- rate limiting when relevant.

## Data

- sensitive data exposure;
- logging of secrets;
- encryption requirements;
- database permissions;
- backups when relevant.

## Configuration

- environment variables;
- secrets;
- CORS;
- cookies;
- CSRF;
- HTTPS/TLS assumptions;
- debug settings.

## Dependencies

Inspect security-sensitive dependencies and unsafe usage patterns when relevant.

## Infrastructure

When in scope inspect:

- containers;
- exposed ports;
- Docker configuration;
- reverse proxy;
- CI/CD;
- secret handling;
- deployment configuration.

# 4. Evidence requirement

Every finding must include:

- affected component;
- evidence;
- attack/precondition;
- possible impact;
- recommended remediation.

Do not report hypothetical vulnerabilities as confirmed vulnerabilities.

Distinguish:

CONFIRMED
LIKELY
DEFENSE-IN-DEPTH
INFORMATIONAL

# 5. Prioritize

Classify findings:

CRITICAL
HIGH
MEDIUM
LOW
INFORMATIONAL

Severity must consider:

- exploitability;
- required access;
- impact;
- exposed data;
- existing mitigations.

Do not inflate severity.

# 6. Report

For each finding provide:

### Finding
### Severity
### Status
### Evidence
### Attack scenario
### Impact
### Recommended fix
### Files/components affected

Then provide:

## Security posture summary

Summarize major themes without claiming the system is "secure" merely because no issue was found.

# 7. Wait for remediation approval

Do not implement fixes automatically.

Ask which findings the user wants remediated.

If the user says to fix all findings, proceed in severity order.

# 8. Remediation

When authorized:

- make minimal changes;
- preserve behavior;
- add security tests when appropriate;
- avoid breaking existing workflows.

# 9. Validate

After remediation run relevant:

- tests;
- security tests;
- typecheck;
- lint;
- build.

Re-check the original finding.

# 10. Documentation impact

Determine whether remediation changed:

- authentication;
- authorization;
- security requirements;
- environment variables;
- deployment;
- infrastructure;
- operational procedures.

Update canonical documentation when appropriate.

# 11. Final report

Report:

- remediated findings;
- remaining findings;
- validation performed;
- documentation updated;
- residual risks.