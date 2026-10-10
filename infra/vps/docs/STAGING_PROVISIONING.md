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
/opt/solocamiones/docs/...          # sync-host-tree; necesario para Assistant sync + systemd Documentation=
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
- [x] Dominio `solocamiones.com` activo en Cloudflare (nameservers / control DNS)
- [x] Azure NSG: 22 no público; 80/443 solo rangos Cloudflare
- [x] Publicación GHCR + PAT de staging (`read:packages`) + `docker login` en la VM
- [x] Repo/packages privados (o scopes least-privilege)

**No** pegues secretos en chat, tickets ni Git.

---

## Progreso (actualizado 2026-10-10)

| Ítem | Estado |
| ---- | ------ |
| Prerrequisitos cuentas (`age`, R2, Tailscale, Better Stack, password manager, OpenAI staging) | Hecho |
| Azure VM + NSG 22 cerrado a Internet; 80/443 restringidos a Cloudflare | Hecho |
| Bootstrap Ubuntu + UFW Cloudflare allowlist + Tailscale | Hecho |
| SSH `deploy` (y `many`) por Tailscale | Hecho |
| `sync-host-tree` → `/opt/solocamiones` | Hecho |
| `/etc/solocamiones/staging.env` completo (incl. `CF_ACCESS_*`, digests, smoke token) | Hecho |
| `db` + `bootstrap-db` + `test-db-roles` | Hecho |
| Nameservers dominio → Cloudflare; DNS `staging` proxied | Hecho |
| Origin Cert + AOP + Access/WARP + service token | Hecho |
| GHCR digests + `deploy.sh` + api/web/edge healthy + smoke passed | Hecho |
| Primer Administrator + password + datos sintéticos mínimos | Hecho |
| Timers backup/purge + profiles obs/logs + Better Stack | Hecho |
| Assistant corpus sync + `ASSISTANT_ENABLED` + kill switch | Hecho |

Lecciones registradas:

- Bootstrap no debe dejar `AllowUsers` solo en `deploy` (bloquea Bastion/admin Azure). El script ahora incluye `SUDO_USER` / `--ssh-allow-users`.
- En WSL, la identity SSH debe vivir en `~/.ssh` con `chmod 600` (no `/mnt/c/...`).
- Scripts `.sh` con CRLF fallan en Linux (`env: bash\r`); forzar LF (`.gitattributes` / `sed -i 's/\r$//'`).
- Smoke Compose en laptop retirado; verificación solo en este host.
- `deploy.sh` **exporta** digests en el proceso del deploy pero **no los escribe** en `staging.env` (decisión temporal: persistencia manual; ver **§9.2**). Motivo de no automatizar aún: el archivo es `root:root` `0600` y el usuario `deploy` no debe poder reescribir secretos.
- Runner de GitHub Actions necesita Tailscale (`TS_OAUTH_*` + `TS_TAGS`) para alcanzar el SSH en `100.x`; no abrir el 22 a Internet.
- Better Stack **logs** (Vector): hace falta `BETTERSTACK_SOURCE_TOKEN` **y** `BETTERSTACK_INGESTING_HOST` (host regional del source en la UI, sin `https://`). Solo token + URI genérica `in.logs.betterstack.com` → **401** en el sink aunque el token sea válido. Validar con `curl` → **202** antes de recrear Vector.

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

Si copias desde Windows, convierte **todos** los `.sh` a LF antes de ejecutar:

```bash
sed -i 's/\r$//' ./*.sh
# O en el tree ya sincronizado:
find /opt/solocamiones -type f \( -name '*.sh' -o -name '*.bash' \) -exec sed -i 's/\r$//' {} +
```

```bash
sudo bash /path/to/bootstrap-ubuntu.sh \
  --deploy-user deploy \
  --deploy-pubkey /tmp/your-laptop.pub \
  --ssh-allow-users many
```

Incluye siempre el usuario admin de Azure (p. ej. `many`) en `AllowUsers`.

Luego:

