#!/usr/bin/env bash
# Sync versioned infra + scripts (+ optional docs) to a Solo Camiones host (M6).
#
# Layout on the remote host (no git clone required for deploys):
#   /opt/solocamiones/infra/...
#   /opt/solocamiones/scripts/...
#   /opt/solocamiones/docs/...   (optional; systemd Documentation= file:// refs)
#
# Application images are NEVER built here — only pulled by digest via deploy.sh.
#
# Prerequisites on the workstation: rsync, ssh.
# Prefer Tailscale hostname/IP for --host.
#
# Usage:
#   ./scripts/deployment/sync-host-tree.sh --host deploy@100.x.x.x
#   ./scripts/deployment/sync-host-tree.sh --host deploy@staging-ts --dry-run
#   ./scripts/deployment/sync-host-tree.sh --host deploy@staging-ts --skip-docs
set -euo pipefail

# Windows CRLF breaks bash line continuations; fail early with a clear fix.
if grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
  echo "sync-host-tree: script has Windows CRLF line endings." >&2
  echo "sync-host-tree: fix with: sed -i 's/\\r\$//' ${BASH_SOURCE[0]}" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_HOST=''
REMOTE_ROOT='/opt/solocamiones'
SSH_IDENTITY=''
DRY_RUN=0
SKIP_DOCS=0
RSYNC_EXTRA=()

usage() {
  cat <<'EOF'
Usage: sync-host-tree.sh --host user@tailscale-host [options]

Options:
  --host USER@HOST       Required SSH target (prefer Tailscale)
  --remote-root PATH     Remote tree root (default: /opt/solocamiones)
  --identity PATH        SSH private key (-i)
  --skip-docs            Do not sync docs/ (systemd Documentation= may 404)
  --dry-run              rsync dry-run only
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      REMOTE_HOST="${2:-}"
      shift 2
      ;;
    --remote-root)
      REMOTE_ROOT="${2:-}"
      shift 2
      ;;
    --identity)
      SSH_IDENTITY="${2:-}"
      shift 2
      ;;
    --skip-docs)
      SKIP_DOCS=1
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
      echo "sync-host-tree: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${REMOTE_HOST}" ]]; then
  echo "sync-host-tree: --host is required" >&2
  usage >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "sync-host-tree: rsync is required (use WSL or Git Bash with rsync)" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "sync-host-tree: ssh is required" >&2
  exit 1
fi

SSH_CMD=(ssh -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSH_IDENTITY}" ]]; then
  SSH_CMD+=(-i "${SSH_IDENTITY}")
fi

RSYNC_SSH="$(printf '%q ' "${SSH_CMD[@]}")"
RSYNC_SSH="${RSYNC_SSH% }"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  RSYNC_EXTRA+=(--dry-run)
fi

# Refuse to ship CRLF shell scripts from a Windows checkout / bad editor setting.
crlf_shell_files=()
while IFS= read -r -d '' shell_file; do
  if grep -q $'\r' "${shell_file}" 2>/dev/null; then
    crlf_shell_files+=("${shell_file}")
  fi
done < <(find "${ROOT_DIR}/scripts" "${ROOT_DIR}/infra" -type f \( -name '*.sh' -o -name '*.bash' \) -print0)
if ((${#crlf_shell_files[@]} > 0)); then
  echo "sync-host-tree: refusing sync — CRLF line endings found in:" >&2
  printf '%s\n' "${crlf_shell_files[@]}" >&2
  echo "sync-host-tree: fix locally with: sed -i 's/\\r\$//' <file>  (or enable *.sh eol=lf / .editorconfig)" >&2
  exit 1
fi

echo "sync-host-tree: ensuring remote directories on ${REMOTE_HOST}:${REMOTE_ROOT}"
"${SSH_CMD[@]}" "${REMOTE_HOST}" "mkdir -p '${REMOTE_ROOT}/infra' '${REMOTE_ROOT}/scripts' '${REMOTE_ROOT}/docs'"

sync_tree() {
  local src="$1"
  local dest="$2"
  shift 2
  echo "sync-host-tree: ${src} -> ${REMOTE_HOST}:${dest}"
  # Arrays avoid `\` continuations that break if this file is ever saved as CRLF.
  local rsync_args=(-az --delete)
  if ((${#RSYNC_EXTRA[@]})); then
    rsync_args+=("${RSYNC_EXTRA[@]}")
  fi
  # Caller may pass extra rsync filters (e.g. exclude local smoke cert private keys).
  if (($# > 0)); then
    rsync_args+=("$@")
  fi
  rsync_args+=(-e "${RSYNC_SSH}" "${src}/" "${REMOTE_HOST}:${dest}/")
  rsync "${rsync_args[@]}"
}

# Origin TLS for staging/production lives under /etc/solocamiones/certs/, not the repo.
sync_tree "${ROOT_DIR}/infra" "${REMOTE_ROOT}/infra" \
  --exclude 'vps/certs/'
sync_tree "${ROOT_DIR}/scripts" "${REMOTE_ROOT}/scripts"

if [[ "${SKIP_DOCS}" -eq 0 ]]; then
  # Keep Documentation= file:// paths in systemd units resolvable.
  sync_tree "${ROOT_DIR}/docs" "${REMOTE_ROOT}/docs"
else
  echo "sync-host-tree: skipping docs/"
fi

echo "sync-host-tree: normalizing remote shell scripts to LF and marking executable"
"${SSH_CMD[@]}" "${REMOTE_HOST}" "find '${REMOTE_ROOT}/scripts' '${REMOTE_ROOT}/infra' -type f \\( -name '*.sh' -o -name '*.bash' \\) -exec sed -i 's/\\r\$//' {} +; chmod +x '${REMOTE_ROOT}/scripts/deployment/'*.sh || true"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "sync-host-tree: dry-run complete"
else
  echo "sync-host-tree: success"
  echo "sync-host-tree: deploy entrypoint: ${REMOTE_ROOT}/scripts/deployment/deploy.sh"
fi
