#!/usr/bin/env bash
# Negative permission checks for PostgreSQL roles (M3.1).
# Expects the same env as bootstrap-postgres.sh plus role passwords.
# Exit 0 only when every forbidden operation fails as expected.
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "test-postgres-roles: missing required env ${name}" >&2
    exit 1
  fi
}

require_env POSTGRES_HOST
require_env POSTGRES_DB
require_env ROLE_RUNTIME_PASSWORD
require_env ROLE_BACKUP_PASSWORD
require_env ROLE_MONITORING_PASSWORD

POSTGRES_PORT="${POSTGRES_PORT:-5432}"
ROLE_RUNTIME_NAME="${ROLE_RUNTIME_NAME:-runtime}"
ROLE_BACKUP_NAME="${ROLE_BACKUP_NAME:-backup}"
ROLE_MONITORING_NAME="${ROLE_MONITORING_NAME:-monitoring}"

failures=0

expect_fail() {
  local role="$1"
  local password="$2"
  local description="$3"
  local sql="$4"

  echo "→ expect FAIL (${role}): ${description}"
  if PGPASSWORD="${password}" psql -v ON_ERROR_STOP=1 \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${role}" \
    -d "${POSTGRES_DB}" \
    -c "${sql}" >/dev/null 2>&1; then
    echo "  FAILED: operation unexpectedly succeeded" >&2
    failures=$((failures + 1))
  else
    echo "  ok (rejected)"
  fi
}

expect_ok() {
  local role="$1"
  local password="$2"
  local description="$3"
  local sql="$4"

  echo "→ expect OK (${role}): ${description}"
  if PGPASSWORD="${password}" psql -v ON_ERROR_STOP=1 \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${role}" \
    -d "${POSTGRES_DB}" \
    -c "${sql}" >/dev/null 2>&1; then
    echo "  ok"
  else
    echo "  FAILED: operation unexpectedly rejected" >&2
    failures=$((failures + 1))
  fi
}

echo "test-postgres-roles: running negative permission checks"

expect_fail "${ROLE_RUNTIME_NAME}" "${ROLE_RUNTIME_PASSWORD}" \
  "CREATE TABLE" \
  "CREATE TABLE role_probe_runtime (id int);"

expect_fail "${ROLE_RUNTIME_NAME}" "${ROLE_RUNTIME_PASSWORD}" \
  "DROP SCHEMA" \
  "DROP SCHEMA public CASCADE;"

expect_fail "${ROLE_BACKUP_NAME}" "${ROLE_BACKUP_PASSWORD}" \
  "INSERT into business table" \
  "INSERT INTO \"User\" (id) VALUES ('role-probe-should-fail');"

expect_fail "${ROLE_BACKUP_NAME}" "${ROLE_BACKUP_PASSWORD}" \
  "CREATE TABLE in public" \
  "CREATE TABLE public.role_probe_backup (id int);"

expect_fail "${ROLE_BACKUP_NAME}" "${ROLE_BACKUP_PASSWORD}" \
  "UPDATE business table" \
  "UPDATE \"User\" SET id = id WHERE false;"

expect_fail "${ROLE_MONITORING_NAME}" "${ROLE_MONITORING_PASSWORD}" \
  "SELECT business table (User)" \
  "SELECT id FROM \"User\" LIMIT 1;"

expect_fail "${ROLE_MONITORING_NAME}" "${ROLE_MONITORING_PASSWORD}" \
  "CREATE TABLE" \
  "CREATE TABLE public.role_probe_monitoring (id int);"

# Sanity: monitoring can read a stats view; backup can read pg_catalog.
expect_ok "${ROLE_MONITORING_NAME}" "${ROLE_MONITORING_PASSWORD}" \
  "pg_stat_database" \
  "SELECT count(*) FROM pg_stat_database;"

expect_ok "${ROLE_BACKUP_NAME}" "${ROLE_BACKUP_PASSWORD}" \
  "SELECT from information_schema" \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"

if [[ "${failures}" -ne 0 ]]; then
  echo "test-postgres-roles: ${failures} check(s) failed" >&2
  exit 1
fi

echo "test-postgres-roles: all checks passed"
