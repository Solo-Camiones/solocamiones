# Infrastructure Plan

## Infrastructure Goals

Provide a production-safe path that one developer can operate without becoming a full-time infrastructure administrator. The platform must protect transactional PostgreSQL data, reliably receive mobile Work Order evidence, serve one same-origin mobile-capable web application over HTTPS, reproduce invoice PDFs, and make backup restoration and incident diagnosis practical.

This is a direction and decision record only. It does not deploy services, create Docker files, select a paid plan, or define exact provider commands.

## Validated Infrastructure Baseline — 2026-08-20

- The Mechanic surface is mobile-first and must work securely over HTTPS, including camera/photo upload from normal mobile browsers.
- BEFORE/AFTER evidence is mandatory for Work Order completion, so uploads need visible progress, retry, idempotent finalization, and recovery from interrupted connections.
- PostgreSQL remains the authority for commercial state, physical-operation state, evidence metadata, and history. Private object storage holds durable photo bytes and, if chosen, generated PDFs.
- A valid sale must survive PDF-rendering or storage failure. The confirmed immutable invoice facts must support deterministic regeneration.
- Every unexpected error returns a safe error ID correlated with structured logs. Health checks distinguish process liveness from dependency readiness.
- The MVP may call one external FX-rate provider solely to derive the `USD`-equivalent acquisition cost for profitability on `USD` invoices. That lookup uses a bounded timeout, stores provider credentials as secrets, and logs failures. It is **not** an essential commercial dependency: readiness must not fail merely because the provider is unreachable, and an unavailable rate never makes sale confirmation unavailable.
- Monitor the application, database, and object storage. Backups are incomplete until restoration and cross-store reconciliation have been tested.
- Infrastructure remains simple: one modular monolith with managed PostgreSQL and private object storage. No microservices, brokers, Kubernetes, event sourcing, workflow engine, or distributed-lock service is required.

## Phased Delivery Sequencing

`DEVELOPMENT_PLAN.md` now releases real billing/financial data before the full inventory and Work-Order MVP is complete. Therefore minimum production safety is required **before the first production deployment**, not during every local-development release.

### Local development through Release 1

Release 1 is implemented and verified **only in the local development environment** on the developer machine. It does not require staging, production hosting, managed backups, production HTTPS, or deploy/rollback execution.

### First production deployment

The **first production deployment** happens only after **Release 2 — Billing Core** is complete. Before that deployment, complete the operational baseline in this document, including at minimum:

- hosting provider selection;
- owner-approved RPO/RTO;
- separate staging and production environments;
- HTTPS and secure cookies in deployed environments;
- secrets management outside source control;
- database backup and tested restore;
- deploy/rollback procedure;
- staging smoke tests appropriate to the functionality being deployed.

Release 1 must not wait for these decisions. Release 2 must not go live without them.

Object storage can be introduced incrementally. Invoice PDFs must remain reproducible from preserved invoice facts; permanent PDF-object storage is optional. Item photos and especially Work-Order BEFORE/AFTER evidence require the validated private durable object-storage behavior when those releases are enabled.

## Recommended Primary Direction

Use three managed building blocks:

1. **Managed application platform** for the Node.js backend and built React frontend, preferably as one same-origin web service.
2. **Managed PostgreSQL** with automated backups, encryption, monitoring, and a supported upgrade path.
3. **S3-compatible object storage** for inventory and Work Order evidence photos, and optionally generated invoice PDFs, with durable storage, lifecycle controls, and versioning or equivalent recovery protection.

The managed application platform should own build execution, process restarts, health checks, TLS termination, logs, environment variables, and simple horizontal scaling. The backend remains a stateless modular monolith except for PostgreSQL-backed sessions and shared object storage.

**Why this fits:** the critical risk is incorrect or lost business data, not extreme traffic. Managed services place operational effort on transactions, permissions, backups, and restore tests instead of operating Linux, PostgreSQL, TLS, and storage manually.

**Tradeoff:** managed services cost more per unit of compute and create some provider coupling. That premium buys lower operational load, clearer support boundaries, and faster recovery for one developer.

Provider selection should be delayed until region, support, backup retention, data egress, object-storage compatibility, and budget requirements are confirmed. Avoid selecting solely by the lowest entry price.

## Managed Platform Compared with a VPS

