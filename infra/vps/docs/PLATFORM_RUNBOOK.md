# Runbook de plataforma — Solo Camiones (M4.5)

Respuesta operativa a alertas de Prometheus/Better Stack. Zona: `America/Santo_Domingo`.

**Principio:** no pegar secretos, connection strings, tokens, cookies ni dumps en tickets. Usar `APP_RELEASE`, digests, `errorId`, host Tailscale y códigos de salida.

Enlace Assistant (kill switch, 429, sync): `docs/assistant-ops/RUNBOOK.md`.

---

## Chequeos previos

1. Confirmar ambiente (staging vs production).
2. Abrir Grafana/Prometheus solo por Tailscale (o loopback en smoke).
3. Verificar Better Stack uptime (si el origen responde vía Access service token).
4. No abrir el origen a Internet ni desactivar Cloudflare Access como “bypass”.

---

## Disco

**Alertas:** `HostDiskWarning` (75%), `HostDiskCritical` (85%).

1. `df -h` en el VPS por Tailscale/SSH.
2. Revisar volúmenes Docker (`docker system df`), logs JSON rotados, Prometheus TSDB (solo staging).
3. Limpiar imágenes huérfanas **solo** tras confirmar digests en uso.
4. Si PostgreSQL crece sin control: investigar tablas grandes sin borrar datos productivos improvisadamente.

---

## Memoria / CPU

**Alertas:** `HostMemory*`, `HostCpuWarning`.

1. `docker stats` y load average.
2. Correlacionar con picos de API/Assistant (Grafana overview).
3. No reiniciar PostgreSQL como primer paso.
4. Si es fuga tras un deploy: considerar rollback de imagen compatible (ver abajo).

---

## Base de datos

**Alertas:** `PostgresDown`, `PostgresConnectionsWarning`.

1. `docker compose … ps db` y logs del contenedor.
2. Comprobar que 5432 no está publicado al mundo.
3. Conexiones: identificar sesiones idle vía `docker exec` + `psql` con rol adecuado (no pegar passwords en chat).
4. Si corrupción/pérdida: **no** restaurar sobre el volumen vivo; usar `verify-restore` / drill aislado (`deployment_plan` §12.4 / §18).

---

## API health

**Alertas:** `ApiDown`, Better Stack liveness/readiness.

1. Confirmar contenedor `api` healthy (TCP) y logs JSON recientes (sin secretos).
2. Desde un cliente con Access/WARP: `/api/health/live` y `/ready`.
3. Better Stack debe usar service token Cloudflare; un 401 en el monitor suele ser Access mal configurado, no caída de app.
4. Readiness depende de DB/migraciones, **no** de OpenAI.

---

## API 5xx

**Alerta:** `ApiHttp5xxCritical`.

1. Filtrar logs por `statusCode>=500` / `errorId`.
2. Separar errores de negocio esperados vs fallos de infraestructura.
3. Si coincide con un deploy: preparar rollback o forward fix (no revertir datos a ciegas).

---

## API latencia

**Alerta:** `ApiLatencyP95Warning`.

1. Ver paneles HTTP p95 y ruta (`route_group`).
2. Correlacionar FX, PDF, Assistant SSE.
3. Ajustar umbrales solo con baseline real (plan §13.2).

---

## Backup

**Alertas:** `BackupFailed`, `BackupTooOld`, `BackupNeverSucceeded`.

1. Journal del timer: `systemctl status solocamiones-backup.service`.
2. Re-ejecutar one-shot:  
   `docker compose --env-file … -f infra/vps/compose.yaml --profile operations run --rm backup`
3. Confirmar textfile `solocamiones_backup.prom` vía `node-exporter` / Prometheus.
4. Fallo de backup = crítica; no ignorar. RPO objetivo: 1 hora.

---

## Deploy / rollback

**Alerta:** `DeployOrRuntimeApiAbsent` (placeholder hasta M5 webhooks).

1. Si migración falló **antes** de actualizar servicios: mantener imagen anterior; inspeccionar `_prisma_migrations`; forward-fix con migración nueva (`deployment_plan` §18.1).
2. Si código falla y esquema es compatible: volver a digests anteriores verificados en staging.
3. Si el código nuevo escribió datos incompatibles: cerrar Access humano/escrituras; forward fix; no rollback ciego de datos.
4. Confirmación de digests: variables `API_IMAGE` / `WEB_IMAGE` y logs de deploy.

---

## Assistant kill switch (resumen)

1. En el env del ambiente: `ASSISTANT_ENABLED=false`.
2. Recrear solo el servicio `api` de forma controlada.
3. Comercio (ventas/CxC/health) debe seguir OK.
4. Detalle: `docs/assistant-ops/RUNBOOK.md` → Kill switch.

---

## Simulación del gate M4 (sin VPS real)

Procedimiento de evidencia en repo/smoke (activación Better Stack real = M6.6):

1. Levantar `--profile observability` y confirmar `up{job="api"}==1` en Prometheus.
2. **Health:** detener `api` → alerta `ApiDown` / target down; restaurar.
3. **Backup:** escribir a mano un textfile con `solocamiones_backup_last_status 0` en el volumen `backup-metrics` (o fallar un backup de prueba) → regla `BackupFailed`.
4. **Assistant:** generar errores de prueba en entorno no productivo o incrementar métricas vía tráfico controlado; confirmar series `assistant_*` y regla de errores.
5. Seguir este runbook + `docs/assistant-ops/RUNBOOK.md` sin exponer secretos.
6. Registrar fecha/SHA en `docs/RELEASES/v2.0.0.md` §9.
