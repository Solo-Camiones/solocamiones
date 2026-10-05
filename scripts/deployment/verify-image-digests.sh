#!/usr/bin/env bash
# Verify GHCR package digests match the expected git SHA tags (M5.5).
#
# Requires docker (or crane) with read access to the packages.
set -euo pipefail

GHCR_OWNER=""
GIT_SHA=""
API_DIGEST=""
WEB_DIGEST=""
BACKUP_DIGEST=""

usage() {
  cat <<'EOF'
Usage: verify-image-digests.sh \
  --owner <ghcr-owner> --sha <40-char-sha> \
  --api-digest sha256:... --web-digest sha256:... --backup-digest sha256:...
EOF
}

require_digest() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "verify-image-digests: invalid ${name}: ${value}" >&2
    exit 1
  fi
}

resolve_digest() {
  local reference="$1"
  docker buildx imagetools inspect "${reference}" --format '{{.Manifest.Digest}}'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)
      GHCR_OWNER="${2:-}"
      shift 2
      ;;
    --sha)
      GIT_SHA="${2:-}"
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "verify-image-digests: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${GHCR_OWNER}" || -z "${GIT_SHA}" ]]; then
  echo "verify-image-digests: --owner and --sha are required" >&2
  exit 1
fi

if [[ ! "${GIT_SHA}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "verify-image-digests: --sha must be a full 40-character commit SHA" >&2
  exit 1
fi

require_digest "--api-digest" "${API_DIGEST}"
require_digest "--web-digest" "${WEB_DIGEST}"
require_digest "--backup-digest" "${BACKUP_DIGEST}"

if ! command -v docker >/dev/null 2>&1; then
  echo "verify-image-digests: docker is required" >&2
  exit 1
fi

check_one() {
  local name="$1"
  local expected="$2"
  local tag_ref="ghcr.io/${GHCR_OWNER}/solocamiones-${name}:sha-${GIT_SHA}"
  echo "verify-image-digests: resolving ${tag_ref}"
  local resolved
  resolved="$(resolve_digest "${tag_ref}")"
  if [[ "${resolved}" != "${expected}" ]]; then
    echo "verify-image-digests: ${name} digest mismatch" >&2
    echo "  tag:      ${tag_ref}" >&2
    echo "  expected: ${expected}" >&2
    echo "  resolved: ${resolved}" >&2
    exit 1
  fi
  echo "verify-image-digests: ${name} OK (${expected})"
}

check_one "api" "${API_DIGEST}"
check_one "web" "${WEB_DIGEST}"
check_one "backup" "${BACKUP_DIGEST}"

echo "verify-image-digests: all digests match sha-${GIT_SHA}"