| Concern | Managed app platform | Self-managed VPS |
|---|---|---|
| Initial setup | Build/deploy conventions and environment configuration | Operating system, runtime, firewall, proxy, certificates, deployment, and process manager |
| Ongoing work | Application updates and provider settings | OS patching, intrusion response, disk management, service upgrades, and all application work |
| PostgreSQL | Separate managed service with automated operations | Must be managed personally or still purchased separately |
| HTTPS and proxy | Usually built in | Nginx/Caddy and certificate automation must be operated |
| Scaling/recovery | Platform health checks and replacement | Manual design and recovery |
| Flexibility | Moderate; provider conventions apply | High; full host control |
| Solo-developer risk | Lower operational burden | More ways for a routine host issue to become business downtime |

### Recommendation

Choose the managed platform for the first production version. A VPS is reasonable only if there is a clear constraint—special networking, unsupported runtime behavior, provider unavailability, or sustained cost evidence—and the owner accepts explicit responsibility for patching, hardening, backups, monitoring, and recovery.

A VPS is not inherently cheaper after developer time and failure risk are included. Do not combine the first application release with learning production Linux/PostgreSQL operations unless that is itself a project goal.

## Local Development

Local development should resemble production where correctness depends on behavior, while remaining easy to reset:

- run the React development server and Node.js application locally;
- use a local PostgreSQL instance or disposable PostgreSQL container, not SQLite;
- use test-only databases for integration tests;
- use an S3-compatible local service or filesystem adapter behind the same photo-storage interface;
- use seeded non-sensitive demonstration data;
- keep environment-specific values in local environment files excluded from Git, with a committed example listing names but no secrets;
- run database migrations explicitly and review generated migration changes;
- test concurrency and transaction behavior against PostgreSQL.

### Optional local Compose stack (Release 1 developer convenience)

`docker-compose.yml` can run PostgreSQL, the API, nginx, and an optional Cloudflare quick tunnel. This does **not** satisfy first-production-deployment HTTPS, backups, or staging.

- The **API port is unpublished**. Only the `web` nginx container should call `api:3000`. Never publish `3000` to the host or LAN.
- nginx listens on **8081** (mapped to host `5173`) for local browsers. `X-Forwarded-For` is the connecting address (`$remote_addr`). The process runs as the unprivileged `nginx` user.
- nginx also listens on **8080**, reachable only on the Docker network. `cloudflared` targets `http://web:8080/`. On that port nginx prefers `CF-Connecting-IP`, then proxies a single replaced `X-Forwarded-For` to the API.
- Set `TRUST_PROXY=1` on the API **only** in this unpublished-behind-nginx layout so login/recovery rate limits key off that sanitized client address. A host-bound API (`npm run dev`, `TRUST_PROXY` unset/`0`) must ignore `X-Forwarded-For`; otherwise any peer that can reach port 3000 can spoof the rate-limit identity.
- Forward `EXCHANGE_RATE_API_KEY` from the host `.env` into the `api` service. Compose does not inject the file wholesale; without this mapping, USD confirm and profitability retry stay `PENDING_FX_RATE` even when the developer set the key.
- The tunnel terminates TLS at Cloudflare; the container hop to nginx remains HTTP. Cookies `Secure` still follow `NODE_ENV=production` (see `ARCHITECTURE_PLAN.md`). Do not treat a quick tunnel as the production cookie/HTTPS baseline.

Local photo storage is for convenience only. Integration tests before production must exercise the chosen S3-compatible provider behavior, including upload limits, signed access, and failure cleanup.

Mobile integration tests must also cover an interrupted upload, retry with the same upload identity, duplicate finalization, loss of connectivity after bytes arrive but before metadata confirmation, and recovery without falsely satisfying Work Order evidence requirements.

## Git Repository Strategy

Keep application code, documentation, migrations, and future infrastructure definitions in one private repository. Exclude secrets, generated artifacts, uploads, and production data. Protect the repository account with multifactor authentication and ensure the business can recover access.

## Branch Strategy

Use a lightweight trunk-based approach:

- `main` is always releasable and protected from accidental direct destructive changes.
- Work occurs in short-lived feature/fix branches.
- Each change is reviewed through a pull request or equivalent diff, even for a solo developer when the risk is material.
- Automated checks run before merge.
- Prefer small, focused commits and pull requests; do not keep long-running environment branches.
- Tag production releases and retain the exact application revision and migration set used.
- Use normal forward fixes. Do not rewrite shared history or force-push `main`.

This is simpler than Git Flow, which adds permanent development/release branches and merge overhead without a multi-team release process.

## Environments

### Local development

Used for daily implementation, unit tests, integration tests, seed/reset work, and destructive experimentation. It contains no production customer data or secrets.

