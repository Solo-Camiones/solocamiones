#!/usr/bin/env bash
# Compatibility wrapper — prefer the Node implementation for Windows/CI parity.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "${ROOT_DIR}/scripts/deployment/generate-trivyignore.mjs" "$@"
