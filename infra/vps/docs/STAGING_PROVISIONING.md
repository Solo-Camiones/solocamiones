# Guía de aprovisionamiento de staging (M6) — checklist del operador

Esta es la guía paso a paso para el primer host real de staging. Los scripts del
repositorio preparan el host; tú ejecutas los pasos de consola cloud, Cloudflare,
Tailscale y secretos.

**Decisión del host de prueba (owner):** el primer ejercicio de staging usa una **Azure VM**
existente. El plan a largo plazo sigue siendo Hostinger KVM 1
(`docs/deployment_plan/deployment_plan.md`). Documenta id/región/tamaño/costo de Azure
en el password manager / release notes. Los snapshots usan Azure (ver
`SNAPSHOT_VERIFICATION.md` § Azure trial).

**Layout del host (sin git clone para deploys de la app):**

```text
/opt/solocamiones/infra/...
/opt/solocamiones/scripts/deployment/deploy.sh
/opt/solocamiones/docs/...          # opcional; sincronizado para systemd Documentation=
/etc/solocamiones/staging.env       # 0600 root — nunca en Git
/etc/solocamiones/certs/            # Origin TLS + AOP CA
```

---

## 0. Prerrequisitos (operador)

- [x] Password manager + recuperación
- [x] Cuenta Tailscale + dispositivo del operador
- [x] Cuenta Better Stack
- [x] Par de claves `age` para staging (`BACKUP_AGE_RECIPIENT` + clave privada en password manager)
- [x] Bucket R2 `solocamiones-staging-backups` + keys
- [x] API key OpenAI de staging + vector store
- [ ] Dominio `solocamiones.com` activo en Cloudflare (nameservers / control DNS) — **bloque actual**
- [x] Azure NSG: 22 no público; 80/443 abiertos (apretar a rangos Cloudflare cuando DNS esté listo)
- [ ] Publicación GHCR + PAT de staging — **después**, cuando autorices el primer deploy
- [ ] Repo/packages privados — **después**, antes de depender de un PAT solo-staging

**No** pegues secretos en chat, tickets ni Git.

---

## Progreso (actualizado 2026-10-06)

| Ítem                                                                                          | Estado                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------- |
| Prerrequisitos cuentas (`age`, R2, Tailscale, Better Stack, password manager, OpenAI staging) | Hecho                              |
| Azure VM + NSG 22 cerrado a Internet                                                          | Hecho                              |
| Bootstrap Ubuntu + UFW Cloudflare allowlist + Tailscale                                       | Hecho                              |
| SSH `deploy` (y `many`) por Tailscale                                                         | Hecho (tras recovery `AllowUsers`) |
| `sync-host-tree` → `/opt/solocamiones`                                                        | Hecho                              |
| `/etc/solocamiones/staging.env`                                                               | Hecho (`CF_ACCESS_*` pendiente)    |
| `db` + `bootstrap-db` + `test-db-roles`                                                       | Hecho                              |
| Nameservers dominio → Cloudflare                                                              | **En curso / pendiente operador**  |
| DNS `staging` + Origin Cert + AOP + Access/WARP                                               | Pendiente                          |
| GHCR digests + `deploy.sh` + api/web/edge                                                     | Pendiente                          |
| Backups horarios / obs / Assistant                                                            | Pendiente                          |

Lecciones registradas:

- Bootstrap no debe dejar `AllowUsers` solo en `deploy` (bloquea Bastion/admin Azure). El script ahora incluye `SUDO_USER` / `--ssh-allow-users`.
- En WSL, la identity SSH debe vivir en `~/.ssh` con `chmod 600` (no `/mnt/c/...`).
- Smoke Compose en laptop (`.env.smoke` / certs dev) retirado; verificación solo en este host.

Detalle canónico de evidencia: `docs/RELEASES/v2.0.0.md` §11.

---

## 1. Red Azure (antes / junto con el bootstrap)

