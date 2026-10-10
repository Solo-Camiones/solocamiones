#!/usr/bin/env bash
# Controlled VPS deploy by immutable image digests (M5.4 / M5.5).
#
# Pulls GHCR digests, runs one-shot migrate, recreates app services, waits for
# health, then runs the minimal staging smoke via smoke-staging.sh (or skips smoke in dry-run).
#
# Required:
#   --env staging|production
#   --api-digest sha256:...
#   --web-digest sha256:...
#   --backup-digest sha256:...
#
# Optional:
#   --compose-file PATH          (default: infra/vps/compose.yaml relative to repo)
#   --env-file PATH              (default: /etc/solocamiones/<env>.env)
#   --project-dir PATH           (default: directory of compose file)
#   --ghcr-owner OWNER           (default: derived from GITHUB_REPOSITORY_OWNER)
#   --skip-smoke
#   --dry-run                    validate args and print plan only
#
# Expected on the VPS when not dry-run:
#   docker + compose plugin, logged-in or login-capable GHCR read credential,
#   env file with Compose variables (never committed).
set -euo pipefail

# Windows CRLF breaks bash line continuations; fail early with a clear fix.
if grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
  echo "deploy.sh: script has Windows CRLF line endings." >&2
  echo "deploy.sh: fix with: sed -i 's/\\r\$//' ${BASH_SOURCE[0]}" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

APP_ENV=""
API_DIGEST=""
WEB_DIGEST=""
BACKUP_DIGEST=""
COMPOSE_FILE="${ROOT_DIR}/infra/vps/compose.yaml"
ENV_FILE=""
PROJECT_DIR=""
GHCR_OWNER="${GITHUB_REPOSITORY_OWNER:-}"
SKIP_SMOKE=0
DRY_RUN=0
EVIDENCE_DIR="${DEPLOY_EVIDENCE_DIR:-/tmp/solocamiones-deploy-evidence}"

usage() {
  cat <<'EOF'
Usage: deploy.sh --env staging|production \
  --api-digest sha256:... --web-digest sha256:... --backup-digest sha256:... \
  [--compose-file PATH] [--env-file PATH] [--ghcr-owner OWNER] \
  [--skip-smoke] [--dry-run]
EOF
}

require_digest() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "deploy.sh: invalid ${name} (expected sha256:<64 hex>): ${value}" >&2
    exit 1
  fi
}

# Read KEY=value from a Compose-style env file without sourcing it.
# Avoids loading secrets into the shell and breaking on password special chars.
env_file_get() {
  local file="$1"
  local key="$2"
  local line value

  [[ -f "${file}" ]] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "${file}" | tail -n1 || true)"
  [[ -n "${line}" ]] || return 0

  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "${value}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      APP_ENV="${2:-}"
      shift 2
      ;;
    --api-digest)
      API_DIGEST="${2:-}"
      shift 2
      ;;
    --web-digest)
      WEB_DIGEST="${2:-}"
      shift 2
      ;;
    --backup-digest)
      BACKUP_DIGEST="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --ghcr-owner)
      GHCR_OWNER="${2:-}"
      shift 2
      ;;
    --skip-smoke)
      SKIP_SMOKE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "deploy.sh: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${APP_ENV}" != "staging" && "${APP_ENV}" != "production" ]]; then
  echo "deploy.sh: --env must be staging or production" >&2
  exit 1
fi

require_digest "--api-digest" "${API_DIGEST}"
require_digest "--web-digest" "${WEB_DIGEST}"
require_digest "--backup-digest" "${BACKUP_DIGEST}"

if [[ -z "${ENV_FILE}" ]]; then
  ENV_FILE="/etc/solocamiones/${APP_ENV}.env"
fi

if [[ -z "${PROJECT_DIR}" ]]; then
  PROJECT_DIR="$(cd "$(dirname "${COMPOSE_FILE}")" && pwd)"
fi

if [[ -z "${GHCR_OWNER}" ]]; then
  echo "deploy.sh: --ghcr-owner or GITHUB_REPOSITORY_OWNER is required" >&2
  exit 1
fi

API_IMAGE="ghcr.io/${GHCR_OWNER}/solocamiones-api@${API_DIGEST}"
WEB_IMAGE="ghcr.io/${GHCR_OWNER}/solocamiones-web@${WEB_DIGEST}"
BACKUP_IMAGE="ghcr.io/${GHCR_OWNER}/solocamiones-backup@${BACKUP_DIGEST}"