### Staging

Use a separate small staging environment before the first real production use because this system combines migrations, file storage, sessions, inventory transactions, and payment/refund records. Staging must have separate PostgreSQL, object-storage namespace/bucket, secrets, and domain. It must never point at production data.

To control cost, staging may be scaled down, paused, or created on demand when the provider supports it. The requirement is a safe pre-production verification environment, not necessarily an always-running duplicate of production.

Use synthetic data. If production-like data is ever needed, define a deliberate anonymization process first.

### Production

Production contains live inventory, customer, sale, payment, cost, and history data. Deployments and migrations require controlled promotion, backup verification, and rollback/forward-fix planning. Direct manual data edits should be exceptional, authorized, and recorded.

**Recommendation:** start with all three levels—local, cost-controlled staging, and production. Eliminating staging saves one service set but moves migration and storage-integration discovery into production, an unacceptable tradeoff for the core atomic workflows.

## Docker

Docker is useful when it creates reproducibility, not as a goal itself.

### Recommended initial use

- A local PostgreSQL and optional S3-compatible emulator may run in containers if that is easier than native installation.
- The managed application platform may build directly from the repository using its supported Node build environment.
- Do not require a custom production image initially unless the chosen platform requires one or environment drift becomes a demonstrated problem.

### Benefits of a custom application image

- pins the operating system and runtime environment;
- provides consistent local/CI/production packaging;
- improves portability between platforms.

### Costs

- image authoring, security updates, registry management, build optimization, and debugging;
- another artifact and vulnerability surface for one developer to maintain;
- possible duplication of what the managed platform already handles.

**Decision:** do not create Docker/orchestration files merely because deployment exists. Reassess before the **first production deployment** (after Release 2) once the hosting platform is selected; create a Dockerfile only if the chosen deployment path benefits from it. Kubernetes is not justified for the expected scale or team.

## PostgreSQL

Use managed PostgreSQL as the authoritative relational store in staging and production.

Required provider capabilities:

- automated backups with a clearly documented retention period;
- point-in-time recovery if affordable/available at the selected service level;
- encrypted connections and storage;
- private networking or tightly restricted public access;
- database metrics, storage alerts, and connection visibility;
- controlled major-version upgrades;
- restoration to a separate database for verification;
- region compatible with application latency and recovery needs.

Use separate database credentials per environment and least-privilege runtime access. Migration privileges should be separate from normal application privileges where the platform makes this practical.

Application connections need bounded pooling appropriate to the managed plan. More application instances must not exhaust database connections. Do not add a separate pooler until provider guidance or measured load requires it.

Database and object backups together must recover the persisted state supporting `AUTH-001–AUTH-005`, `INV-001–INV-006`, `QTY-001–QTY-003`, `CAT-001–CAT-003`, `HIER-001–HIER-011`, `WO-001–WO-010`, `SEARCH-001–SEARCH-003`, `LOC-001–LOC-002`, `PHOTO-001`, `CUST-001–CUST-003`, `RES-001–RES-003`, `SALE-001–SALE-008`, `LINE-001–LINE-006`, `COST-001–COST-004`, `PAY-001–PAY-005`, `CANCEL-001–CANCEL-005`, `HIST-001–HIST-003`, and `ADMIN-001–ADMIN-002`. Search projections or indexes may be rebuilt, but source records must be recoverable. A photo backup without matching metadata, or a database restore without corresponding photo objects, is incomplete.

## Photo / File Storage

Store photo binaries in a dedicated private S3-compatible bucket or namespace per environment. Store object references, ownership, Work Order linkage, BEFORE/AFTER classification, integrity/size information, and durable upload state in PostgreSQL.

Recommended controls:

- block public bucket listing and public writes;
- use non-guessable generated object keys;
- grant the application only the operations and bucket prefix it needs;
- use short-lived signed access or backend-authorized delivery;
- validate upload size, MIME type, file signature, and allowed image formats;
- enable versioning or provider recovery controls when available;
- define lifecycle rules for abandoned staged uploads and retained historical photos;
- log object-storage failures without logging signed URLs or credentials.

Database and object storage cannot commit in one transaction. Use a staged-upload lifecycle:

1. authorize and create a server-known upload identity;
2. upload bytes with progress visible to the mobile client;
3. allow safe retry with the same identity after timeout or lost connectivity;
4. verify the durable object and atomically finalize its metadata/linkage;
5. count it as Work Order evidence only after finalization succeeds.

