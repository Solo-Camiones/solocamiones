# Hostinger snapshot verification checklist (M3.4)

Snapshots are a **secondary** recovery layer. Encrypted `pg_dump` to R2 remains the primary backup.

This checklist is versioned in M3 so operators know what to verify. **Execution against a real Hostinger VPS starts in M6+** when the host exists.

## Cadence

- Weekly snapshot on each VPS (staging and production), per `docs/deployment_plan/deployment_plan.md` §12.1.
- After each snapshot window (or the next business day), complete the checks below.

## Checks

1. Confirm the latest snapshot exists for the VPS in the Hostinger panel (or API if later enabled).
2. Record: VPS name/id, snapshot id/name, created-at (UTC), apparent size.
3. Confirm the snapshot is marked available/complete (not failed or pending indefinitely).
4. Confirm age is within policy (warning if older than ~8 days; escalate if older than ~10 days).
5. Confirm snapshots are **not** treated as a substitute for the latest hourly R2 backup.
6. Store the verification note in the operator log / password-manager secure note — **never** commit snapshot IDs with credentials into git.

## Out of scope for M3 automation

- Hostinger API integration
- Automatic snapshot creation from this repository
- Restoring a VPS from snapshot (covered by incident runbooks in later milestones)

## Related

- Primary backup job: `scripts/deployment/backup-postgres.sh`
- Restore drill: `scripts/deployment/verify-restore.sh`
- systemd timers: `infra/vps/systemd/`
