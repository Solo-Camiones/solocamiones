#!/usr/bin/env bash
# Encrypted PostgreSQL backup → Cloudflare R2 (M3.2 / M3.4).
#
# Pipeline (deployment_plan §12.2):
#   pg_dump custom → size check → age encrypt → SHA-256 → manifest → R2 upload
#   → remote verify → retention (hourly/daily/monthly) → trap cleanup
#
# Required env:
#   BACKUP_DATABASE_URL
#   R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   BACKUP_AGE_RECIPIENT
#   APP_ENV
#
# Optional:
#   APP_RELEASE, RELEASE_SHA
#   BACKUP_WORK_DIR (default /tmp/solocamiones-backup)
#   BACKUP_RETENTION_HOURLY_HOURS (48)
#   BACKUP_RETENTION_DAILY_DAYS (30)
#   BACKUP_RETENTION_MONTHLY_MONTHS (12)
#   BACKUP_TZ (America/Santo_Domingo)
#   BACKUP_METRICS_DIR (default /var/lib/node_exporter/textfile) — Prometheus textfile for node_exporter
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "backup-postgres: missing required env ${name}" >&2
    exit 1
  fi
}

require_env BACKUP_DATABASE_URL
require_env R2_ENDPOINT
require_env R2_BUCKET
require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env BACKUP_AGE_RECIPIENT
require_env APP_ENV

APP_RELEASE="${APP_RELEASE:-unknown}"
RELEASE_SHA="${RELEASE_SHA:-unknown}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/tmp/solocamiones-backup}"
BACKUP_RETENTION_HOURLY_HOURS="${BACKUP_RETENTION_HOURLY_HOURS:-48}"
BACKUP_RETENTION_DAILY_DAYS="${BACKUP_RETENTION_DAILY_DAYS:-30}"
BACKUP_RETENTION_MONTHLY_MONTHS="${BACKUP_RETENTION_MONTHLY_MONTHS:-12}"
BACKUP_TZ="${BACKUP_TZ:-America/Santo_Domingo}"
BACKUP_METRICS_DIR="${BACKUP_METRICS_DIR:-/var/lib/node_exporter/textfile}"
BACKUP_STARTED_EPOCH="$(date -u +%s)"
BACKUP_METRICS_WRITTEN=0

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# Avoid accidental leakage via child env dumps; aws CLI still has AWS_*.
unset R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

mkdir -p "${BACKUP_WORK_DIR}"
WORKDIR="$(mktemp -d "${BACKUP_WORK_DIR%/}/run.XXXXXX")"
DUMP_FILE="${WORKDIR}/backup.dump"
AGE_FILE="${WORKDIR}/backup.dump.age"
CHECKSUM_FILE="${WORKDIR}/backup.dump.age.sha256"
MANIFEST_FILE="${WORKDIR}/backup.dump.age.manifest.json"

# Atomic Prometheus textfile for node_exporter (M4.4). No secrets in labels/values.
write_backup_textfile() {
  local status="$1"
  local cipher_bytes="${2:-0}"
  local now_epoch duration metrics_tmp metrics_file success_ts=0
  now_epoch="$(date -u +%s)"
  duration=$((now_epoch - BACKUP_STARTED_EPOCH))
  if [[ "${duration}" -lt 0 ]]; then
    duration=0
  fi
  if [[ "${status}" == "1" ]]; then
    success_ts="${now_epoch}"
  fi

  mkdir -p "${BACKUP_METRICS_DIR}"
  metrics_file="${BACKUP_METRICS_DIR}/solocamiones_backup.prom"
  metrics_tmp="${metrics_file}.$$.$RANDOM.tmp"

  cat >"${metrics_tmp}" <<EOF
# HELP solocamiones_backup_last_status 1 if the last backup finished successfully, else 0
# TYPE solocamiones_backup_last_status gauge
solocamiones_backup_last_status{app_env="${APP_ENV}"} ${status}
# HELP solocamiones_backup_last_success_timestamp_seconds Unix time of the last successful backup
# TYPE solocamiones_backup_last_success_timestamp_seconds gauge
solocamiones_backup_last_success_timestamp_seconds{app_env="${APP_ENV}"} ${success_ts}
# HELP solocamiones_backup_last_duration_seconds Wall time of the last backup attempt
# TYPE solocamiones_backup_last_duration_seconds gauge
solocamiones_backup_last_duration_seconds{app_env="${APP_ENV}"} ${duration}
# HELP solocamiones_backup_last_cipher_bytes Size of the last encrypted backup object in bytes
# TYPE solocamiones_backup_last_cipher_bytes gauge
solocamiones_backup_last_cipher_bytes{app_env="${APP_ENV}"} ${cipher_bytes}
# HELP solocamiones_backup_last_finish_timestamp_seconds Unix time when the last backup attempt finished
# TYPE solocamiones_backup_last_finish_timestamp_seconds gauge
solocamiones_backup_last_finish_timestamp_seconds{app_env="${APP_ENV}"} ${now_epoch}
EOF

  mv -f "${metrics_tmp}" "${metrics_file}"
  BACKUP_METRICS_WRITTEN=1
}

