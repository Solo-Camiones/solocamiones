#!/usr/bin/env bash
# Refresh UFW allow rules for Cloudflare published IPv4/IPv6 ranges (M6).
#
# Defense in depth: Hostinger/Azure NSG must also restrict 80/443 to Cloudflare.
# This script never opens SSH to the public Internet.
#
# Usage (as root):
#   ./scripts/deployment/sync-cloudflare-ufw.sh
#   ./scripts/deployment/sync-cloudflare-ufw.sh --dry-run
set -euo pipefail

# Windows CRLF breaks bash line continuations; fail early with a clear fix.
if grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
  echo "sync-cloudflare-ufw: script has Windows CRLF line endings." >&2
  echo "sync-cloudflare-ufw: fix with: sed -i 's/\\r\$//' ${BASH_SOURCE[0]}" >&2
  exit 1
fi

DRY_RUN=0
UFW_COMMENT_PREFIX='solocamiones-cloudflare'
IPV4_URL='https://www.cloudflare.com/ips-v4'
IPV6_URL='https://www.cloudflare.com/ips-v6'
TMP_DIR=''

usage() {
  cat <<'EOF'
Usage: sync-cloudflare-ufw.sh [--dry-run]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "sync-cloudflare-ufw: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "sync-cloudflare-ufw: must run as root" >&2
  exit 1
fi

if ! command -v ufw >/dev/null 2>&1; then
  echo "sync-cloudflare-ufw: ufw is required" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "sync-cloudflare-ufw: curl is required" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

TMP_DIR="$(mktemp -d)"
IPV4_FILE="${TMP_DIR}/ips-v4.txt"
IPV6_FILE="${TMP_DIR}/ips-v6.txt"

echo "sync-cloudflare-ufw: downloading Cloudflare IP lists"
curl -fsSL "${IPV4_URL}" -o "${IPV4_FILE}"
curl -fsSL "${IPV6_URL}" -o "${IPV6_FILE}"

if [[ ! -s "${IPV4_FILE}" ]]; then
  echo "sync-cloudflare-ufw: empty IPv4 list" >&2
  exit 1
fi

run_ufw() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "dry-run: ufw $*"
  else
    ufw "$@"
  fi
}

# Delete previous Solo Camiones Cloudflare rules (idempotent refresh).
# Match on comment substring; ufw status numbered is parsed carefully.
echo "sync-cloudflare-ufw: removing previous ${UFW_COMMENT_PREFIX} rules"
mapfile -t RULE_NUMBERS < <(
  ufw status numbered |
    sed -n "s/^\[\s*\([0-9]\+\)\].*${UFW_COMMENT_PREFIX}.*/\1/p" |
    sort -nr
)
for rule_number in "${RULE_NUMBERS[@]:-}"; do
  if [[ -n "${rule_number}" ]]; then
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      echo "dry-run: ufw --force delete ${rule_number}"
    else
      ufw --force delete "${rule_number}" >/dev/null
    fi
  fi
done

add_cidr() {
  local proto="$1"
  local cidr="$2"
  # Trim whitespace / CR from Cloudflare list lines.
  cidr="$(printf '%s' "${cidr}" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "${cidr}" || "${cidr}" =~ ^# ]]; then
    return 0
  fi
  run_ufw allow from "${cidr}" to any port 80 proto "${proto}" comment "${UFW_COMMENT_PREFIX}-80"
  run_ufw allow from "${cidr}" to any port 443 proto "${proto}" comment "${UFW_COMMENT_PREFIX}-443"
}

echo "sync-cloudflare-ufw: adding IPv4 allow rules for 80/443"
while IFS= read -r cidr; do
  add_cidr tcp "${cidr}"
done <"${IPV4_FILE}"

echo "sync-cloudflare-ufw: adding IPv6 allow rules for 80/443"
while IFS= read -r cidr; do
  add_cidr tcp "${cidr}"
done <"${IPV6_FILE}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "sync-cloudflare-ufw: dry-run complete (no rules applied)"
else
  ufw status verbose | sed -n '1,40p' || true
  echo "sync-cloudflare-ufw: success"
fi