1. Anota la IP pública de la VM (destino DNS de Cloudflare).
2. NSG inbound:
   - Permitir **80/443** solo desde los [rangos IP de Cloudflare](https://www.cloudflare.com/ips/).
   - **Denegar** **22** público (SSH). Usa Azure Serial Console / Bastion para rescate hasta que Tailscale funcione.
3. Registra: nombre de la VM, resource group, región, tamaño, costo mensual aproximado.

---

## 2. Bootstrap del host Ubuntu (M6.2)

Desde una ruta temporal en la VM (copia los scripts una vez vía Serial Console / scp mientras aún tengas acceso de rescate).

Si copias desde Windows, convierte **todos** los `.sh` a LF antes de ejecutar (si no, bash puede fallar con `ca-certificates: command not found` o `deb [...]: No such file or directory`):

```bash
# En el directorio donde pegaste/subiste los scripts:
sed -i 's/\r$//' ./*.sh
# O en el tree ya sincronizado:
find /opt/solocamiones -type f \( -name '*.sh' -o -name '*.bash' \) -exec sed -i 's/\r$//' {} +
```

El repo fuerza LF vía `.gitattributes` + `.editorconfig`. Preferí `git clone` / `sync-host-tree.sh` (este último rechaza sync local con CRLF y normaliza LF en el remoto).

```bash
sudo bash /path/to/bootstrap-ubuntu.sh \
  --deploy-user deploy \
  --deploy-pubkey /tmp/your-laptop.pub \
  --ssh-allow-users many
```

Incluye siempre el usuario admin de Azure (p. ej. `many`) en `AllowUsers`, o confía en que el script añade `SUDO_USER` automáticamente cuando corres el bootstrap con `sudo` desde ese usuario. Si dejas solo `deploy`, Bastion/SSH como admin quedan bloqueados.

O, cuando ya sea posible el primer sync:

```bash
sudo bash /opt/solocamiones/scripts/deployment/bootstrap-ubuntu.sh \
  --deploy-user deploy \
  --deploy-pubkey /home/deploy/.ssh/authorized_keys.pub
```

Luego:

```bash
sudo tailscale up
# Confirm: tailscale status  → anota la dirección 100.x
sudo ufw allow in on tailscale0 to any port 22 proto tcp
sudo ufw status verbose
sudo bash /opt/solocamiones/scripts/deployment/sync-cloudflare-ufw.sh
```

SSH solo vía Tailscale a partir de ahora:

```text
ssh deploy@100.x.x.x
```

---

## 3. Sync de árboles del repo (layout M6)

En tu workstation (WSL recomendado en Windows — necesita `rsync` + `ssh`):

```bash
./scripts/deployment/sync-host-tree.sh --host deploy@100.x.x.x
# opcional: --dry-run  |  --identity ~/.ssh/id_ed25519
```

Esto actualiza `/opt/solocamiones/{infra,scripts,docs}`. **No** despliega imágenes API/web.

---

## 4. Edge Cloudflare (M6.3)

1. DNS: `staging.solocamiones.com` → IP pública de Azure, **proxied**.
2. SSL/TLS: **Full (strict)**.
3. Crear **Origin Certificate** de Cloudflare para `staging.solocamiones.com`; instalar en el host:

```bash
sudo mkdir -p /etc/solocamiones/certs
# origin.pem + origin.key (0600) from Cloudflare Origin CA
# authenticated_origin_pull_ca.pem from Cloudflare Authenticated Origin Pulls
sudo chmod 600 /etc/solocamiones/certs/origin.key
```

4. Activar **Authenticated Origin Pulls** para el hostname/zone cuando esté listo.
5. Aplicación Cloudflare Access para staging (deny por defecto); **audience** distinto.
6. Exigir **WARP** para usuarios humanos.
7. Crear Access **service token** solo para uptime de Better Stack.
8. WAF / rate limit en rutas de login; no cachear `/api/*`.

El env de la API debe coincidir:

- `ALLOWED_HOSTS=staging.solocamiones.com`
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` (audience de staging)

`deploy.sh` (smoke de staging) también puede leer `SMOKE_BASE_URL` desde
`/etc/solocamiones/staging.env` (solo host; Compose no la usa). Precedencia:
variable de proceso → env file → `https://staging.solocamiones.com`.

---

## 5. Archivo de secretos (M6.4)

**Estado 2026-10-06:** `/etc/solocamiones/staging.env` creado en el host de ensayo. Completar `CF_ACCESS_*` cuando exista la app Access de staging.

```bash
sudo cp /opt/solocamiones/infra/vps/.env.staging.example /etc/solocamiones/staging.env
sudo chmod 600 /etc/solocamiones/staging.env
sudoedit /etc/solocamiones/staging.env
```

Completa desde el password manager: contraseñas de Postgres, R2, `BACKUP_AGE_RECIPIENT`
(solo la pública), Access, metrics token, OpenAI (puedes dejar Assistant deshabilitado
hasta §8), token de Better Stack.

Genera contraseñas fuertes y únicas por cada rol. Nunca reutilices valores de producción.

**URLs Prisma (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BACKUP_DATABASE_URL`,
`RESTORE_DATABASE_URL`):** la contraseña dentro de la URL debe ir
[percent-encoded](https://www.prisma.io/docs/orm/reference/connection-urls#special-characters).
`ROLE_*_PASSWORD` se usa en claro (bootstrap/psql); la misma contraseña en
`postgresql://user:PASSWORD@db:5432/...` no. Caracteres como `#`, `?`, `/`, `@`,
`:` sin encode provocan `P1013: invalid port number in database URL` en
`deploy.sh` → migrate, aunque `bootstrap-db` haya pasado.

```bash
# Encode solo la contraseña (no imprimas el resultado en tickets/chat).
python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' 'RAW_PASSWORD'
```

---

## 6. Primer bootstrap de DB (antes o junto con el primer deploy de imagen)

**Estado 2026-10-06:** `db` healthy; `bootstrap-db` y `test-db-roles` OK en el host Azure. `migrate` + api/web/edge esperan digests GHCR + Cloudflare.

Cuando `BACKUP_IMAGE` / la imagen local de backup esté disponible (en el ensayo se construyó con `compose build bootstrap-db`):

```bash
cd /opt/solocamiones
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml up -d db
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile operations run --rm bootstrap-db
# migrate runs inside deploy.sh once API_IMAGE digest exists
```

---

## 7. GHCR + primer deploy (M6.5) — cuando autorices la publicación

Diferido hasta terminar la prep de deploy (decisión del owner). Luego:

1. Privatizar GitHub packages (o asegurar scopes least-privilege en el PAT).
2. Crear PAT **solo-staging** con `read:packages`; guardar en password manager.
3. En el host como `deploy`:

```bash
echo "$STAGING_GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

4. Merge/push a `develop` para que `release.yml` publique digests.
5. Secrets de GitHub Actions (repo; el job `deploy-staging` no usa Environment aún):

**SSH (destino):**

- `STAGING_SSH_HOST` = IP/hostname de Tailscale del VPS (p. ej. `100.x.x.x` o MagicDNS). **Nunca** la IP pública: el 22 solo escucha en `tailscale0`.
- `STAGING_SSH_USER` = `deploy`
- `STAGING_SSH_KEY` = clave privada cuyo pubkey está en `/home/deploy/.ssh/authorized_keys`
- `STAGING_SSH_KNOWN_HOSTS` = línea(s) de `known_hosts` del host (obligatorio: el workflow usa `StrictHostKeyChecking=yes`)

Desde una máquina ya en el tailnet:

```bash
ssh-keyscan -t ed25519 100.x.x.x
# Copia la salida completa al secreto STAGING_SSH_KNOWN_HOSTS
```

**Tailscale en el runner de GitHub Actions** (sin esto el SSH hace timeout en el puerto 22):

- `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` = [OAuth client](https://tailscale.com/s/oauth-clients) del tailnet con scope **writable** `auth_keys`
- `TS_TAGS` = tag(s) del cliente OAuth, p. ej. `tag:ci` (debe coincidir con los tags permitidos en el OAuth client y con las ACLs)

El workflow une el runner con `tailscale/github-action` (pinneado por SHA), hace `ping` a `STAGING_SSH_HOST` y recién entonces ejecuta SSH. No abras el 22 a Internet para “arreglar” Actions.

ACL mínima (ejemplo): nodos con `tag:ci` pueden SSH al host de staging. Revoca/rota el OAuth secret si se filtra.

Para `promote-production.yml` (M8/M9): mismos `TS_*` + `PRODUCTION_SSH_*` / `PRODUCTION_SSH_KNOWN_HOSTS`.

6. Confirmar path del entrypoint remoto:

```text
/opt/solocamiones/scripts/deployment/deploy.sh
```

7. Tras stack saludable: crear el primer Administrator de forma interactiva (`bootstrap-admin` vía one-shot de imagen API / CLI documentado).
8. Cambiar la contraseña inicial.
9. Crear **datos sintéticos mínimos** a mano (cliente, servicio, una venta/conduce) — sin seeds de producción.

---

## 8. Backups, observabilidad, Assistant (M6.6–M6.7)

```bash
sudo cp /opt/solocamiones/infra/vps/systemd/solocamiones-backup.* /etc/systemd/system/
sudo cp /opt/solocamiones/infra/vps/systemd/solocamiones-assistant-purge.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now solocamiones-backup.timer
sudo systemctl enable --now solocamiones-assistant-purge.timer
```

Compose profiles (staging):

```bash
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile host-metrics --profile observability --profile logs up -d
```

- Better Stack: logs vía Vector; monitores de uptime con Access service token (ver `OBSERVABILITY.md`).
- Snapshot semanal de Azure + checklist en `SNAPSHOT_VERIFICATION.md`.
- Ejecutar un backup + `verify-restore.sh` en una DB aislada (M3.6 / gate hacia M7).
- Assistant: `assistant:sync-knowledge` dry-run → sync; poner `ASSISTANT_ENABLED=true`; probar kill switch.

---

## 9. Evidencia del gate

Registrar en `docs/RELEASES/v2.0.0.md` § M6:

- Metadatos de la Azure VM + nota de costo
- Identidad del host Tailscale (sin secretos)
- Digests desplegados
- Sample de object key de backup + resultado del restore
- Check negativo Access/WARP (resumen)
- Sync de Assistant + timer de purge activo

**Exit gate:** staging solo vía Access/WARP; digests privados; secretos aislados; backups/alertas; Assistant aislado; datos sintéticos mínimos presentes.