cleanup() {
  local exit_code=$?
  if [[ "${exit_code}" -ne 0 ]] && [[ "${BACKUP_METRICS_WRITTEN}" != "1" ]]; then
    write_backup_textfile 0 0 || true
  fi
  rm -rf "${WORKDIR}"
  exit "${exit_code}"
}
trap cleanup EXIT

aws_s3() {
  aws --endpoint-url "${R2_ENDPOINT}" s3 "$@"
}

aws_s3api() {
  aws --endpoint-url "${R2_ENDPOINT}" s3api "$@"
}

stamp="$(TZ="${BACKUP_TZ}" date +%Y%m%dT%H%M%S)"
day_key="$(TZ="${BACKUP_TZ}" date +%Y-%m-%d)"
month_key="$(TZ="${BACKUP_TZ}" date +%Y-%m)"
utc_now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

hourly_prefix="hourly/${APP_ENV}/${day_key}"
object_base="${stamp}"
hourly_age_key="${hourly_prefix}/${object_base}.dump.age"
hourly_sum_key="${hourly_prefix}/${object_base}.dump.age.sha256"
hourly_manifest_key="${hourly_prefix}/${object_base}.dump.age.manifest.json"

echo "backup-postgres: dumping database (custom format)"
pg_dump --format=custom --file="${DUMP_FILE}" "${BACKUP_DATABASE_URL}"

if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "backup-postgres: dump missing or empty" >&2
  exit 1
fi

dump_bytes="$(wc -c <"${DUMP_FILE}" | tr -d ' ')"
echo "backup-postgres: dump size=${dump_bytes} bytes"

echo "backup-postgres: encrypting with age"
age -r "${BACKUP_AGE_RECIPIENT}" -o "${AGE_FILE}" "${DUMP_FILE}"
# Remove plaintext as soon as ciphertext exists.
rm -f "${DUMP_FILE}"

if [[ ! -s "${AGE_FILE}" ]]; then
  echo "backup-postgres: encrypted file missing or empty" >&2
  exit 1
fi

age_bytes="$(wc -c <"${AGE_FILE}" | tr -d ' ')"
checksum="$(sha256sum "${AGE_FILE}" | awk '{print $1}')"
printf '%s  %s\n' "${checksum}" "$(basename "${AGE_FILE}")" >"${CHECKSUM_FILE}"

pg_version="$(psql "${BACKUP_DATABASE_URL}" -Atqc 'SHOW server_version;' || echo unknown)"

cat >"${MANIFEST_FILE}" <<EOF
{
  "appEnv": "${APP_ENV}",
  "createdAtUtc": "${utc_now}",
  "businessTimezone": "${BACKUP_TZ}",
  "businessStamp": "${stamp}",
  "appRelease": "${APP_RELEASE}",
  "releaseSha": "${RELEASE_SHA}",
  "postgresVersion": "${pg_version}",
  "dumpFormat": "custom",
  "encryption": "age",
  "ageRecipientFingerprintHint": "configured-via-BACKUP_AGE_RECIPIENT",
  "cipherBytes": ${age_bytes},
  "sha256": "${checksum}",
  "objectKeys": {
    "hourlyAge": "${hourly_age_key}",
    "hourlyChecksum": "${hourly_sum_key}",
    "hourlyManifest": "${hourly_manifest_key}"
  }
}
EOF

