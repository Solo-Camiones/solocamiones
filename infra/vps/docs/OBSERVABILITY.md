# Observabilidad VPS (M4)

Guía operativa del stack de métricas, logs y uptime. Secretos reales viven solo en `/etc/solocamiones/<env>.env` y el password manager.

## Componentes

| Pieza                    | Compose                 | Cuándo                                    |
| ------------------------ | ----------------------- | ----------------------------------------- |
| `postgres-exporter`      | siempre                 | Staging y producción                      |
| `node-exporter`          | profile `host-metrics`  | VPS Linux (monta `/proc`/`/sys`)          |
| `prometheus` + `grafana` | profile `observability` | **Solo staging**                          |
| `vector`                 | profile `logs`          | Staging y producción (Better Stack)       |
| `GET /metrics` (API)     | servicio `api`          | Scrape interno con `METRICS_BEARER_TOKEN` |

## Arranque en el host de staging

El smoke Compose en laptop (`.env.smoke` / certs de desarrollo) se retiró por decisión del operador: la verificación de observabilidad se hace en el VPS/VM de staging. Ver `STAGING_PROVISIONING.md`.

## Cómo ver Grafana y Prometheus (operador)

**No** se publican en Cloudflare ni en `staging.solocamiones.com`. Puertos en el host:

| Servicio | Puerto | Uso |
| -------- | ------ | --- |
| Grafana | **3001** | Dashboards / gráficos |
| Prometheus | **9090** | Targets, consultas PromQL, alertas |

El bind lo controla `MONITORING_BIND` en `/etc/solocamiones/staging.env`:

| `MONITORING_BIND` | Cómo acceder |
| ----------------- | ------------ |
| `127.0.0.1` (default / ensayo actual) | Solo en la VM. Desde el PC: **túnel SSH** (abajo). |
| IP Tailscale `100.x.x.x` | Desde el PC en el same tailnet: `http://100.x.x.x:3001` y `:9090`. Ajusta también `GRAFANA_ROOT_URL`. |

### Túnel SSH (cuando el bind es loopback)

En la **laptop** (dejar la sesión abierta):

```bash
ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 \
  deploy@100.x.x.x \
  -i ~/.ssh/<staging_key>
```

Luego en el navegador del PC:

- Grafana: http://127.0.0.1:3001 — user/password = `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`
- Prometheus: http://127.0.0.1:9090 — *Status → Targets* para scrapes `UP`

Comprobar bind en el host:

```bash
sudo grep -E '^(MONITORING_BIND|GRAFANA_)=' /etc/solocamiones/staging.env
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml ps prometheus grafana
# Esperado con loopback: 127.0.0.1:3001->3000/tcp y 127.0.0.1:9090->9090/tcp
```

## Staging VPS (perfil completo)

```bash
docker compose --env-file /etc/solocamiones/staging.env -f infra/vps/compose.yaml \
  --profile observability --profile host-metrics --profile logs up -d
```

Variables relevantes (además del contrato API):

- `METRICS_BEARER_TOKEN` — scrape local
- `PRODUCTION_METRICS_BEARER_TOKEN` — scrape de API productiva desde staging
- `PRODUCTION_TAILSCALE_HOST` — hostname/IP Tailscale del VPS de producción
- `EXPORTER_BIND` — en producción usar IP Tailscale (nunca `0.0.0.0` público)
- `METRICS_SCRAPE_BIND` — en producción IP Tailscale para publicar `api:3000` solo en la red privada
- `MONITORING_BIND` — default `127.0.0.1`; en staging puede ser IP Tailscale para Grafana/Prometheus
- `GRAFANA_ADMIN_PASSWORD`
- `BETTERSTACK_SOURCE_TOKEN` — **solo logs** (Vector → Better Stack Log Management)
- `BETTERSTACK_INGESTING_HOST` — host del mismo Logs source (sin `https://`); no uses solo `in.logs.betterstack.com` si la UI muestra un host regional
- `ROLE_MONITORING_PASSWORD`

### Better Stack: logs vs uptime (no confundir)

| Pieza | Credencial | Dónde |
| ----- | ---------- | ----- |
| **Logs** (ingesta) | `BETTERSTACK_SOURCE_TOKEN` + `BETTERSTACK_INGESTING_HOST` en `staging.env` | Contenedor `vector` (`profile logs`); ver `infra/vps/vector/vector.toml` |
| **Uptime** (monitores HTTP) | Access **service token** → headers `CF-Access-Client-Id` / `CF-Access-Client-Secret` | UI Better Stack → monitores a `/api/health/live` y `/ready`. El mismo tipo de token vive en `staging.env` como `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` para el smoke de `deploy.sh` |

Sin Access token, el uptime suele ver **401/403** aunque la app esté healthy (perímetro Access activo).

Vector con **401** y token “correcto” suele ser host genérico vs host regional: prueba  
`curl -X POST https://$INGESTING_HOST/ -H "Authorization: Bearer $SOURCE_TOKEN" …` → **202** confirma el par.

## Producción VPS (sin Prometheus/Grafana)

```bash
docker compose --env-file /etc/solocamiones/production.env -f infra/vps/compose.yaml \
  --profile host-metrics --profile logs up -d
```

Staging Prometheus scrapea exporters/API de producción vía Tailscale.

## Better Stack uptime (M4.3 decisión 2A)

No hay excepción HTTP en Express para health. Better Stack debe sondear:

`https://staging.solocamiones.com/api/health/live` y `/ready`

usando un **Cloudflare Access service token** (headers `CF-Access-Client-Id` / `CF-Access-Client-Secret` según la app Access). El JWT resultante se valida en la API como cualquier Access JWT.

Activación de monitores reales: M6.6.

## Backup → Prometheus

`backup-postgres.sh` escribe `/var/lib/node_exporter/textfile/solocamiones_backup.prom` (volumen `backup-metrics`). `node-exporter` lo expone; alertas en `prometheus/alerts.yml`.

## Seguridad

- `/metrics` **no** está en Nginx público.
- Access JWT no aplica a `GET /metrics`; el bearer es obligatorio en staging/production.
- Grafana/Prometheus/exporters solo en bind Tailscale/loopback.
- Logs: Vector redacta campos obvios; la app ya usa Pino redact.
