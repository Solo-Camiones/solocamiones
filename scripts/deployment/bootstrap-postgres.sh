#!/usr/bin/env bash
# Idempotent PostgreSQL role bootstrap for Solo Camiones VPS (M3.1).
# Creates least-privilege roles: migration, runtime, backup, monitoring.
# Safe to re-run after migrate to refresh grants on new tables.
#
# Required env:
#   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB
#   POSTGRES_SUPERUSER, POSTGRES_SUPERUSER_PASSWORD
#   ROLE_MIGRATION_PASSWORD, ROLE_RUNTIME_PASSWORD,
#   ROLE_BACKUP_PASSWORD, ROLE_MONITORING_PASSWORD
#
# Optional env (defaults match deployment plan names):
#   ROLE_MIGRATION_NAME, ROLE_RUNTIME_NAME, ROLE_BACKUP_NAME, ROLE_MONITORING_NAME
set -euo pipefail

if grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
  echo "bootstrap-postgres: script has Windows CRLF line endings; run: sed -i 's/\\r\$//' ${BASH_SOURCE[0]}" >&2
  exit 1
fi

sql_quote() {
  # Double single-quotes for safe inclusion inside SQL string literals.
  printf "%s" "${1}" | sed "s/'/''/g"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "bootstrap-postgres: missing required env ${name}" >&2
    exit 1
  fi
}

require_env POSTGRES_HOST
require_env POSTGRES_DB
require_env POSTGRES_SUPERUSER
require_env POSTGRES_SUPERUSER_PASSWORD
require_env ROLE_MIGRATION_PASSWORD
require_env ROLE_RUNTIME_PASSWORD
require_env ROLE_BACKUP_PASSWORD
require_env ROLE_MONITORING_PASSWORD

POSTGRES_PORT="${POSTGRES_PORT:-5432}"
ROLE_MIGRATION_NAME="${ROLE_MIGRATION_NAME:-migration}"
ROLE_RUNTIME_NAME="${ROLE_RUNTIME_NAME:-runtime}"
ROLE_BACKUP_NAME="${ROLE_BACKUP_NAME:-backup}"
ROLE_MONITORING_NAME="${ROLE_MONITORING_NAME:-monitoring}"

for role_name in \
  "${ROLE_MIGRATION_NAME}" \
  "${ROLE_RUNTIME_NAME}" \
  "${ROLE_BACKUP_NAME}" \
  "${ROLE_MONITORING_NAME}"; do
  if [[ ! "${role_name}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "bootstrap-postgres: invalid role name '${role_name}'" >&2
    exit 1
  fi
done

MIGRATION_PASSWORD_SQL="$(sql_quote "${ROLE_MIGRATION_PASSWORD}")"
RUNTIME_PASSWORD_SQL="$(sql_quote "${ROLE_RUNTIME_PASSWORD}")"
BACKUP_PASSWORD_SQL="$(sql_quote "${ROLE_BACKUP_PASSWORD}")"
MONITORING_PASSWORD_SQL="$(sql_quote "${ROLE_MONITORING_PASSWORD}")"

export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}"

psql_admin() {
  psql -v ON_ERROR_STOP=1 \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_SUPERUSER}" \
    -d "${POSTGRES_DB}" \
    "$@"
}

echo "bootstrap-postgres: ensuring roles exist"

psql_admin <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE_MIGRATION_NAME}') THEN
    CREATE ROLE ${ROLE_MIGRATION_NAME} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE_RUNTIME_NAME}') THEN
    CREATE ROLE ${ROLE_RUNTIME_NAME} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE_BACKUP_NAME}') THEN
    CREATE ROLE ${ROLE_BACKUP_NAME} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE_MONITORING_NAME}') THEN
    CREATE ROLE ${ROLE_MONITORING_NAME} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
\$\$;

ALTER ROLE ${ROLE_MIGRATION_NAME} WITH LOGIN PASSWORD '${MIGRATION_PASSWORD_SQL}';
ALTER ROLE ${ROLE_RUNTIME_NAME} WITH LOGIN PASSWORD '${RUNTIME_PASSWORD_SQL}';
ALTER ROLE ${ROLE_BACKUP_NAME} WITH LOGIN PASSWORD '${BACKUP_PASSWORD_SQL}';
ALTER ROLE ${ROLE_MONITORING_NAME} WITH LOGIN PASSWORD '${MONITORING_PASSWORD_SQL}';

GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${ROLE_MIGRATION_NAME};
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${ROLE_RUNTIME_NAME};
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${ROLE_BACKUP_NAME};
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${ROLE_MONITORING_NAME};

-- Migration owns DDL. Runtime/backup/monitoring must not create objects.
GRANT USAGE, CREATE ON SCHEMA public TO ${ROLE_MIGRATION_NAME};
GRANT USAGE ON SCHEMA public TO ${ROLE_RUNTIME_NAME};
GRANT USAGE ON SCHEMA public TO ${ROLE_BACKUP_NAME};
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM ${ROLE_RUNTIME_NAME};
REVOKE CREATE ON SCHEMA public FROM ${ROLE_BACKUP_NAME};
REVOKE CREATE ON SCHEMA public FROM ${ROLE_MONITORING_NAME};

-- Backup: read-only dump via predefined role (PostgreSQL 14+).
GRANT pg_read_all_data TO ${ROLE_BACKUP_NAME};

-- Monitoring: stats/metrics only; not business-table DML/DQL grants.
GRANT pg_monitor TO ${ROLE_MONITORING_NAME};

-- Existing objects (idempotent re-grant after migrate).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE_RUNTIME_NAME};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE_RUNTIME_NAME};
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE_BACKUP_NAME};

-- Prisma readiness may inspect migration history.
DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  ) THEN
    EXECUTE 'GRANT SELECT ON TABLE public._prisma_migrations TO ${ROLE_RUNTIME_NAME}';
  END IF;
END
\$\$;

-- Future tables created by migration role inherit least-privilege grants.
ALTER DEFAULT PRIVILEGES FOR ROLE ${ROLE_MIGRATION_NAME} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLE_RUNTIME_NAME};
ALTER DEFAULT PRIVILEGES FOR ROLE ${ROLE_MIGRATION_NAME} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${ROLE_RUNTIME_NAME};
ALTER DEFAULT PRIVILEGES FOR ROLE ${ROLE_MIGRATION_NAME} IN SCHEMA public
  GRANT SELECT ON TABLES TO ${ROLE_BACKUP_NAME};
SQL

if [[ -n "${BOOTSTRAP_REASSIGN_FROM:-}" ]]; then
  if [[ ! "${BOOTSTRAP_REASSIGN_FROM}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "bootstrap-postgres: invalid BOOTSTRAP_REASSIGN_FROM '${BOOTSTRAP_REASSIGN_FROM}'" >&2
    exit 1
  fi
  if [[ "${BOOTSTRAP_REASSIGN_FROM}" == "${ROLE_MIGRATION_NAME}" ]]; then
    echo "bootstrap-postgres: BOOTSTRAP_REASSIGN_FROM must differ from migration role" >&2
    exit 1
  fi
  # Do not use REASSIGN OWNED: the bootstrap/superuser often owns database-system
  # objects that cannot be reassigned. Only move public schema app objects.
  echo "bootstrap-postgres: reassigning public schema objects from ${BOOTSTRAP_REASSIGN_FROM} to ${ROLE_MIGRATION_NAME}"
  psql_admin <<SQL
DO \$\$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT c.relkind, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE n.nspname = 'public'
      AND r.rolname = '${BOOTSTRAP_REASSIGN_FROM}'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  LOOP
    IF obj.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ${ROLE_MIGRATION_NAME}', obj.relname);
    ELSIF obj.relkind IN ('v', 'm') THEN
      EXECUTE format('ALTER VIEW public.%I OWNER TO ${ROLE_MIGRATION_NAME}', obj.relname);
    ELSE
      EXECUTE format('ALTER TABLE public.%I OWNER TO ${ROLE_MIGRATION_NAME}', obj.relname);
    END IF;
  END LOOP;
END
\$\$;
SQL
fi

echo "bootstrap-postgres: roles and grants applied"
