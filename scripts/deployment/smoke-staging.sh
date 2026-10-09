#!/usr/bin/env bash
# Minimal staging smoke after digest deploy (M5.4).
#
# Scope is intentionally narrow: reachability + liveness/readiness.
# Commercial §16 coverage belongs to M7.3 once staging has synthetic data.
#
# Host runtime: curl + jq (installed by bootstrap-ubuntu.sh). No Node on the VPS.
#
# Usage:
#   bash scripts/deployment/smoke-staging.sh --base-url https://staging.solocamiones.com
#
# Optional:
#   --cf-access-client-id
#   --cf-access-client-secret
#   (or env CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET for Access service tokens)
#   SMOKE_BASE_URL
set -euo pipefail

if grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
  echo "smoke-staging: script has Windows CRLF line endings; run: sed -i 's/\\r\$//' ${BASH_SOURCE[0]}" >&2
  exit 1
fi

DEFAULT_TIMEOUT_SECONDS=15

BASE_URL="${SMOKE_BASE_URL:-}"
CF_ACCESS_CLIENT_ID="${CF_ACCESS_CLIENT_ID:-}"
CF_ACCESS_CLIENT_SECRET="${CF_ACCESS_CLIENT_SECRET:-}"

usage() {
  cat <<'EOF'
Usage: smoke-staging.sh --base-url <url> [--cf-access-client-id <id>] [--cf-access-client-secret <secret>]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --cf-access-client-id)
      CF_ACCESS_CLIENT_ID="${2:-}"
      shift 2
      ;;
    --cf-access-client-secret)
      CF_ACCESS_CLIENT_SECRET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "smoke-staging: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${BASE_URL}" ]]; then
  echo "smoke-staging: --base-url is required" >&2
  usage >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "smoke-staging: curl is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "smoke-staging: jq is required" >&2
  exit 1
fi

# Strip trailing slashes so path joins stay predictable.
BASE_URL="${BASE_URL%/}"

build_curl_headers() {
  CURL_HEADERS=(-H 'Accept: application/json')
  if [[ -n "${CF_ACCESS_CLIENT_ID}" && -n "${CF_ACCESS_CLIENT_SECRET}" ]]; then
    CURL_HEADERS+=(
      -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"
      -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
    )
  fi
}

# GET JSON endpoint; assert HTTP 200 and body.status == "ok".
# Matches former smoke-staging.mjs: no redirect following (Access challenges stay visible).
assert_health_ok() {
  local path="$1"
  local label="$2"
  local url="${BASE_URL}${path}"
  local body_file status body status_field

  body_file="$(mktemp)"
  status="$(
    curl -sS \
      --max-time "${DEFAULT_TIMEOUT_SECONDS}" \
      -o "${body_file}" \
      -w '%{http_code}' \
      "${CURL_HEADERS[@]}" \
      "${url}"
  )" || {
    rm -f "${body_file}"
    echo "smoke-staging: ${label} request failed for ${url}" >&2
    exit 1
  }

  body="$(cat "${body_file}")"
  rm -f "${body_file}"

  if [[ "${status}" != "200" ]]; then
    echo "smoke-staging: ${label} expected 200, got ${status}" >&2
    exit 1
  fi

  if ! status_field="$(printf '%s' "${body}" | jq -er '.status')"; then
    echo "smoke-staging: ${label} body.status must be ok (invalid JSON or missing status)" >&2
    exit 1
  fi

  if [[ "${status_field}" != "ok" ]]; then
    echo "smoke-staging: ${label} body.status must be ok" >&2
    exit 1
  fi

  echo "smoke-staging: ${label} OK"
}

build_curl_headers

echo "smoke-staging: checking ${BASE_URL}"
assert_health_ok '/api/health/live' 'liveness'
assert_health_ok '/api/health/ready' 'readiness'
echo 'smoke-staging: passed'
