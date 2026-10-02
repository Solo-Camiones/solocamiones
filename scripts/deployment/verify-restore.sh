#!/usr/bin/env bash
# Download, verify, decrypt and restore a backup into an isolated database (M3.3).
# Never restores onto the live application database URLs.
#
# Required env:
#   RESTORE_DATABASE_URL   — target DB (must be a dedicated restore database)
#   R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   BACKUP_AGE_SECRET_KEY  — age identity (private key); never used by hourly backup jobs
#   BACKUP_OBJECT_KEY      — R2 key of the .dump.age object
#   CONFIRM_RESTORE=yes
#
# Optional:
#   BACKUP_CHECKSUM_OBJECT_KEY  — defaults to BACKUP_OBJECT_KEY with .sha256 suffix pattern
#   DATABASE_URL / DATABASE_MIGRATION_URL / BACKUP_DATABASE_URL — denied if equal to restore target
#   RESTORE_DENIED_DATABASE_URLS — extra comma-separated URLs that must never be targets
#   RESTORE_WORK_DIR
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "verify-restore: missing required env ${name}" >&2
    exit 1
  fi
}

require_env RESTORE_DATABASE_URL
require_env R2_ENDPOINT
require_env R2_BUCKET
require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env BACKUP_AGE_SECRET_KEY
require_env BACKUP_OBJECT_KEY

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "verify-restore: set CONFIRM_RESTORE=yes to proceed" >&2
  exit 1
fi

normalize_url() {
  # Strip trailing slashes for comparison; keep credentials (comparison only, not logged).
  local url="$1"
  url="${url%/}"
  printf '%s' "${url}"
}

is_denied_target() {
  local candidate
  candidate="$(normalize_url "$1")"
  local denied
  local -a denied_list=()

  [[ -n "${DATABASE_URL:-}" ]] && denied_list+=("${DATABASE_URL}")
  [[ -n "${DATABASE_MIGRATION_URL:-}" ]] && denied_list+=("${DATABASE_MIGRATION_URL}")
  [[ -n "${BACKUP_DATABASE_URL:-}" ]] && denied_list+=("${BACKUP_DATABASE_URL}")

  if [[ -n "${RESTORE_DENIED_DATABASE_URLS:-}" ]]; then
    local IFS=','
    # shellcheck disable=SC2206
    local -a extra=(${RESTORE_DENIED_DATABASE_URLS})
    denied_list+=("${extra[@]}")
  fi

  for denied in "${denied_list[@]}"; do
    denied="${denied#"${denied%%[![:space:]]*}"}"
    denied="${denied%"${denied##*[![:space:]]}"}"
    [[ -z "${denied}" ]] && continue
    if [[ "${candidate}" == "$(normalize_url "${denied}")" ]]; then
      return 0
    fi
  done
  return 1
}

if is_denied_target "${RESTORE_DATABASE_URL}"; then
  echo "verify-restore: refusing restore onto a live/denied database URL" >&2
  exit 1
fi

# Heuristic: production app database names must not be restore targets unless explicitly
# named as a restore database (suffix _restore).
restore_db_name="$(printf '%s' "${RESTORE_DATABASE_URL}" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
if [[ "${APP_ENV:-}" == "production" && "${restore_db_name}" != *_restore ]]; then
  echo "verify-restore: production restores require a database name ending in _restore (got: ${restore_db_name})" >&2
  exit 1
fi

BACKUP_CHECKSUM_OBJECT_KEY="${BACKUP_CHECKSUM_OBJECT_KEY:-${BACKUP_OBJECT_KEY%.dump.age}.dump.age.sha256}"
if [[ "${BACKUP_CHECKSUM_OBJECT_KEY}" == "${BACKUP_OBJECT_KEY}" ]]; then
  BACKUP_CHECKSUM_OBJECT_KEY="${BACKUP_OBJECT_KEY}.sha256"
fi

RESTORE_WORK_DIR="${RESTORE_WORK_DIR:-/tmp/solocamiones-restore}"
mkdir -p "${RESTORE_WORK_DIR}"
WORKDIR="$(mktemp -d "${RESTORE_WORK_DIR%/}/run.XXXXXX")"
AGE_FILE="${WORKDIR}/backup.dump.age"
CHECKSUM_FILE="${WORKDIR}/backup.dump.age.sha256"
DUMP_FILE="${WORKDIR}/backup.dump"
IDENTITY_FILE="${WORKDIR}/age-identity.txt"

cleanup() {
  local exit_code=$?
  rm -rf "${WORKDIR}"
  exit "${exit_code}"
}
trap cleanup EXIT

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
unset R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

aws_s3() {
  aws --endpoint-url "${R2_ENDPOINT}" s3 "$@"
}

echo "verify-restore: downloading ciphertext"
aws_s3 cp "s3://${R2_BUCKET}/${BACKUP_OBJECT_KEY}" "${AGE_FILE}"
aws_s3 cp "s3://${R2_BUCKET}/${BACKUP_CHECKSUM_OBJECT_KEY}" "${CHECKSUM_FILE}"

expected_checksum="$(awk '{print $1}' "${CHECKSUM_FILE}")"
actual_checksum="$(sha256sum "${AGE_FILE}" | awk '{print $1}')"
if [[ "${expected_checksum}" != "${actual_checksum}" ]]; then
  echo "verify-restore: checksum mismatch" >&2
  exit 1
fi
echo "verify-restore: checksum ok"

umask 077
printf '%s\n' "${BACKUP_AGE_SECRET_KEY}" >"${IDENTITY_FILE}"
echo "verify-restore: decrypting"
age -d -i "${IDENTITY_FILE}" -o "${DUMP_FILE}" "${AGE_FILE}"
rm -f "${IDENTITY_FILE}" "${AGE_FILE}"

if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "verify-restore: decrypted dump missing or empty" >&2
  exit 1
fi

echo "verify-restore: restoring into isolated target (never the live DB)"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="${RESTORE_DATABASE_URL}" "${DUMP_FILE}"

echo "verify-restore: basic integrity probes"
psql "${RESTORE_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 1 AS alive;
SELECT count(*) AS user_count FROM "User";
SELECT count(*) AS customer_count FROM "Customer";
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_migrations;
SQL

echo "verify-restore: success"
