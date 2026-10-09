#!/usr/bin/env bash
# Idempotent Ubuntu host bootstrap for Solo Camiones staging/production (M6.2).
#
# Prepares Docker, Tailscale package, UFW, Fail2ban, deploy user, and
# /opt/solocamiones + /etc/solocamiones. Does NOT clone the git repository and
# does NOT deploy application images (use sync-host-tree.sh + deploy.sh).
#
# Usage (as root on a clean Ubuntu Server LTS host):
#   ./bootstrap-ubuntu.sh
#   ./bootstrap-ubuntu.sh --deploy-user deploy --deploy-pubkey /tmp/deploy.pub
#   ./bootstrap-ubuntu.sh --skip-ufw --skip-tailscale-install
#
# After bootstrap:
#   1) Add your SSH public key if not passed via --deploy-pubkey
#   2) tailscale up   (operator interactive / auth key)
#   3) sync-host-tree.sh from your workstation
#   4) sync-cloudflare-ufw.sh (also invoked here unless --skip-ufw)
set -euo pipefail

# Windows CRLF breaks bash line continuations (`\` + CR), so package names like
# `ca-certificates` get executed as commands. Fail early with a clear fix.
if grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
  echo "bootstrap-ubuntu: script has Windows CRLF line endings." >&2
  echo "bootstrap-ubuntu: fix on the host with: sed -i 's/\\r\$//' ${BASH_SOURCE[0]}" >&2
  exit 1
fi

DEPLOY_USER='deploy'
DEPLOY_PUBKEY_FILE=''
OPT_ROOT='/opt/solocamiones'
ETC_ROOT='/etc/solocamiones'
# Extra SSH logins besides deploy (e.g. Azure admin). Also auto-includes SUDO_USER.
SSH_ALLOW_EXTRA=''
SKIP_UFW=0
SKIP_TAILSCALE_INSTALL=0
SKIP_FAIL2BAN=0
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: bootstrap-ubuntu.sh [options]

Options:
  --deploy-user NAME          Non-root SSH/deploy user (default: deploy)
  --deploy-pubkey PATH        Install this SSH public key for the deploy user
  --ssh-allow-users LIST      Extra SSH users (comma-separated), e.g. many
                              Also keeps SUDO_USER (the admin that ran sudo) if set
  --opt-root PATH             Application tree root (default: /opt/solocamiones)
  --etc-root PATH             Secrets directory (default: /etc/solocamiones)
  --skip-ufw                  Do not configure UFW / Cloudflare allowlist
  --skip-tailscale-install    Do not install Tailscale package
  --skip-fail2ban             Do not install/enable Fail2ban
  --dry-run                   Print planned actions without changing the system
EOF
}

log() {
  echo "bootstrap-ubuntu: $*"
}

run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "dry-run: $*"
  else
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy-user)
      DEPLOY_USER="${2:-}"
      shift 2
      ;;
    --deploy-pubkey)
      DEPLOY_PUBKEY_FILE="${2:-}"
      shift 2
      ;;
    --ssh-allow-users)
      SSH_ALLOW_EXTRA="${2:-}"
      shift 2
      ;;
    --opt-root)
      OPT_ROOT="${2:-}"
      shift 2
      ;;
    --etc-root)
      ETC_ROOT="${2:-}"
      shift 2
      ;;
    --skip-ufw)
      SKIP_UFW=1
      shift
      ;;
    --skip-tailscale-install)
      SKIP_TAILSCALE_INSTALL=1
      shift
      ;;
    --skip-fail2ban)
      SKIP_FAIL2BAN=1
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
      echo "bootstrap-ubuntu: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${DEPLOY_USER}" || ! "${DEPLOY_USER}" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  echo "bootstrap-ubuntu: invalid --deploy-user" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 && "${DRY_RUN}" -eq 0 ]]; then
  echo "bootstrap-ubuntu: must run as root" >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "bootstrap-ubuntu: /etc/os-release not found" >&2
  exit 1
fi
# shellcheck source=/dev/null
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "bootstrap-ubuntu: only Ubuntu is supported (found ID=${ID:-unknown})" >&2
  exit 1
fi

log "starting (user=${DEPLOY_USER} opt=${OPT_ROOT} etc=${ETC_ROOT} dry_run=${DRY_RUN})"

export DEBIAN_FRONTEND=noninteractive

BASE_PACKAGES=(
  ca-certificates
  curl
  gnupg
  lsb-release
  ufw
  fail2ban
  unattended-upgrades
  apt-transport-https
  jq
  rsync
  openssh-server
)

run apt-get update -y
run apt-get install -y "${BASE_PACKAGES[@]}"

# --- Deploy user -----------------------------------------------------------------
if [[ "${DRY_RUN}" -eq 1 ]]; then
  log "dry-run: would ensure user ${DEPLOY_USER} exists with docker group"
else
  if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
    adduser --disabled-password --gecos 'Solo Camiones deploy' "${DEPLOY_USER}"
  fi
  usermod -aG sudo "${DEPLOY_USER}" || true
fi

# --- Docker Engine + Compose plugin ---------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "dry-run: would install Docker from download.docker.com"
  else
    install -m 0755 -d /etc/apt/keyrings
    if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
    fi
    # One statement (no `\` continuations): CRLF uploads break backslash line joins.
    docker_arch="$(dpkg --print-architecture)"
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "${docker_arch}" "${VERSION_CODENAME}" >/etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
else
  log "Docker already installed"
fi

if [[ "${DRY_RUN}" -eq 0 ]]; then
  systemctl enable --now docker
  usermod -aG docker "${DEPLOY_USER}"
fi

