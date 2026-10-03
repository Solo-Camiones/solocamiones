# Observabilidad VPS (M4)

Guía operativa del stack de métricas, logs y uptime. Secretos reales viven solo en `/etc/solocamiones/<env>.env` y el password manager.

## Componentes

| Pieza | Compose | Cuándo |
| ----- | ------- | ------ |
| `postgres-exporter` | siempre | Staging y producción |
| `node-exporter` | profile `host-metrics` | VPS Linux (monta `/proc`/`/sys`) |
| `prometheus` + `grafana` | profile `observability` | **Solo staging** |
| `vector` | profile `logs` | Staging y producción (Better Stack) |
| `GET /metrics` (API) | servicio `api` | Scrape interno con `METRICS_BEARER_TOKEN` |

## Arranque local (smoke, sin Better Stack real)

Prerrequisitos: stack M2/M3 ya usable (`infra/vps/.env.smoke`), roles DB bootstrapados.

```bash
# API + DB + postgres-exporter + Prometheus + Grafana
docker compose --env-file infra/vps/.env.smoke -f infra/vps/compose.yaml \
  --profile observability up -d db api postgres-exporter prometheus grafana

# Scrape API (Access/Host exempt; bearer required)
curl -sS -H "Authorization: Bearer smoke-metrics-token-change-me" http://127.0.0.1:3000/metrics | head

# Prometheus UI (solo loopback)
# http://127.0.0.1:9090
# Grafana UI (solo loopback) admin / valor de GRAFANA_ADMIN_PASSWORD
# http://127.0.0.1:3001
```

`node-exporter` requiere Linux:

```bash
docker compose --env-file infra/vps/.env.smoke -f infra/vps/compose.yaml \
  --profile host-metrics up -d node-exporter
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
- `BETTERSTACK_SOURCE_TOKEN` — source token de logs
- `ROLE_MONITORING_PASSWORD`

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