Retries and repeated finalization must be idempotent. A connection failure must leave the upload in a discoverable state rather than imply success or require the Mechanic to guess. Reconciliation identifies staged metadata without objects, objects without finalized metadata, and finalized metadata whose object is missing or invalid. Safe retry/recovery is exposed through controlled Administrator operations with error ID, actor, reason where appropriate, and history.

Retention cleanup must use conservative age/status rules and must never delete completed Work Order evidence merely because a temporary record appears stale. Photo deletion and retention policy must be decided before irreversible cleanup is enabled.

## Invoice PDF Storage and Regeneration

The confirmed invoice snapshot is the source of truth; a PDF is a reproducible output. PDF rendering must use only preserved invoice facts and a versioned template/calculation policy so regeneration does not read mutable customer, inventory, price, or hierarchy data.

Either of these simple approaches is acceptable:

- store the generated PDF in private object storage while retaining deterministic regeneration as recovery; or
- regenerate on demand from the immutable snapshot if measured latency and exact reproducibility are acceptable.

In both cases, record generation status and the document/template version. A rendering or storage failure must not roll back a valid confirmed sale. Administrator may retry/regenerate through a named recovery action. Access remains authorized and private, and repeated requests must not create conflicting invoice versions.

## Hosting

Deploy the modular monolith as one web service initially:

- build the React SPA during the release build;
- serve the built assets and Express API from the same origin;
- expose separate lightweight liveness and readiness checks;
- run database migrations as an explicit release step, not opportunistically from every application instance;
- use PostgreSQL-backed sessions so process restarts do not sign everyone out unexpectedly;
- keep local disk disposable and never use it as authoritative photo storage;
- configure graceful shutdown and bounded request timeouts;
- start with one appropriately sized instance and scale only from measured CPU, memory, latency, or availability needs.

Keep reconciliation, cleanup, PDF recovery, and pending-profitability retry as bounded application or scheduled maintenance responsibilities within the modular monolith. No separate worker service or broker is part of the MVP plan.

### Health semantics

- **Liveness** answers only whether the application process can respond. It should not fail merely because a dependency has a brief interruption that the process can recover from.
- **Readiness** verifies that the instance can safely serve essential requests, including its PostgreSQL connection and critical configuration. Object-storage status should be represented without making unrelated read-only inventory access disappear unnecessarily. The external FX-rate provider is not an essential readiness dependency; a provider outage must not mark the instance unready or make sale confirmation unavailable.
- Health responses expose only a coarse status. Dependency names, credentials, connection strings, stack traces, and provider details stay in protected logs.
- External checks exercise the public HTTPS path; internal checks support safe process replacement. Repeated readiness failure alerts an operator and includes a correlatable error ID.

## Reverse Proxy

Use the managed platform's edge proxy/load balancer. It should terminate HTTPS, route the custom domain, enforce request-size/time limits, and forward trusted proxy headers correctly.

Do not operate Nginx or Caddy separately in the primary managed direction. Self-managed reverse proxy configuration would be required only under the VPS alternative.

Keep the database off the public internet where provider networking allows it. If public access is unavoidable, restrict source networks, require TLS, use strong credentials, and monitor failed connections. Object storage remains private and is accessed through scoped credentials.

## HTTPS

Require HTTPS for every staging and production request. Redirect HTTP to HTTPS and use secure cookies only over HTTPS.

Prefer automatic certificate issuance and renewal from the hosting platform. Monitor renewal/domain validation status even when automated. Enable standard secure headers in the application/edge configuration and consider HSTS after confirming every subdomain is ready for HTTPS.

Local development may use HTTP because it is not publicly reachable; production security behavior involving secure cookies must still be tested in staging over HTTPS.

The mobile Mechanic journey must be tested over real staging HTTPS because camera/file access, secure cookies, upload limits, request timeouts, and connectivity recovery can differ from desktop local development. Pages must remain usable on supported phone sizes and make pending, failed, retrying, and completed upload state unmistakable.

## Domain

Use a business-controlled domain account, not a developer's personal account. Protect the registrar and DNS provider with multifactor authentication and recovery contacts owned by the business.

Recommended structure:

- production on the primary application subdomain;
- staging on a clearly separate subdomain;
- API under the same application origin rather than a separate cross-origin domain.

Document DNS records, ownership, renewal dates, and recovery access. Use low-risk DNS changes during launch and retain the previous target until the new service is verified where possible.

## Backups

Backups are only credible after a successful restore test.

### PostgreSQL