# --- Tailscale package (join is operator-driven) --------------------------------
if [[ "${SKIP_TAILSCALE_INSTALL}" -eq 0 ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    log "installing Tailscale"
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      log "dry-run: would install Tailscale"
    else
      curl -fsSL https://tailscale.com/install.sh | sh
    fi
  else
    log "Tailscale already installed"
  fi
  log "run 'tailscale up' as root after bootstrap (do not rely on public SSH)"
else
  log "skipping Tailscale install"
fi

# --- Directories ----------------------------------------------------------------
if [[ "${DRY_RUN}" -eq 1 ]]; then
  log "dry-run: would create ${OPT_ROOT} and ${ETC_ROOT}"
else
  mkdir -p "${OPT_ROOT}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${OPT_ROOT}"
  chmod 755 "${OPT_ROOT}"

  mkdir -p "${ETC_ROOT}"
  chown root:root "${ETC_ROOT}"
  chmod 700 "${ETC_ROOT}"
fi

# --- SSH hardening for deploy user ----------------------------------------------
if [[ -n "${DEPLOY_PUBKEY_FILE}" ]]; then
  if [[ ! -f "${DEPLOY_PUBKEY_FILE}" ]]; then
    echo "bootstrap-ubuntu: --deploy-pubkey file not found: ${DEPLOY_PUBKEY_FILE}" >&2
    exit 1
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "dry-run: would install SSH pubkey for ${DEPLOY_USER}"
  else
    install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
    touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
    chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
    # Append if missing (idempotent).
    pubkey="$(tr -d '\r' <"${DEPLOY_PUBKEY_FILE}" | sed '/^$/d' | head -n1)"
    if ! grep -Fqx "${pubkey}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"; then
      printf '%s\n' "${pubkey}" >>"/home/${DEPLOY_USER}/.ssh/authorized_keys"
    fi
  fi
fi

SSHD_DROPIN='/etc/ssh/sshd_config.d/99-solocamiones.conf'
# Never lock out the Azure/admin account that ran bootstrap (common Bastion user).
SSH_ALLOW_USERS="${DEPLOY_USER}"
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" && "${SUDO_USER}" != "${DEPLOY_USER}" ]]; then
  SSH_ALLOW_USERS+=" ${SUDO_USER}"
fi
if [[ -n "${SSH_ALLOW_EXTRA}" ]]; then
  IFS=',' read -r -a _extra_users <<<"${SSH_ALLOW_EXTRA}"
  for _u in "${_extra_users[@]}"; do
    _u="$(echo "${_u}" | tr -d '[:space:]')"
    if [[ -n "${_u}" && " ${SSH_ALLOW_USERS} " != *" ${_u} "* ]]; then
      SSH_ALLOW_USERS+=" ${_u}"
    fi
  done
fi
log "sshd AllowUsers: ${SSH_ALLOW_USERS}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  log "dry-run: would write ${SSHD_DROPIN}"
else
  cat >"${SSHD_DROPIN}" <<EOF
# Managed by Solo Camiones bootstrap-ubuntu.sh — prefer Tailscale SSH path.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers ${SSH_ALLOW_USERS}
EOF
  if systemctl is-active --quiet ssh; then
    systemctl reload ssh
  elif systemctl is-active --quiet sshd; then
    systemctl reload sshd
  fi
fi

# --- Fail2ban -------------------------------------------------------------------
if [[ "${SKIP_FAIL2BAN}" -eq 0 ]]; then
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "dry-run: would enable fail2ban"
  else
    systemctl enable --now fail2ban
  fi
else
  log "skipping Fail2ban"
fi

# --- Unattended security upgrades ----------------------------------------------
if [[ "${DRY_RUN}" -eq 0 ]]; then
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
fi

# --- UFW: deny public by default; Cloudflare 80/443; Tailscale interface --------
if [[ "${SKIP_UFW}" -eq 0 ]]; then
  log "configuring UFW baseline"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "dry-run: would reset UFW defaults and sync Cloudflare ranges"
  else
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    # Tailscale interface name is typically tailscale0 after first successful up.
    # Allow SSH from anywhere only until Tailscale is up is unsafe; instead allow
    # OpenSSH only on the Tailscale interface when it exists, plus keep a short
    # rescue path: if Tailscale is down, use Azure Serial Console / Hostinger KVM.
    if ip link show tailscale0 >/dev/null 2>&1; then
      ufw allow in on tailscale0 to any port 22 proto tcp comment 'solocamiones-tailscale-ssh'
    else
      log "WARNING: tailscale0 not present yet — SSH not opened on public NIC"
      log "WARNING: finish 'tailscale up', then re-run this script or:"
      log "WARNING:   ufw allow in on tailscale0 to any port 22 proto tcp"
    fi
    ufw --force enable
  fi

  if [[ -x "${SCRIPT_DIR}/sync-cloudflare-ufw.sh" ]]; then
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      bash "${SCRIPT_DIR}/sync-cloudflare-ufw.sh" --dry-run
    else
      bash "${SCRIPT_DIR}/sync-cloudflare-ufw.sh"
    fi
  else
    log "WARNING: sync-cloudflare-ufw.sh not found next to this script; skip Cloudflare allowlist"
  fi
else
  log "skipping UFW"
fi

log "complete"
log "next:"
log "  1) Ensure Azure NSG / cloud firewall also limits 80/443 to Cloudflare and blocks public 22"
log "  2) tailscale up"
log "  3) From workstation: scripts/deployment/sync-host-tree.sh --host ${DEPLOY_USER}@<tailscale-host>"
log "  4) Create ${ETC_ROOT}/staging.env (0600) from infra/vps/.env.staging.example"
log "  5) Install systemd units from ${OPT_ROOT}/infra/vps/systemd/ after first successful deploy"