RELEASE_SHA="${RELEASE_SHA:-unknown}"
STARTED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "deploy.sh: env=${APP_ENV} dry_run=${DRY_RUN}"
echo "deploy.sh: api=${API_IMAGE}"
echo "deploy.sh: web=${WEB_IMAGE}"
echo "deploy.sh: backup=${BACKUP_IMAGE}"
echo "deploy.sh: compose=${COMPOSE_FILE}"
echo "deploy.sh: env_file=${ENV_FILE}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "deploy.sh: dry-run OK — would pull digests, migrate, recreate services, wait health, smoke"
  exit 0
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "deploy.sh: compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "deploy.sh: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "deploy.sh: docker is required on the target host" >&2
  exit 1
fi

mkdir -p "${EVIDENCE_DIR}"
EVIDENCE_FILE="${EVIDENCE_DIR}/deploy-${APP_ENV}-$(date -u +%Y%m%dT%H%M%SZ).txt"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" --project-directory "${PROJECT_DIR}" "$@"
}

export API_IMAGE WEB_IMAGE BACKUP_IMAGE

echo "deploy.sh: pulling images by digest"
docker pull "${API_IMAGE}"
docker pull "${WEB_IMAGE}"
docker pull "${BACKUP_IMAGE}"

echo "deploy.sh: running one-shot migrate"
compose --profile operations run --rm migrate

echo "deploy.sh: recreating application services"
compose up -d --no-deps --force-recreate api web edge

service_health() {
  local service="$1"
  compose ps --status running --format '{{.Health}}' "${service}" 2>/dev/null | head -n1 | tr -d '\r'
}

echo "deploy.sh: waiting for api/web/edge healthy"
deadline=$((SECONDS + 180))
while true; do
  api_health="$(service_health api)"
  web_health="$(service_health web)"
  edge_health="$(service_health edge)"
  if [[ "${api_health}" == "healthy" && "${web_health}" == "healthy" && "${edge_health}" == "healthy" ]]; then
    break
  fi
  if (( SECONDS >= deadline )); then
    echo "deploy.sh: timed out waiting for healthy services (api=${api_health} web=${web_health} edge=${edge_health})" >&2
    compose ps >&2 || true
    exit 1
  fi
  sleep 5
done

SMOKE_STATUS="skipped"
if [[ "${SKIP_SMOKE}" -eq 0 && "${APP_ENV}" == "staging" ]]; then
  echo "deploy.sh: running minimal staging smoke"
  # Precedence: process env → Compose env file → canonical default.
  # Compose --env-file does not export into this shell; read keys explicitly.
  if [[ -z "${SMOKE_BASE_URL:-}" ]]; then
    SMOKE_BASE_URL="$(env_file_get "${ENV_FILE}" "SMOKE_BASE_URL")"
  fi
  SMOKE_BASE_URL="${SMOKE_BASE_URL:-https://staging.solocamiones.com}"
  echo "deploy.sh: smoke base url=${SMOKE_BASE_URL}"

  # Access service token for machine smoke (WARP is human-only). Never log values.
  if [[ -z "${CF_ACCESS_CLIENT_ID:-}" ]]; then
    CF_ACCESS_CLIENT_ID="$(env_file_get "${ENV_FILE}" "CF_ACCESS_CLIENT_ID")"
  fi
  if [[ -z "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
    CF_ACCESS_CLIENT_SECRET="$(env_file_get "${ENV_FILE}" "CF_ACCESS_CLIENT_SECRET")"
  fi

  smoke_args=(--base-url "${SMOKE_BASE_URL}")
  if [[ -n "${CF_ACCESS_CLIENT_ID}" && -n "${CF_ACCESS_CLIENT_SECRET}" ]]; then
    smoke_args+=(
      --cf-access-client-id "${CF_ACCESS_CLIENT_ID}"
      --cf-access-client-secret "${CF_ACCESS_CLIENT_SECRET}"
    )
    echo "deploy.sh: smoke Cloudflare Access service token enabled"
  else
    echo "deploy.sh: warning: CF_ACCESS_CLIENT_ID/SECRET unset; Access may return 403 on smoke" >&2
  fi

  # Host has curl/jq from bootstrap; Node is not installed on the VPS.
  bash "${ROOT_DIR}/scripts/deployment/smoke-staging.sh" "${smoke_args[@]}"
  SMOKE_STATUS="passed"
fi

FINISHED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "env=${APP_ENV}"
  echo "started_utc=${STARTED_UTC}"
  echo "finished_utc=${FINISHED_UTC}"
  echo "release_sha=${RELEASE_SHA}"
  echo "api_image=${API_IMAGE}"
  echo "web_image=${WEB_IMAGE}"
  echo "backup_image=${BACKUP_IMAGE}"
  echo "smoke=${SMOKE_STATUS}"
} >"${EVIDENCE_FILE}"

echo "deploy.sh: success — evidence ${EVIDENCE_FILE}"