- Enable provider automated backups before live use.
- Prefer point-in-time recovery for production.
- Take or verify a recoverable backup before risky migrations and releases.
- Keep retention aligned with the business's acceptable data-loss window.
- Do not store the only independent export on the application host.

### Object storage

- Enable versioning/recovery protection when practical.
- Protect against accidental bulk deletion with least privilege and retention controls.
- Include Work Order evidence and any stored invoice PDFs in recovery scope.
- Reconcile restored database metadata with restored objects by object identity, expected size/integrity facts, linkage, and retention status.
- If PDFs are not backed up as objects, verify that the immutable invoice snapshot and template/calculation version needed for deterministic regeneration are recoverable.

### Restore testing

- Restore into an isolated environment, never over the live database.
- Verify representative users/roles; initial assembly checklist results and baseline provenance; inventory hierarchy and known missing components; quantity balances and weighted-average cost; reservations; sales/payments/cancellations/refunds; Work Order assignment/history; BEFORE/AFTER evidence; immutable assembly snapshots; and PDF access or deterministic regeneration.
- Run consistency diagnostics after restore and confirm there are no multiple current parents, cycles, duplicate active physical operations, impossible balances, orphan evidence, or unexplained missing objects.
- Test before launch, after a material storage/provider change, and on a recurring schedule such as quarterly.
- Record date, backup used, elapsed recovery time, validation result, and corrective actions.

Exact retention, recovery point objective (RPO), and recovery time objective (RTO) require owner approval before production.

## Monitoring

Start with a small actionable set:

- external uptime check of the application;
- separate liveness and readiness status with alerting on repeated failure;
- application error rate and request latency;
- structured centralized logs with request/error IDs;
- managed PostgreSQL availability, CPU, memory where exposed, connections, storage growth, slow queries, transaction failures, and backup status;
- object-storage availability, request latency/error rate, capacity, versioning/recovery status, and failed reconciliation count;
- failed login spikes and repeated authorization failures;
- failed sale confirmations, unexpected reservation/quantity conflicts, Mechanic claim conflicts, duplicate-operation conflicts, Work Order completion/cancellation races, refund failures, and migration failures;
- FX-rate lookup timeouts or errors and an operator-visible count of unresolved `UNAVAILABLE / PENDING FX RATE` profitability calculations;
- evidence uploads stuck in staging, repeated mobile retries, missing finalized objects, and PDF generation/regeneration failures;
- consistency-diagnostic findings for negative stock, orphan reservations, hierarchy violations, duplicate active operations, impossible balances, unresolved profitability calculations, and inconsistent critical state;
- automated-backup age/failure and overdue restore-test status;
- certificate and domain expiration/renewal status.

Alerts should reach at least one primary and one backup business/developer contact. Avoid alerting on every expected conflict; aggregate and set thresholds so alerts remain credible.

### Logging

Use structured, centralized application logs with request/error ID, timestamp, severity, operation, duration, outcome, and safe invoice/item/order/upload identifiers. Include enough context to distinguish validation conflicts, expected concurrent conflicts, storage failures, FX-rate lookup timeouts or errors, retries, and unexpected failures without exposing internals to the client. Redact secrets, session values, signed URLs, acquisition cost, FX provider credentials, unnecessary customer identity, and payment-sensitive details. History is not monitoring, and logs are not a financial audit: keep business events in the database and privacy-conscious operational logs for diagnosis.

The same error ID returned in a safe client response must locate the corresponding protected log event. Recovery actions and consistency-diagnostic runs log their outcome but preserve their authoritative actor/reason/before-after history in PostgreSQL.

## CI/CD

### Pull request checks

1. install dependencies from the lock file;
2. run formatting/lint checks;
3. run TypeScript type checking;
4. run unit tests;
5. run PostgreSQL-backed integration tests for critical transactions;
6. build frontend and backend;
7. scan dependencies for known high-severity issues and review rather than blindly auto-fixing.

During local-development releases (through Release 1), CI runs the checks above locally or in the repository pipeline. It does **not** require deployment.

### Release 1 CI smoke scope

While Release 1 is active, automated smoke/integration coverage must include at minimum:

- migrations on a clean test database;
- `/health/live`;
- `/health/ready`;
- login;
- authenticated session lookup;
- authorization negative tests for protected routes.

The installed-component sale smoke test belongs to a later release once that workflow exists.

### Promotion (first production deployment and later)

These steps apply **before the first production deployment** and for subsequent production releases. They are not part of Release 1 local-development completion.