```bash
sudo tailscale up
sudo ufw allow in on tailscale0 to any port 22 proto tcp
sudo ufw status verbose
sudo bash /opt/solocamiones/scripts/deployment/sync-cloudflare-ufw.sh
```

SSH solo vía Tailscale:

```text
ssh deploy@100.x.x.x
```

---

## 3. Sync de árboles del repo (layout M6)

En tu workstation (WSL recomendado — necesita `rsync` + `ssh`):

```bash
cd /mnt/c/solocamiones   # o la ruta del clone
./scripts/deployment/sync-host-tree.sh --host deploy@100.x.x.x --identity ~/.ssh/solocamiones_staging_key.pem
# opcional: --dry-run | --skip-docs
```

**Para qué:** copia `infra/`, `scripts/` y `docs/` a `/opt/solocamiones/`. **No** despliega imágenes API/web. Repetir cuando cambien scripts/Compose/docs en el repo.

---

## 4. Edge Cloudflare (M6.3)

1. DNS: `staging.solocamiones.com` → IP pública de Azure, **proxied**.
2. SSL/TLS: **Full (strict)**.
3. Origin Certificate → instalar en el host:

```bash
sudo mkdir -p /etc/solocamiones/certs
# origin.pem + origin.key (0600) + authenticated_origin_pull_ca.pem
sudo chmod 600 /etc/solocamiones/certs/origin.key
```

