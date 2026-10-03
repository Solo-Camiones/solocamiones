#!/bin/sh
# Render prometheus.yml from template and materialize bearer token files (M4.2).
# Uses sed (available in prom/prometheus) — no envsubst dependency.
set -eu

TEMPLATE="${PROMETHEUS_TEMPLATE:-/etc/prometheus/prometheus.yml.template}"
# Writable paths under the TSDB volume (image FS is often read-only).
OUTPUT="${PROMETHEUS_CONFIG:-/prometheus/prometheus.yml}"
SECRETS_DIR="${PROMETHEUS_SECRETS_DIR:-/prometheus/secrets}"

mkdir -p "${SECRETS_DIR}"

if [ -z "${METRICS_BEARER_TOKEN:-}" ]; then
  echo "prometheus-entrypoint: METRICS_BEARER_TOKEN is required" >&2
  exit 1
fi

printf '%s' "${METRICS_BEARER_TOKEN}" >"${SECRETS_DIR}/metrics_bearer_token"
printf '%s' "${PRODUCTION_METRICS_BEARER_TOKEN:-${METRICS_BEARER_TOKEN}}" >"${SECRETS_DIR}/production_metrics_bearer_token"
chmod 600 "${SECRETS_DIR}/metrics_bearer_token" "${SECRETS_DIR}/production_metrics_bearer_token"

APP_ENV_VALUE="${APP_ENV:-staging}"
PRODUCTION_HOST_VALUE="${PRODUCTION_TAILSCALE_HOST:-}"

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\&]/\\&/g'
}

APP_ENV_ESCAPED="$(escape_sed "${APP_ENV_VALUE}")"
PRODUCTION_HOST_ESCAPED="$(escape_sed "${PRODUCTION_HOST_VALUE}")"

# Point credentials_file paths at the writable secrets dir.
sed \
  -e "s|\${APP_ENV}|${APP_ENV_ESCAPED}|g" \
  -e "s|\${PRODUCTION_TAILSCALE_HOST}|${PRODUCTION_HOST_ESCAPED}|g" \
  -e "s|/etc/prometheus/secrets/|${SECRETS_DIR}/|g" \
  "${TEMPLATE}" >"${OUTPUT}"

exec /bin/prometheus \
  --config.file="${OUTPUT}" \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=30d \
  --web.enable-lifecycle \
  --web.listen-address=0.0.0.0:9090