- Merge reviewed changes to `main`.
- Deploy automatically to staging or create a staging release.
- Run migrations in staging and smoke tests appropriate to the release being deployed.
- Promote the exact tested revision to production with a manual approval.
- Run production migrations as a controlled release job.
- Verify health, logs, and core read-only behavior after release.

For the first production deployment after Release 2, include billing-appropriate smoke tests. The installed-component sale smoke test remains for the release that implements that workflow.

Do not begin with unattended automatic production deployment. One manual promotion gate is low overhead and appropriate while migration and rollback experience is developing.

Rollback is not simply deploying old code when a migration changed data. Prefer backward-compatible migrations and forward fixes. Every release involving a destructive or irreversible migration needs a specific recovery plan.

## Secrets

- Store production/staging secrets in the managed platform's encrypted secret/environment facility.
- Keep local secrets in ignored files; commit only an `.env.example`-style name list when implementation begins.
- Use separate values and service accounts for every environment.
- Never place database URLs, session secrets, object-storage keys, payment credentials, FX-rate provider credentials, or API tokens in Git, logs, screenshots, seeded data, or frontend build variables.
- Scope each credential to the minimum resources and operations.
- Rotate secrets after personnel/access changes or suspected exposure.
- Document who owns access and how emergency recovery works.

An unauthorized browser session must never receive acquisition-cost data merely because a screen hides it, and no browser may receive server credentials. Seller cost visibility and Administrator profitability access are enforced by backend authorization and least-privilege response projections.

## Disaster Recovery

Prepare a concise runbook before production:

1. identify incident owner and communication channel;
2. stop writes if continued operation risks compounding corruption;
3. preserve logs and establish the last known good time;
4. create a replacement application/database environment rather than overwriting evidence;
5. restore PostgreSQL to the approved point;
6. restore/reconcile object storage with evidence/PDF metadata, or regenerate PDFs from restored immutable snapshots;
7. rotate potentially exposed credentials;
8. run consistency checks on users/roles, inventory hierarchy and known missing components, reservations, quantities/cost, sales, payments, cancellations/refunds, Work Orders, immutable snapshots, history, evidence, and PDFs;
9. change DNS only after verification;
10. record data loss, recovery duration, owner communication, and follow-up actions.

Also plan for provider-region outage, accidental deletion, bad migration, compromised credential, and domain/DNS loss. Where a provider offers exports or standard S3/PostgreSQL interfaces, retain a documented exit path to reduce lock-in.

The owner must choose acceptable RPO and RTO. Without those values, backup frequency and recovery architecture cannot be finalized.

## Infrastructure Cost Categories

Evaluate total monthly and occasional cost by category, without relying on temporary introductory pricing:

- application compute and build minutes;
- managed PostgreSQL compute, storage, backups, point-in-time recovery, and connection features;
- object storage capacity, operations, version history, and data egress;
- staging resources;
- custom domain and DNS;
- centralized logs, monitoring, uptime checks, and alert delivery;
- backup exports or secondary storage;
- CI execution and artifact retention;
- email/SMS or payment services if later added;
- support tier;
- developer time for maintenance, restore tests, upgrades, and incidents.

The lowest-cost architecture is the smallest one that meets the agreed recovery and security requirements. Removing backups, staging verification, or restore tests is risk transfer, not a genuine saving.

## Initial Infrastructure Boundaries

Do not add at first:

- Kubernetes, service mesh, microservices, brokers, workflow engines, event sourcing, or distributed-lock services;
- self-managed PostgreSQL on the application host;
- public photo buckets;
- multiple regions or active-active databases;
- external search engines, Redis, queues, or CDN complexity;
- always-on staging at production size;
- automated production deployment without an approval gate;
- a custom Docker image unless the selected platform or reproducibility evidence requires it.

## Decisions Required Before Production

- hosting/database/object-storage provider and region;
- budget ceiling and support expectations;
- business-owned domain and access recovery;
- RPO, RTO, backup retention, and restore-test owner;
- whether staging can pause/scale down or must remain continuously available;
- production traffic/data estimates for initial sizing;
- photo size, format, retention, and deletion policy;
- whether generated PDFs are durably stored in addition to deterministic regeneration, and their retention policy;
- log retention and customer/financial data redaction rules;
- consistency-diagnostic schedule and responsible responder;
- FX-rate provider selection, endpoint, timeout, retry, caching, and historical-rate retrieval mechanics, which remain non-blocking implementation details for MVP v1 scope freeze;
- incident contacts and notification path;
- migration approval and emergency data-correction procedure.