4. Activar **Authenticated Origin Pulls**.
5. Aplicación Cloudflare Access (deny por defecto); **audience** distinto de producción; exigir **WARP** a humanos.
6. Access **service token** para:
   - monitores uptime Better Stack, y
   - smoke de `deploy.sh` en el host (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` en `staging.env`).
7. WAF / rate limit en login; no cachear `/api/*`.
8. Re-sincronizar UFW y apretar NSG a rangos Cloudflare.

El env de la API debe coincidir: `ALLOWED_HOSTS`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.

---

## 5. Archivo de secretos (M6.4)

```bash
sudo cp /opt/solocamiones/infra/vps/.env.staging.example /etc/solocamiones/staging.env
sudo chown root:root /etc/solocamiones/staging.env
sudo chmod 600 /etc/solocamiones/staging.env
sudoedit /etc/solocamiones/staging.env
```

Referencia completa de variables: **§10** más abajo (y comentarios en `.env.staging.example`).

**URLs Prisma:** percent-encode la contraseña dentro de `DATABASE_*_URL`. `ROLE_*_PASSWORD` queda en claro para bootstrap/psql.

```bash
python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' 'RAW_PASSWORD'
```

---

## 6. Primer bootstrap de DB

```bash
cd /opt/solocamiones
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml up -d db
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile operations run --rm bootstrap-db
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile operations run --rm test-db-roles
# migrate corre dentro de deploy.sh cuando exista API_IMAGE digest
```

---

## 7. GHCR + primer deploy (M6.5)

1. Packages GHCR privados (o PAT least-privilege).
2. PAT solo-staging `read:packages` → password manager.
3. En el host como `deploy`:

```bash
echo "$STAGING_GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

4. Configurar secrets de GitHub (ver **§11**).
5. Merge/push a `develop` → `release.yml` publica digests y, con secrets SSH+Tailscale, ejecuta:

```text
/opt/solocamiones/scripts/deployment/deploy.sh
```

6. **Obligatorio tras cada deploy:** persistir digests en `staging.env` a mano (**§9.2**). Sin esto, el siguiente `docker compose` (obs, backup, recreate) puede caer a `*:local`.
7. Primer Administrator (interactivo):

```bash
cd /opt/solocamiones
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  run --rm -it --no-deps api \
  node apps/api/dist/cli/bootstrap-admin.js
```

**Para qué:** crea el único Administrator inicial en una base sin usuarios. Tú eliges la contraseña (no usa `INITIAL_PASSWORD`). Luego login web (WARP+Access) → cambiar password en perfil → datos sintéticos mínimos a mano.

Documentación local equivalente: `README.md` → «Primer Administrador» (`npm run bootstrap:admin` con `tsx`; en la imagen VPS se usa el `dist`).

---

## 8. Backups, observabilidad, Assistant (M6.6–M6.7)

### 8.1 Timers systemd

```bash
sudo cp /opt/solocamiones/infra/vps/systemd/solocamiones-backup.* /etc/systemd/system/
sudo cp /opt/solocamiones/infra/vps/systemd/solocamiones-assistant-purge.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now solocamiones-backup.timer
sudo systemctl enable --now solocamiones-assistant-purge.timer
systemctl list-timers | grep solocamiones
```

**Para qué:** backup horario → R2 cifrado; purge Assistant ~03:00 `America/Santo_Domingo`.

### 8.2 Profiles Compose (métricas / Grafana / logs)

Requiere `API_IMAGE` / `WEB_IMAGE` ya en `staging.env` (si no, Compose intenta `*:local` y build de `/opt/solocamiones/apps`, que no existe).

```bash
cd /opt/solocamiones
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile host-metrics --profile observability --profile logs up -d
```

**Para qué:**

| Profile | Servicios | Uso |
| ------- | --------- | --- |
| `host-metrics` | `node-exporter` | CPU/disco + textfile de backup |
| `observability` | Prometheus + Grafana | Solo staging; bind Tailscale/loopback. **Cómo abrir UI:** `OBSERVABILITY.md` → «Cómo ver Grafana y Prometheus» (`ssh -L` si `MONITORING_BIND=127.0.0.1`) |
| `logs` | Vector | Envío de logs Docker a Better Stack (`BETTERSTACK_SOURCE_TOKEN` + `BETTERSTACK_INGESTING_HOST`) |

Antes de subir Vector, en `staging.env`:

```bash
BETTERSTACK_SOURCE_TOKEN=...          # Logs → Source → Source token
BETTERSTACK_INGESTING_HOST=s….betterstackdata.com   # mismo source; sin https://
```

Probe (debe devolver **202**):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "https://${BETTERSTACK_INGESTING_HOST}/" \
  -H "Authorization: Bearer ${BETTERSTACK_SOURCE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"message":"solocamiones staging vector probe","level":"info"}'
```

Better Stack **uptime** (monitores HTTP) usa el **Access service token** (headers), no el source token de logs. Ver `OBSERVABILITY.md`.

### 8.3 Assistant (M6.7)

```bash
# Dry-run (monta docs/: la imagen API no trae el corpus)
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  run --rm --no-deps \
  -v /opt/solocamiones/docs:/app/docs:ro \
  api \
  node apps/api/dist/cli/assistant-sync-knowledge.js --dry-run

# Sync real
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  run --rm --no-deps \
  -v /opt/solocamiones/docs:/app/docs:ro \
  api \
  node apps/api/dist/cli/assistant-sync-knowledge.js
```

Luego:

```bash
sudoedit /etc/solocamiones/staging.env   # ASSISTANT_ENABLED=true
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  up -d --no-deps --force-recreate api
```

Kill switch: `ASSISTANT_ENABLED=false` + recreate `api` → assistant `503` / `ASSISTANT_DISABLED`; comercio/health OK.

---

## 9. Secuencia de comandos post-deploy (operación habitual)

Orden canónico después de un merge a `develop` exitoso (o para cablear obs/Assistant la primera vez).

### 9.1 Ver estado del stack

```bash
cd /opt/solocamiones
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml ps
```

**Para qué:** confirmar `api` / `web` / `edge` / `db` healthy.

### 9.2 Tras cada deploy: persistir digests en `staging.env` (manual)

`deploy.sh` deja evidencia en `/tmp/solocamiones-deploy-evidence/` y usa las imágenes solo en ese proceso (`export`). **No** actualiza `/etc/solocamiones/staging.env`. Mientras no se automatice (archivo root-only), el operador debe copiar los tres valores después de **cada** deploy exitoso (CI o manual).

**Importante:** `/tmp` es **efímero**. Un reinicio de la VM o `systemd-tmpfiles` puede borrar la evidencia. Si `ls` falla con *No such file*, usa el **fallback** (contenedores / imágenes locales) más abajo. Ideal: persistir digests en el env **en la misma sesión** del deploy, antes de que desaparezca `/tmp`.

**1a. Preferido — `cat` de la evidencia** (hazlo en la misma sesión del deploy; `/tmp` puede borrarse):

```bash
# Ver qué archivos hay
ls -lt /tmp/solocamiones-deploy-evidence/

# Mostrar el más reciente completo (incluye api_image / web_image / backup_image)
cat "$(ls -t /tmp/solocamiones-deploy-evidence/deploy-staging-*.txt | head -n1)"
```

Si solo quieres las tres líneas de imagen:

```bash
grep -E '^(api_image|web_image|backup_image)=' \
  "$(ls -t /tmp/solocamiones-deploy-evidence/deploy-staging-*.txt | head -n1)"
```

Salida típica del `cat` / `grep`:

```text
env=staging
...
api_image=ghcr.io/solo-camiones/solocamiones-api@sha256:...
web_image=ghcr.io/solo-camiones/solocamiones-web@sha256:...
backup_image=ghcr.io/solo-camiones/solocamiones-backup@sha256:...
smoke=passed
```

Si `ls`/`cat` fallan (*No such file*), la evidencia ya no está en `/tmp` → usa **1b**.

**1b. Fallback — stack ya desplegado** (solo si `/tmp` está vacío):

```bash
docker inspect --format '{{.Config.Image}}' solocamiones_staging-api-1
docker inspect --format '{{.Config.Image}}' solocamiones_staging-web-1
docker images --digests 'ghcr.io/solo-camiones/solocamiones-backup' \
  --format '{{.Repository}}@{{.Digest}}\t{{.CreatedSince}}'
```

`Config.Image` de api/web → `API_IMAGE` / `WEB_IMAGE`. Para `BACKUP_IMAGE`, la digest del mismo deploy (o la más reciente coherente del listado).

**2. Escribirlas en el env** (nombres de variable Compose = mayúsculas):

```bash
sudoedit /etc/solocamiones/staging.env
```

Deja (o sustituye) exactamente:

```bash
API_IMAGE=<valor de api / Config.Image>
WEB_IMAGE=<valor de web / Config.Image>
BACKUP_IMAGE=<digest backup del mismo deploy>
```

**3. Verificar:**

```bash
sudo grep -E '^(API_IMAGE|WEB_IMAGE|BACKUP_IMAGE)=' /etc/solocamiones/staging.env
```

**Para qué:** cualquier `docker compose --env-file ... up` posterior (profiles de obs, backup one-shot, recreate) lee esas variables del archivo. Sin ellas, Compose usa `solocamiones-*:local` e intenta build desde `/opt/solocamiones/apps` (inexistente en el host).

### 9.3 Levantar observabilidad / logs

```bash
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile host-metrics --profile observability --profile logs up -d
```

### 9.4 Backup one-shot (opcional / drill)

```bash
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile operations run --rm backup
```

### 9.5 Refresh de scripts en el host (desde laptop)

```bash
./scripts/deployment/sync-host-tree.sh --host deploy@100.x.x.x --identity ~/.ssh/<key>.pem
```

---

## 10. Referencia de `/etc/solocamiones/staging.env`

Plantilla versionada: `infra/vps/.env.staging.example`.  
**Nunca** commits con valores reales.

### Identidad Compose / hostname

| Variable | Para qué |
| -------- | -------- |
| `COMPOSE_PROJECT_NAME` | Prefijo de contenedores/redes Compose (p. ej. `solocamiones_staging`). |
| `PUBLIC_HOSTNAME` | Hostname público esperado por edge/Nginx. |
| `SMOKE_BASE_URL` | URL base del smoke post-deploy (`deploy.sh` → `smoke-staging.sh`). Default si vacío: `https://staging.solocamiones.com`. **Solo host**; Compose no la inyecta a servicios. |

### TLS origen (montados en `edge`)

| Variable | Para qué |
| -------- | -------- |
| `ORIGIN_TLS_CERT` | Path host al Origin Certificate Cloudflare (`.pem`). |
| `ORIGIN_TLS_KEY` | Path host a la private key del Origin Cert (`0600`). |
| `ORIGIN_CLIENT_CA` | Path host al CA de Authenticated Origin Pulls. |

### Runtime API

| Variable | Para qué |
| -------- | -------- |
| `APP_ENV` | Debe ser `staging` (discrimina reglas de arranque; no cargar `.env` local). |
| `NODE_ENV` | `production` en staging/producción. |
| `APP_RELEASE` | Versión release (`vMAJOR.MINOR.PATCH`). |
| `ALLOWED_HOSTS` | Host header permitido (`staging.solocamiones.com`). |
| `TRUST_PROXY` | `1` — confiar en `X-Forwarded-*` detrás de Cloudflare/Nginx. |
| `LOG_LEVEL` | Nivel Pino (`info`, etc.). |
| `INITIAL_PASSWORD` | Contraseña temporal de **cuentas creadas por un Administrator** vía UI/API (no el bootstrap CLI). |
| `EXCHANGE_RATE_API_KEY` | Opcional; proveedor FX para rentabilidad. |

### Cloudflare Access (JWT de perímetro)

| Variable | Para qué |
| -------- | -------- |
| `CF_ACCESS_TEAM_DOMAIN` | Team domain Zero Trust (issuer JWKS). La API valida el JWT Access. |
| `CF_ACCESS_AUD` | Audience de la **aplicación Access de staging** (distinto de producción). |
| `CF_ACCESS_CLIENT_ID` | Client ID del **Access service token**. Lo lee `deploy.sh` en el host para el smoke (`CF-Access-Client-Id`). También el mismo tipo de credencial se usa en monitores Better Stack uptime. **No** es secreto de GitHub Actions; vive en `staging.env`. |
| `CF_ACCESS_CLIENT_SECRET` | Secret del service token (`CF-Access-Client-Secret`). Misma nota que el ID. |

### Métricas

| Variable | Para qué |
| -------- | -------- |
| `METRICS_BEARER_TOKEN` | Bearer obligatorio para `GET /metrics` (scrape Prometheus). |
| `METRICS_SCRAPE_BIND` | Bind host del publish opcional `api:3000` (default loopback; en prod → IP Tailscale). |
| `EXPORTER_BIND` | Bind de exporters (nunca `0.0.0.0` público). |
| `MONITORING_BIND` | Bind de Prometheus/Grafana (loopback o IP Tailscale). |
| `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` | Login Grafana. |
| `GRAFANA_ROOT_URL` | URL raíz Grafana. |
| `PRODUCTION_TAILSCALE_HOST` | Vacío hasta existir producción; scrape remoto desde staging. |
| `PRODUCTION_METRICS_BEARER_TOKEN` | Bearer de la API de producción (scrape desde staging). |

### Better Stack — dos credenciales distintas

| Variable / lugar | Para qué |
| ---------------- | -------- |
| `BETTERSTACK_SOURCE_TOKEN` | Token del **source de logs**. Lo usa **Vector** (`profile logs`) como Bearer hacia Better Stack. |
| `BETTERSTACK_INGESTING_HOST` | Host de ingesta del **mismo** source (UI Better Stack → Logs → Source), **sin** `https://`. Obligatorio si el panel muestra un host regional (`*.betterstackdata.com`); el genérico `in.logs.betterstack.com` suele devolver **401**. |
| Access service token (`CF_ACCESS_CLIENT_*` o el mismo token configurado en la UI de Better Stack) | **Uptime monitors** HTTP a `/api/health/live` y `/ready`. No va a Vector; van como headers Access. |

### Assistant

| Variable | Para qué |
| -------- | -------- |
| `ASSISTANT_ENABLED` | Kill switch. `false` hasta sync del corpus; `true` en operación. |
| `OPENAI_API_KEY` | Key OpenAI **solo staging**. |
| `OPENAI_CHAT_MODEL` | Modelo de chat del Assistant. |
| `OPENAI_VECTOR_STORE_ID` | Vector store **solo staging**. |
| `ASSISTANT_RETENTION_DAYS` | Retención para purge (default 90). |

### PostgreSQL / roles

| Variable | Para qué |
| -------- | -------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Superusuario bootstrap del contenedor `db`. |
| `POSTGRES_VOLUME_NAME` | Nombre del volumen de datos. |
| `ROLE_*_PASSWORD` | Passwords en claro para `bootstrap-db` (roles migration/runtime/backup/monitoring). |
| `DATABASE_URL` | URL runtime (Prisma app) — password **URL-encoded**. |
| `DATABASE_MIGRATION_URL` | URL migrate — password encoded. |
| `BACKUP_DATABASE_URL` | URL rol backup — password encoded. |
| `RESTORE_DATABASE_URL` | Solo drill restore; **≠** `DATABASE_URL`; DB `…_restore`. |

### Backups R2 + age

| Variable | Para qué |
| -------- | -------- |
| `R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Destino de backups cifrados staging. |
| `BACKUP_AGE_RECIPIENT` | Recipient **público** `age`; la private key solo en password manager. |

### Imágenes inmutables

| Variable | Para qué |
| -------- | -------- |
| `API_IMAGE` / `WEB_IMAGE` / `BACKUP_IMAGE` | Referencias `ghcr.io/…@sha256:…`. Las fija el operador tras `deploy.sh` (o CI) usando la evidencia. Sin ellas, Compose cae a `*:local` + build. |

---

## 11. Secrets de GitHub Actions (repo)

Usados por workflows actuales. **No** guardar el contenido de `staging.env` aquí.

| Secret | Workflow | Para qué |
| ------ | -------- | -------- |
| `STAGING_SSH_HOST` | `release.yml` → deploy-staging | IP/hostname **Tailscale** del host (`100.x` o MagicDNS). Nunca IP pública. |
| `STAGING_SSH_USER` | idem | Usuario SSH (`deploy`). |
| `STAGING_SSH_KEY` | idem | Clave privada cuyo pubkey está en `authorized_keys` de `deploy`. |
| `STAGING_SSH_KNOWN_HOSTS` | idem | Salida de `ssh-keyscan` del host (`StrictHostKeyChecking=yes`). |
| `TS_OAUTH_CLIENT_ID` | `release.yml` / `promote-production.yml` | OAuth client Tailscale para unir el **runner** al tailnet. |
| `TS_OAUTH_SECRET` | idem | Secret del OAuth client (rotar si se filtra). |
| `TS_TAGS` | idem | Tags del cliente, p. ej. `tag:ci` (debe coincidir con OAuth + ACLs). |
| `SONAR_TOKEN` | `ci.yml` | Análisis SonarCloud/SonarQube. Si está vacío, el paso Sonar se omite. |

Generar `STAGING_SSH_KNOWN_HOSTS` desde una máquina ya en el tailnet:

```bash
ssh-keyscan -t ed25519 100.x.x.x
```

**No son GitHub secrets** (viven en el host / password manager):

- PAT GHCR `read:packages` (solo `docker login` en la VM)
- Todo `/etc/solocamiones/staging.env` (incl. `CF_ACCESS_CLIENT_*`, R2, OpenAI, `BETTERSTACK_SOURCE_TOKEN`)

Publish GHCR en `release.yml` usa `GITHUB_TOKEN` del workflow (`packages: write`), no un PAT en secrets.

---

## 12. Evidencia del gate

Registrar en `docs/RELEASES/v2.0.0.md` § M6:

- Metadatos de la Azure VM + nota de costo
- Identidad del host Tailscale (sin secretos)
- Digests desplegados (+ evidencia `/tmp/solocamiones-deploy-evidence/`)
- Sample de object key de backup + resultado del restore
- Check negativo Access/WARP (resumen)
- Sync de Assistant + timer de purge activo

**Exit gate:** staging solo vía Access/WARP; digests privados; secretos aislados; backups/alertas; Assistant aislado; datos sintéticos mínimos presentes.