echo "backup-postgres: uploading hourly objects to s3://${R2_BUCKET}/"
aws_s3 cp "${AGE_FILE}" "s3://${R2_BUCKET}/${hourly_age_key}"
aws_s3 cp "${CHECKSUM_FILE}" "s3://${R2_BUCKET}/${hourly_sum_key}"
aws_s3 cp "${MANIFEST_FILE}" "s3://${R2_BUCKET}/${hourly_manifest_key}"

echo "backup-postgres: verifying remote object"
remote_bytes="$(aws_s3api head-object --bucket "${R2_BUCKET}" --key "${hourly_age_key}" --query ContentLength --output text)"
if [[ "${remote_bytes}" != "${age_bytes}" ]]; then
  echo "backup-postgres: remote size mismatch (local=${age_bytes} remote=${remote_bytes})" >&2
  exit 1
fi

promote_if_absent() {
  local dest_age_key="$1"
  local dest_sum_key="$2"
  local dest_manifest_key="$3"
  local label="$4"

  if aws_s3api head-object --bucket "${R2_BUCKET}" --key "${dest_age_key}" >/dev/null 2>&1; then
    echo "backup-postgres: ${label} already present, skipping promotion"
    return 0
  fi

  echo "backup-postgres: promoting to ${label}"
  aws_s3 cp "s3://${R2_BUCKET}/${hourly_age_key}" "s3://${R2_BUCKET}/${dest_age_key}"
  aws_s3 cp "s3://${R2_BUCKET}/${hourly_sum_key}" "s3://${R2_BUCKET}/${dest_sum_key}"
  aws_s3 cp "s3://${R2_BUCKET}/${hourly_manifest_key}" "s3://${R2_BUCKET}/${dest_manifest_key}"
}

daily_age_key="daily/${APP_ENV}/${day_key}/${object_base}.dump.age"
daily_sum_key="daily/${APP_ENV}/${day_key}/${object_base}.dump.age.sha256"
daily_manifest_key="daily/${APP_ENV}/${day_key}/${object_base}.dump.age.manifest.json"
promote_if_absent "${daily_age_key}" "${daily_sum_key}" "${daily_manifest_key}" "daily/${day_key}"

monthly_age_key="monthly/${APP_ENV}/${month_key}/${object_base}.dump.age"
monthly_sum_key="monthly/${APP_ENV}/${month_key}/${object_base}.dump.age.sha256"
monthly_manifest_key="monthly/${APP_ENV}/${month_key}/${object_base}.dump.age.manifest.json"
promote_if_absent "${monthly_age_key}" "${monthly_sum_key}" "${monthly_manifest_key}" "monthly/${month_key}"

# Retention cleanup: delete aged objects under each prefix class.
delete_older_than() {
  local prefix="$1"
  local max_age_seconds="$2"
  local label="$3"
  local now_epoch
  now_epoch="$(date -u +%s)"
  local deleted=0

  # shellcheck disable=SC2016
  while IFS=$'\t' read -r key last_modified; do
    [[ -z "${key}" ]] && continue
    local object_epoch
    object_epoch="$(date -u -d "${last_modified}" +%s 2>/dev/null || date -u -D '%Y-%m-%dT%H:%M:%S' -d "${last_modified%.*}" +%s)"
    local age=$((now_epoch - object_epoch))
    if [[ "${age}" -gt "${max_age_seconds}" ]]; then
      aws_s3 rm "s3://${R2_BUCKET}/${key}"
      deleted=$((deleted + 1))
    fi
  done < <(
    aws_s3api list-objects-v2 \
      --bucket "${R2_BUCKET}" \
      --prefix "${prefix}" \
      --query "Contents[].[Key,LastModified]" \
      --output text 2>/dev/null || true
  )

  echo "backup-postgres: retention ${label}: deleted ${deleted} object(s)"
}

hourly_seconds=$((BACKUP_RETENTION_HOURLY_HOURS * 3600))
daily_seconds=$((BACKUP_RETENTION_DAILY_DAYS * 86400))
monthly_seconds=$((BACKUP_RETENTION_MONTHLY_MONTHS * 30 * 86400))

delete_older_than "hourly/${APP_ENV}/" "${hourly_seconds}" "hourly"
delete_older_than "daily/${APP_ENV}/" "${daily_seconds}" "daily"
delete_older_than "monthly/${APP_ENV}/" "${monthly_seconds}" "monthly"

write_backup_textfile 1 "${age_bytes}"
echo "backup-postgres: success key=${hourly_age_key} sha256=${checksum}"
