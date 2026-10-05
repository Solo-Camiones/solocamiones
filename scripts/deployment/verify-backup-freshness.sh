#!/usr/bin/env bash
# Confirm a recent encrypted backup object exists in R2 (M5.5 decision 7C).
#
# Checks:
#   1) object key is non-empty and present in the bucket
#   2) object LastModified age is <= MAX_AGE_MINUTES (default 90)
#
# Required env:
#   R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   BACKUP_OBJECT_KEY
#
# Optional:
#   BACKUP_MAX_AGE_MINUTES (default 90)
#   AWS_DEFAULT_REGION (default auto)
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "verify-backup-freshness: missing required env ${name}" >&2
    exit 1
  fi
}

require_env R2_ENDPOINT
require_env R2_BUCKET
require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env BACKUP_OBJECT_KEY

BACKUP_MAX_AGE_MINUTES="${BACKUP_MAX_AGE_MINUTES:-90}"
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
unset R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

if ! command -v aws >/dev/null 2>&1; then
  echo "verify-backup-freshness: aws CLI is required" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "verify-backup-freshness: python3 is required" >&2
  exit 1
fi

echo "verify-backup-freshness: checking s3://${R2_BUCKET}/${BACKUP_OBJECT_KEY}"

HEAD_JSON="$(
  aws s3api head-object \
    --endpoint-url "${R2_ENDPOINT}" \
    --bucket "${R2_BUCKET}" \
    --key "${BACKUP_OBJECT_KEY}" \
    --output json
)"

python3 - "${HEAD_JSON}" "${BACKUP_MAX_AGE_MINUTES}" <<'PY'
import datetime as dt
import json
import sys

payload = json.loads(sys.argv[1])
max_age_minutes = int(sys.argv[2])
last_modified_raw = payload.get("LastModified")
if not last_modified_raw:
    raise SystemExit("verify-backup-freshness: LastModified missing from head-object")

# aws CLI may return ISO8601 with Z or offset.
normalized = last_modified_raw.replace("Z", "+00:00")
last_modified = dt.datetime.fromisoformat(normalized)
if last_modified.tzinfo is None:
    last_modified = last_modified.replace(tzinfo=dt.timezone.utc)
now = dt.datetime.now(dt.timezone.utc)
age = now - last_modified.astimezone(dt.timezone.utc)
age_minutes = age.total_seconds() / 60.0
if age_minutes < 0:
    raise SystemExit("verify-backup-freshness: object LastModified is in the future")
if age_minutes > max_age_minutes:
    raise SystemExit(
        f"verify-backup-freshness: backup age {age_minutes:.1f}m exceeds limit {max_age_minutes}m"
    )
print(
    f"verify-backup-freshness: OK key present, age={age_minutes:.1f}m "
    f"(limit {max_age_minutes}m), last_modified={last_modified.isoformat()}"
)
PY
