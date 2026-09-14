# Milestone 4 — CI and Release 1 smoke

Status: completed. Local harness verified 2026-09-03. The owner confirmed on 2026-09-07 that the GitHub **CI R1** run and required **R1 quality** merge check are done. The post-update npm audit completed successfully on 2026-09-04 with zero vulnerabilities.

## Local verification result (2026-09-03)

All 501 tests pass after a clean `npm ci`: 43 API unit, 15 API integration, 256 web unit, 68 web integration
and 119 web component tests. Typechecking and build pass. ESLint has no errors and
four existing React Fast Refresh warnings. The workflow YAML parses successfully.
These checks ran on Windows with Node.js 24. The owner confirmed on 2026-09-07 that
the Ubuntu/Node.js 22 GitHub job and the required **R1 quality** check are complete.
Prisma generation and configuration loading pass; `npm ls`
with npm 11.19.1 confirms Prisma/Client 6.19.3, deepmerge-ts 8.0.0 and qs 6.16.0
without invalid dependency edges. An installation attempt with npm 11.17 fails with
`EBADENGINE` and leaves the lockfile unchanged.

Initial post-update npm audit requests failed with a timeout or HTTP 503. A later
retry on 2026-09-04 completed successfully with `found 0 vulnerabilities`. The
mandatory audit step remains enabled with its original high-severity threshold.

## Dependency correction

Prisma and Prisma Client remain at 6.19.3, the latest published Prisma 6 release
checked during implementation. The root override replaces deepmerge-ts only under
`@prisma/config@6.19.3` with 8.0.0, fixing
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
`qs` is updated from 6.15.3 to 6.16.0 within the ranges already accepted by Express,
body-parser and Superagent. No audit exceptions or forced Prisma downgrade are used.

Deepmerge-ts 8 changes Map merging and some type exports. Prisma's installed config
loader uses its `deepmerge` function for configuration; the compatibility test
`tests/unit/infrastructure/prisma-config.test.ts` invokes the real Prisma CLI with
a config fixture and validates the existing schema. The regular tests also cover
client generation, clean migrations, health and the HTTP error contract.
Reassess and remove the version-scoped override when Prisma provides an upstream fix.

npm 11.17 ignored the root override through the workspace link. The fix is recorded
in [npm's workspace override change](https://github.com/npm/cli/pull/9673).
The project now declares npm 11.19.1, with an engine requirement enforced by `.npmrc`;
CI and both Dockerfiles install that version before `npm ci`. This prevents an older
installer from silently restoring the vulnerable dependency. The developer's global
npm installation is not changed automatically; run `npm install --global npm@11.19.1`
before future dependency installations.

## Pull request workflow

`.github/workflows/ci.yml` runs for pull requests targeting `main`, pushes to `main`,
and manual dispatch. Its required check is named **R1 quality**. A new commit on a
pull request cancels the superseded run.

The job uses Node.js 22 (matching the application Dockerfiles), npm 11.19.1 and PostgreSQL 16.
GitHub creates a disposable PostgreSQL service for each job. The workflow contains
test-only credentials and needs no database secrets or access to a local machine.
Only `DATABASE_URL_TEST` is set; the test harness assigns it to Prisma after validation.

The sequence is locked installation, Prisma generation, lint, application/test
typechecking, unit tests, clean migrations and integration tests, web component tests,
API/web build, and dependency audit. Audit fails for high or critical findings; any
finding must be reviewed rather than automatically fixed. The workflow does not deploy.

The API integration setup resets the test database once per run and reapplies committed
migrations. It fails if the connection is missing, unsafe or unavailable. Unit tests
do not require PostgreSQL. The integration command destroys existing test data;
never use a database that must be preserved.

## Smoke scope by milestone

| Check                                                                                             | Current automation                                  | When completed |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------- |
| Migrations from a clean database                                                                  | API integration global setup                        | M4             |
| `GET /api/health/live` returns 200                                                                | Real API integration test                           | M4             |
| `GET /api/health/ready` returns 200 with database/migrations ready                                | Real PostgreSQL integration test                    | M4             |
| Readiness returns 503 for database/migration failures                                             | HTTP tests with repository doubles                  | M4             |
| Valid login sets a session cookie; invalid/inactive login is rejected                             | Add `tests/integration/access/*.test.ts`            | M6             |
| Session lookup accepts a valid cookie and rejects missing/expired sessions; logout invalidates it | Reuse a Supertest agent and test fixtures           | M6             |
| Administrator allowed; Seller/Mechanic denied; missing session rejected                           | `tests/integration/access/authorization-http.test.ts` | M7             |
| Mechanic receives only the allowed session projection                                             | Same file + unit `projection.test.ts`                 | M7             |

New `tests/integration/**/*.test.ts` files are discovered automatically by the existing
integration command. Create user fixtures only when User/Session models exist in M5.
Do not add passing auth stubs or interpret a green M4 run as proof of M6/M7 coverage.
Release 1 requires the full smoke scope at M11. The frontend stays in mock mode for M4.

## Local verification

Start PostgreSQL with `docker compose up -d db` and configure `DATABASE_URL_TEST` in
the root `.env` for the disposable database. Run from the repository root:

```bash
npm run db:generate
npm run lint
npm run typecheck
npm run typecheck:test --workspace @truck-parts/web
npm run test:unit
npm run test:integration
npm run test:web:component
npm run build
npm audit --audit-level=high
```

CI uses `npm ci` on a fresh checkout. The owner confirmed on 2026-09-07 that the
GitHub runner execution and the required **R1 quality** check are complete.

## Repository owner configuration

Completed on 2026-09-07 (owner confirmation):

1. Release 1 pull request / **CI R1** run inspected and green.
2. **R1 quality** required for merge to `main`.
3. Branch protection / ruleset for `main` includes that check.

The steps below remain as the historical how-to. Do not treat them as open work.

1. Push the release branch and open its pull request into `main`.
2. Check **Actions → CI R1**, or the PR checks, and inspect the run.
3. In **Settings → Branches**, create or edit a branch protection rule for `main`.
4. Enable **Require a pull request before merging** and **Require status checks to
   pass before merging**. Select **R1 quality** after it has appeared in a run.
5. Enable **Require branches to be up to date before merging** so the check applies
   against the current base branch. Apply the rule to administrators/bypass roles if
   the merge requirement should also constrain the owner.
6. Confirm that a failing required check prevents merging.

If the repository already uses an active ruleset for `main`, add the required check
to that ruleset instead of creating overlapping rules.

Sources: [PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers),
[required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
