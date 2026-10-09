# Snapshot verification checklist (M3.4 / M6)

Snapshots are a **secondary** recovery layer. Encrypted `pg_dump` to R2 remains the primary backup.

This checklist is versioned so operators know what to verify when a real host exists.

## Cadence

- Weekly snapshot on each environment host, per `docs/deployment_plan/deployment_plan.md` §12.1.
- After each snapshot window (or the next business day), complete the checks below.

## Checks (all providers)

1. Confirm the latest snapshot exists for the host in the provider panel (or API if later enabled).
2. Record: host name/id, snapshot id/name, created-at (UTC), apparent size.
3. Confirm the snapshot is marked available/complete (not failed or pending indefinitely).
4. Confirm age is within policy (warning if older than ~8 days; escalate if older than ~10 days).
5. Confirm snapshots are **not** treated as a substitute for the latest hourly R2 backup.
6. Store the verification note in the operator log / password-manager secure note — **never** commit snapshot IDs with credentials into git.

## Hostinger (canonical production path)

Long-term staging/production VPS per the deployment plan. Use the Hostinger panel (or API if later enabled) for weekly snapshots on each KVM.

## Azure trial (M6 first staging exercise)

Owner decision: the first staging exercise uses an existing Azure VM before Hostinger KVM 1.

1. Create a weekly Azure Disk Snapshot (or Recovery Services backup if that is how the VM is protected) of the OS/data disks that hold Docker volumes.
2. Record: resource group, VM name, snapshot resource id/name, region, created-at (UTC).
3. Confirm the snapshot/backup job succeeded.
4. Apply the same age policy as above.
5. When moving to Hostinger KVM 1, re-run this checklist against Hostinger; do not assume Azure evidence transfers.

## Out of scope for automation in-repo

- Hostinger / Azure API integration
- Automatic snapshot creation from this repository
- Restoring a VPS from snapshot (covered by incident runbooks in later milestones)

## Related

- Primary backup job: `scripts/deployment/backup-postgres.sh`
- Restore drill: `scripts/deployment/verify-restore.sh`
- systemd timers: `infra/vps/systemd/`
- Staging operator guide: `infra/vps/docs/STAGING_PROVISIONING.md`
