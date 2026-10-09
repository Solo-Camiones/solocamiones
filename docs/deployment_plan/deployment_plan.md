# Plan maestro de despliegue v2.0.0 — Solo Camiones

## 1. Propósito y estado

Este documento define la arquitectura aprobada y el orden de implementación para el primer despliegue real de Solo Camiones.

Es una especificación operativa: describe archivos, automatizaciones y recursos que deberán implementarse en tareas posteriores. No afirma que esos recursos ya existan.

Decisión del dueño (2026-09-30): se reemplaza la estrategia anterior basada en DigitalOcean App Platform y PostgreSQL administrado por dos VPS autogestionados en Hostinger. El dueño acepta expresamente la responsabilidad operativa de Linux, Docker, Nginx, PostgreSQL, backups, restauración, monitoreo y respuesta a incidentes.

## 2. Decisiones cerradas

- Release inicial de producción: `v2.0.0`.
- Proveedor: Hostinger VPS.
- Región preferida: New York si está disponible al contratar; Boston como segunda opción. Ambos VPS deben estar en la misma región.
- Staging: VPS Hostinger KVM 1, permanente.
- Producción: VPS Hostinger KVM 2, permanente.
- Sistema operativo: Ubuntu Server LTS soportado por Hostinger.
- Capacidad inicial esperada: hasta 10 usuarios, aproximadamente 5 simultáneos.
- Presupuesto objetivo de VPS: menos de US$30/mes; costos de renovación, impuestos, R2, Better Stack, dominio, GitHub y OpenAI se controlan por separado.
- Contenedores separados para Nginx, web React, API Express y PostgreSQL.
- Un solo Docker Compose versionado representa staging y producción; cada VPS inyecta configuración y secretos propios.
- PostgreSQL 16 corre dentro de cada VPS, con volumen y credenciales exclusivos por ambiente.
- Staging y producción nunca comparten base, volumen, secreto, bucket R2, credencial OpenAI, vector store ni token de métricas.
- Dominio productivo: `app.solocamiones.com`.
- Dominio de staging: `staging.solocamiones.com`.
- Cloudflare administra DNS, proxy, WAF, Access, WARP y TLS público.
- Nginx es el reverse proxy del origen y termina el TLS Cloudflare → VPS.
- El origen acepta HTTP/HTTPS únicamente desde rangos oficiales de Cloudflare.
- Cloudflare usa `Full (strict)`, Authenticated Origin Pulls y audiences Access distintos por ambiente.
- Express valida criptográficamente el JWT de Cloudflare Access.
- Administración por SSH exclusivamente mediante Tailscale; no depende de las IP públicas dinámicas del operador.
- GitHub Actions construye imágenes y las publica en GHCR.
- El repositorio y las imágenes pasarán a privados antes del go-live.
- `develop` despliega automáticamente a staging.
- Producción requiere aprobación manual en el primer release; automatización desatendida queda como evolución futura.
- Producción usa exactamente los mismos digests de imagen verificados en staging.
- Migraciones usan `prisma migrate deploy` como paso separado del arranque normal.
- Backups PostgreSQL cifrados se envían a Cloudflare R2 cada hora en ambos ambientes.
- Retención: horarios 48 horas, diarios 30 días y mensuales 12 meses.
- Snapshots Hostinger: semanales en ambos VPS; son una capa adicional, no sustituyen `pg_dump` externo.
- RPO: 1 hora.
- RTO: 1 hora, sujeto a restore drill exitoso.
- Better Stack recibe logs y monitorea disponibilidad externamente.
- Prometheus y Grafana corren en staging; conservan 30 días y monitorean ambos VPS mediante Tailscale.
- Alertas por email y aplicación móvil al único operador.
- Feature 17 AI Assistant está habilitada desde el primer día para `ADMINISTRATOR`, por decisión explícita del dueño después de su prueba funcional. La evaluación permanece como control de calidad continuo, no como gate de habilitación.
- Producción comienza con una base nueva, sin datos demo ni importación de facturas físicas anteriores. La importación histórica queda fuera del alcance actual.
- El primer Administrator se crea manualmente después del despliegue.
- Se aceptan algunos minutos de indisponibilidad durante despliegues nocturnos o de madrugada.
- Monitoreo intensivo posterior al go-live: 24 horas.

## 3. Arquitectura aprobada

```text
Usuarios autorizados
        |
Cloudflare Access + WARP
        |
Cloudflare DNS / Proxy / WAF
        |
Firewall Hostinger + UFW
  (80/443 solo Cloudflare)
        |
Nginx del ambiente
  TLS Full (strict) + Authenticated Origin Pulls
        |
        +-- /api/* --> API Express :3000
        |
        +-- /* ------> Web React/Nginx :8081
                          |
API Express --------------+
        |
PostgreSQL 16 interno :5432
```

Administración y monitoreo privado:

```text
Desktop/laptop del operador
        |
Tailscale
        |
        +-- SSH staging/producción
        +-- Grafana en staging
        +-- Prometheus/exporters
```

### 3.1 Aislamiento

Los dos ambientes viven en VPS distintos:

```text
VPS staging — KVM 1
  Nginx, web, API, PostgreSQL, Prometheus, Grafana y exporters

VPS production — KVM 2
  Nginx, web, API, PostgreSQL y exporters
```

Una caída de staging no debe afectar producción. Una caída total del VPS productivo interrumpe tanto la aplicación como su PostgreSQL; ese riesgo se acepta y se mitiga mediante backups externos horarios, snapshots semanales, imágenes reproducibles y restore drills.

## 4. Capacidad y presupuesto

Capacidad de referencia verificada al aprobar este plan:

| Ambiente   | Plan  | vCPU | RAM  | NVMe   | Uso adicional                         |
| ---------- | ----- | ---- | ---- | ------ | ------------------------------------- |
| Staging    | KVM 1 | 1    | 4 GB | 50 GB  | Prometheus + Grafana para ambos VPS   |
| Production | KVM 2 | 2    | 8 GB | 100 GB | Carga real y PostgreSQL de producción |

Los precios promocionales no son el presupuesto autoritativo. Antes de contratar se registra el precio total pagado, duración, renovación, impuestos y costo de servicios externos.

Staging debe reservar espacio para PostgreSQL, 30 días de métricas, Docker images y logs. Alertas de disco son obligatorias porque su volumen es menor.

## 5. Archivos y responsabilidades futuras

### 5.1 Archivos versionados

| Archivo futuro                                | Responsabilidad                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `infra/vps/compose.yaml`                      | Stack genérico de staging/producción, sin secretos ni valores exclusivos de un ambiente. |
| `infra/vps/nginx/nginx.conf`                  | Routing same-origin, headers seguros, límites y configuración compartida.                |
| `infra/vps/nginx/templates/app.conf.template` | Hosts del ambiente, TLS de origen, AOP y proxy a web/API.                                |
| `infra/vps/prometheus/prometheus.yml`         | Scrape por Tailscale y retención documentada, sin tokens reales.                         |
| `infra/vps/grafana/provisioning/*`            | Datasource y dashboards revisables, sin credenciales.                                    |
| `scripts/deployment/bootstrap-ubuntu.sh`      | Preparación idempotente y auditable de un VPS nuevo.                                     |
| `scripts/deployment/deploy.sh`                | Pull por digest, backup/verificación, migración y recreación controlada.                 |
| `scripts/deployment/backup-postgres.sh`       | Dump, validación, cifrado, checksum, manifiesto y upload R2.                             |
| `scripts/deployment/verify-restore.sh`        | Restauración segura en base nueva y validaciones.                                        |
| `scripts/deployment/smoke-staging.mjs`        | Smoke tests repetibles de staging.                                                       |
| `.github/workflows/ci.yml`                    | Gate de Pull Request.                                                                    |
| `.github/workflows/release.yml`               | Build, scan, SBOM, publicación GHCR y deploy de staging.                                 |
| `.github/workflows/promote-production.yml`    | Promoción manual del digest validado.                                                    |

Los nombres definitivos pueden ajustarse durante implementación si se preserva una sola responsabilidad por archivo y no se crean fuentes de verdad duplicadas.

### 5.2 Secretos fuera del repositorio

```text
/etc/solocamiones/staging.env
/etc/solocamiones/production.env
```

Cada archivo pertenece a `root`, usa permisos `0600` y nunca se copia a Git, imágenes, tickets, logs o artefactos. La copia recuperable de credenciales, MFA y recovery codes vive en un password manager aprobado y fuera del equipo principal.

### 5.3 Docker Compose

El Compose de VPS define, como mínimo:

- `edge`: Nginx productivo; único servicio que publica 80/443.
- `web`: React compilado servido por Nginx interno; sin puerto público.
- `api`: Express; sin puerto público.
- `db`: PostgreSQL 16; sin puerto público.
- `migrate`: servicio one-shot y profile operativo.
- `backup`: servicio one-shot y ejecución programada.
- `node-exporter`: métricas del host con acceso restringido.
- `postgres-exporter`: métricas PostgreSQL con usuario de mínimo privilegio.
- `prometheus` y `grafana`: únicamente activos en staging.
- `assistant-purge`: operación programada diaria o ejecución mediante timer del host usando la misma imagen de API.

Reglas:

- No usar `container_name`; Compose aísla recursos por project name.
- Imágenes por digest, no `latest`.
- Redes `edge`, `application`, `database` y `monitoring` con acceso mínimo.
- PostgreSQL pertenece solo a la red de base.
- Solo API y jobs autorizados acceden a PostgreSQL.
- Nginx accede a web/API, nunca a PostgreSQL.
- Health checks explícitos con `start_period`, timeout y retries.
- Límites de rotación de logs en todos los servicios persistentes.
- `migrate` y `backup` no usan restart automático.
- Volúmenes tienen nombres derivados del ambiente y nunca se comparten entre VPS.

### 5.4 Compose local

El `docker-compose.yml` raíz sigue representando desarrollo/test local. No contiene configuración productiva. Debe evolucionar para separar `db`, `db-test`, `migrate`, `api`, `web` y el tunnel opcional, pero no sustituye `infra/vps/compose.yaml`.

## 6. Imágenes y GHCR

Se publican al menos dos imágenes de aplicación por release:

```text
ghcr.io/<owner>/solocamiones-api@sha256:...
ghcr.io/<owner>/solocamiones-web@sha256:...
```

La imagen de API también puede ejecutar comandos one-shot de migración, bootstrap y purge si el comando está soportado, pero su `CMD` normal arranca exclusivamente la API.

Reglas:

- GitHub Actions es la única fuente de imágenes publicadas.
- No construir en los VPS.
- No hacer `git pull` como mecanismo de despliegue.
- No incluir `.env`, `.git`, tests, coverage ni secretos.
- Ejecutar como usuario no root cuando la imagen lo permita.
- Generar SBOM y escanear vulnerabilidades.
- Bloquear release ante vulnerabilidad `CRITICAL` o `HIGH` sin excepción revisada.
- Staging y producción usan los mismos digests.
- El frontend se construye una vez con:

```dotenv
VITE_USE_MOCK_API=false
VITE_CAPABILITIES_PRESET=release-2
VITE_ENABLE_DEMO_CONTROLS=false
```

Las variables `VITE_*` son públicas y nunca contienen secretos.

### 6.1 Autenticación privada de GHCR

Antes del go-live, repositorio y packages pasan a privados. Cada VPS usa una credencial distinta limitada a lectura de packages. El login queda asociado únicamente al usuario de deployment. Una filtración de staging debe poder revocarse sin afectar producción.

## 7. Ambientes y configuración

| Configuración     | Local            | Test                    | Staging                             | Production                          |
| ----------------- | ---------------- | ----------------------- | ----------------------------------- | ----------------------------------- |
| `NODE_ENV`        | `development`    | `test`                  | `production`                        | `production`                        |
| Datos             | Desarrollo/demo  | Fixtures desechables    | Sintéticos                          | Reales; base nueva                  |
| PostgreSQL        | Local/contenedor | DB exclusiva reseteable | PostgreSQL 16 en VPS staging        | PostgreSQL 16 en VPS production     |
| Dominio           | localhost        | Supertest               | `staging.solocamiones.com`          | `app.solocamiones.com`              |
| Cloudflare Access | Desactivado      | Dobles                  | Obligatorio                         | Obligatorio                         |
| WARP              | No               | No                      | Obligatorio para usuarios aprobados | Obligatorio para usuarios aprobados |
| Backups           | No operativos    | Dobles                  | R2 horario + snapshot semanal       | R2 horario + snapshot semanal       |
| IA                | Según `.env`     | Fakes                   | Habilitada                          | Habilitada                          |
| Logs              | Legibles         | `silent` salvo fallo    | JSON a Better Stack                 | JSON a Better Stack                 |

Staging no usa datos productivos. Producción no recibe seeds demo ni importación histórica.

## 8. Contrato de variables y secretos

La aplicación debe centralizar y validar su environment al arrancar. Local/test pueden cargar `.env`; staging/production solo consumen variables inyectadas por Compose desde archivos externos.

### 8.1 Runtime API

```text
APP_ENV
NODE_ENV
PORT
LOG_LEVEL
APP_RELEASE
DATABASE_URL
INITIAL_PASSWORD
EXCHANGE_RATE_API_KEY
TRUST_PROXY
ALLOWED_HOSTS
CF_ACCESS_TEAM_DOMAIN
CF_ACCESS_AUD
ASSISTANT_ENABLED
OPENAI_API_KEY
OPENAI_CHAT_MODEL
OPENAI_VECTOR_STORE_ID
ASSISTANT_* límites y retención
METRICS_BEARER_TOKEN
```

`APP_ENV` discrimina `development` | `test` | `staging` | `production` (decisión owner 2026-10-01). Staging y production usan `NODE_ENV=production` con `APP_ENV` distinto. En staging/production son obligatorios `APP_RELEASE` (patrón `vMAJOR.MINOR.PATCH`, p. ej. `v2.0.0`), `ALLOWED_HOSTS`, `TRUST_PROXY`, `CF_ACCESS_*` y `METRICS_BEARER_TOKEN`. `ASSISTANT_ENABLED=false` permanece válido como kill switch y no bloquea el arranque.

### 8.2 Jobs

```text
DATABASE_MIGRATION_URL
BACKUP_DATABASE_URL
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
BACKUP_AGE_RECIPIENT
```

Las URLs `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BACKUP_DATABASE_URL` y
`RESTORE_DATABASE_URL` deben percent-encodear caracteres especiales de la
contraseña (`#`, `?`, `/`, `@`, `:`, etc.). Prisma interpreta la cadena como URL;
sin encode falla con `P1013` (puerto inválido). Los `ROLE_*_PASSWORD` del
bootstrap no son URLs y no se encodean.

### 8.3 Separación obligatoria

- Staging y producción tienen keys OpenAI y vector stores distintos.
- Buckets `solocamiones-staging-backups` y `solocamiones-production-backups`.
- Cada bucket tiene credencial S3 exclusiva y limitada a ese bucket.
- Audiences Cloudflare Access diferentes.
- Tokens Prometheus diferentes.
- Passwords PostgreSQL diferentes.
- `INITIAL_PASSWORD` diferente por ambiente.

## 9. PostgreSQL autogestionado

### 9.1 Roles por ambiente

- `migration`: DDL y migraciones; solo jobs de deploy.
- `runtime`: DML mínimo de la API y lectura requerida de `_prisma_migrations`.
- `backup`: lectura para `pg_dump`.
- `monitoring`: vistas/métricas estrictamente necesarias para exporter.

Se verifican pruebas negativas: runtime no crea/elimina tablas; backup no modifica datos; monitoring no accede a datos de negocio innecesarios.

### 9.2 Seguridad y persistencia

- PostgreSQL no publica 5432.
- Administración manual mediante Tailscale y `docker exec`/túnel explícito.
- Volumen nombrado exclusivo del ambiente.
- Contraseñas generadas y guardadas en password manager.
- Pool acorde al máximo de conexiones y recursos de cada VPS.
- Alertas de disco, conexiones, reinicios y fallos de backup.
- Upgrades minor primero en staging.
- Upgrade major mediante procedimiento y restore verificable, nunca actualización improvisada del volumen.

## 10. Migraciones

### 10.1 Staging

1. Pull por digest.
2. Ejecutar `prisma migrate deploy` con rol `migration`.
3. Detener el deployment ante código distinto de cero.
4. Actualizar API/web.
5. Esperar readiness.
6. Ejecutar smoke tests.

### 10.2 Producción

1. Aprobación manual.
2. Confirmar backup horario reciente y procedimiento de rollback/forward fix.
3. Pull de los digests verificados.
4. Ejecutar `prisma migrate deploy` por GitHub Actions sobre SSH/Tailscale con rol `migration`.
5. Detenerse ante cualquier error.
6. Actualizar API/web.
7. Esperar readiness.
8. Ejecutar pruebas no destructivas.

Reglas:

- Nunca ejecutar migraciones desde el `CMD` normal.
- Nunca `prisma migrate reset` fuera de local/test.
- No editar migraciones ya aplicadas.
- Usar expand-migrate-contract para cambios incompatibles.
- Una reversión de imagen no revierte datos automáticamente.

## 11. Red y seguridad

### 11.1 Cloudflare

- DNS proxied para ambos dominios.
- TLS `Full (strict)`.
- Aplicaciones Access separadas y default-deny.
- WARP obligatorio para usuarios humanos autorizados.
- Token/inscripción individual por dispositivo.
- Audience distinto por ambiente.
- Service token exclusivo para Better Stack.
- WAF/rate limit para login.
- No cachear `/api/*`, login, PDFs ni respuestas autenticadas.
- HSTS solo después de verificar ambos ambientes.

### 11.2 Origen Nginx

- Certificado Cloudflare Origin válido para cada hostname.
- Authenticated Origin Pulls con certificado propio por zona/hostname cuando sea viable.
- Validación estricta de SNI/Host.
- Rechazo de host desconocido.
- Headers forwarding reemplazados, no concatenados desde el cliente.
- Límites de body y timeouts compatibles con API/PDF/SSE.
- Logs sin cookies, authorization headers ni query strings sensibles.

### 11.3 Firewall

- Hostinger firewall y UFW aplican defensa en profundidad.
- 80/443 solo desde rangos oficiales de Cloudflare.
- SSH solo por Tailscale.
- 5432, 3000, 8081, Grafana, Prometheus y exporters no son públicos.
- Automatización/revisión periódica actualiza rangos Cloudflare sin abrir temporalmente el origen al mundo.

### 11.4 Express

- Validar firma, issuer, expiración y audience del JWT Access.
- `ALLOWED_HOSTS` exacto por ambiente.
- `TRUST_PROXY` limitado al hop Nginx inmediato.
- Helmet, payload limits y rate limiting.
- Health checks mínimos pueden tener excepción controlada para Better Stack/service token.
- Autenticación Solo Camiones y roles permanecen separados de Cloudflare Access.

### 11.5 Administración

- Tailscale en desktop, laptop y ambos VPS.
- SSH por llave; passwords y root login deshabilitados.
- UFW no depende de IP pública dinámica del operador.
- Fail2ban como control complementario.
- Actualizaciones automáticas de seguridad del OS.
- Docker/imágenes se actualizan manualmente después de staging durante el primer release.

## 12. Backups y recuperación

### 12.1 Frecuencia y retención

Ambos ambientes:

- `hourly/`: 48 horas.
- `daily/`: 30 días.
- `monthly/`: 12 meses.
- Snapshot Hostinger: semanal.

R2 usa buckets y credenciales separados. Ningún backup permanece únicamente en el VPS origen.

### 12.2 Pipeline

1. `pg_dump --format=custom` con rol `backup`.
2. Verificar exit code y tamaño mayor que cero.
3. Cifrar con `age` antes de salir del VPS.
4. Calcular SHA-256 del archivo cifrado.
5. Crear manifiesto sin secretos con ambiente, UTC, versión PostgreSQL, release SHA, tamaño y checksum.
6. Upload a R2.
7. Verificar objeto remoto.
8. Limpiar temporales mediante `trap` incluso ante fallo.

La clave privada `age` permanece en password manager y copia offline; los jobs reciben solo el recipient público.

### 12.3 Alertas

- Backup horario fallido: crítica inmediata.
- Sin backup válido dentro de 75–90 minutos: crítica.
- Snapshot semanal faltante: warning/crítica según antigüedad.

### 12.4 Restore drill

Antes del go-live y cada tres meses:

1. Preparar VPS/base aislada.
2. Descargar backup R2.
3. Verificar checksum.
4. Descifrar controladamente.
5. Restaurar en base nueva, nunca sobre producción.
6. Aplicar diagnóstico y migraciones necesarias.
7. Validar usuarios, clientes, ventas, pagos, CxC, cancelaciones, history y Assistant.
8. Levantar aplicación con imágenes por digest.
9. Confirmar readiness y smoke tests de lectura.
10. Registrar tiempo y resultado.

Gate: menos de 60 minutos y cero errores de integridad. Si no se demuestra, el RTO no está cumplido y el go-live queda bloqueado.

## 13. Observabilidad

### 13.1 Better Stack

- Logs JSON centralizados de ambos ambientes.
- Uptime externo de liveness y readiness mediante Cloudflare service token.
- Alertas por email y aplicación móvil.
- Ningún prompt, respuesta, token, cookie, password, connection string o dato financiero innecesario en logs.

### 13.2 Prometheus y Grafana

- Prometheus/Grafana viven en staging.
- Scrape de producción viaja por Tailscale.
- Retención Prometheus: 30 días.
- Grafana solo accesible por Tailscale.
- Si staging cae, Better Stack mantiene detección externa.

Métricas mínimas:

- CPU, memoria, disco, load y reinicios.
- PostgreSQL: conexiones, tamaño, locks, transacciones y disponibilidad sin exponer datos comerciales.
- API: 5xx, latencia, rate limiting y readiness.
- Assistant: runs, errores, TTFT, latencia, tokens, cuotas, tools y sync failures.
- Backup: último éxito, duración y tamaño.

Alertas iniciales:

- Críticas: disco 85%, memoria sostenida 90%, 5xx sostenidos, DB no disponible, backup atrasado/fallido, migración/deploy fallido.
- Warning: disco 75%, memoria 80%, CPU 80% sostenida, latencia p95 > 1 s sostenida, conexiones DB 70%.
- Ajustar umbrales después de métricas reales; no escalar por un pico aislado.

## 14. Feature 17 AI Assistant

Decisión del dueño (2026-09-30): el asistente se habilita desde el primer día productivo para `ADMINISTRATOR`. La evaluación `AI-010` no bloquea el despliegue ni el flag; permanece como control periódico de calidad y seguridad.

Requisitos operativos:

- `ASSISTANT_ENABLED=true` en staging y producción.
- API keys y vector stores separados.
- Corpus sincronizado explícitamente en cada ambiente antes de abrir acceso.
- Purga diaria de conversaciones vencidas.
- Retención 90 días, con residual limitado por retención de backup.
- Kill switch documentado y probado.
- Readiness independiente de OpenAI.
- Alertas de 429, timeouts, errores, cuotas y sync.
- Desactivar inmediatamente ante exposición de datos, mutación comercial o respuestas peligrosas repetibles.
- Ejecutar evaluación y revisión humana después de cambios de modelo, prompt, corpus, tools o límites; el resultado no es un gate previo al primer enablement aprobado.

## 15. CI/CD y ramas

### 15.1 Flujo

```text
feature/* o fix/*
        |
Pull Request
        v
develop
        |
build + deploy automático
        v
staging
        |
Pull Request develop -> main
        |
build del SHA final + validación staging
        |
aprobación manual
        v
production
```

`develop` es una rama de integración cuya versión se despliega en staging; no es el ambiente mismo. Trabajo local vive en ramas cortas feature/fix.

### 15.2 CI de Pull Request

- Instalación desde lockfile.
- Prettier check.
- Lint.
- Typecheck API, web y tests.
- Unit, integration y component tests.
- PostgreSQL 16 limpio.
- Build de imágenes.
- `prisma validate` y migraciones sobre base vacía.
- `npm audit --audit-level=high`.
- Secret scan, container scan y SBOM.

### 15.3 Release a staging

Todo push aprobado a `develop`:

1. Construye API/web una vez.
2. Publica tags por SHA en GHCR.
3. Resuelve digests.
4. Une el runner a Tailscale (OAuth CI) y conecta al VPS staging por SSH privado (`STAGING_SSH_*` + known_hosts).
5. Ejecuta migración one-shot.
6. Actualiza servicios.
7. Espera health checks.
8. Ejecuta smoke tests.
9. Conserva evidencia del release.

Para candidato productivo, el SHA final de `main` se despliega primero en staging. Solo ese digest puede promoverse.

### 15.4 Producción

`promote-production.yml` requiere:

- versión `v2.0.0`;
- SHA;
- digests API/web;
- backup reciente;
- confirmación literal;
- aprobación manual de GitHub Environment.

No reconstruye imágenes. La automatización futura sin aprobación manual se documentará en `FUTURE_ROADMAP.md` y no se activa en el primer release.

## 16. Smoke tests de staging

Como mínimo:

- Origen directo bloqueado.
- Dispositivo sin Access/WARP bloqueado.
- Audience cruzado staging/production rechazado.
- Better Stack solo accede a health.
- Login, logout, sesión y cambio de password.
- Matriz negativa de Administrator/Seller/Mechanic.
- Clientes y `Cliente contado`.
- Catálogo de servicios.
- Cotizaciones, conduces y facturas.
- DOP/USD, ITBIS, redondeo, FAC/CON únicos.
- PDF y regeneración.
- Rentabilidad/FX.
- Pagos, CxC, cancelación y reembolso.
- Idempotencia y conflictos.
- Reinicio sin pérdida de sesiones/datos.
- Assistant documental, tool read-only, fuentes, cuota, purge y kill switch.
- Backup, descarga, checksum, descifrado y restore aislado.
- Rollback de imagen compatible sin revertir datos.

## 17. Go-live v2.0.0

### 17.1 Veinticuatro horas antes

- CI y staging en verde.
- Restore drill < 60 minutos.
- Backups horarios y snapshot verificados.
- DNS, Access, WARP, TLS, AOP y firewall verificados.
- Secrets y password manager recuperables.
- OpenAI corpus sincronizado y kill switch probado.
- Tag/SHA/digests coinciden.
- No hay cambios nuevos después del candidato.
- Ventana nocturna comunicada.

### 17.2 Durante la ventana

1. Mantener acceso humano cerrado.
2. Confirmar backup reciente.
3. Ejecutar workflow manual de promoción.
4. Observar migración y detenerse ante error.
5. Esperar liveness/readiness.
6. Confirmar SHA/digests en logs/config.
7. Crear primer Administrator interactivamente.
8. Cambiar su password inicial.
9. Confirmar base sin demo ni historia importada.
10. Sincronizar/verificar corpus Assistant y habilitarlo.
11. Ejecutar solo smoke tests productivos no destructivos.
12. Abrir Access a dispositivos aprobados.
13. Verificar Better Stack, Prometheus y alertas.

No crear facturas reales de prueba para borrarlas luego.

### 17.3 Observación

Durante 24 horas el operador permanece disponible y revisa errores, latencia, reinicios, CPU, memoria, disco, conexiones DB, backups, FX, sesiones, Access, Assistant y costos iniciales.

## 18. Rollback y recuperación

1. **Migración falla antes de actualizar servicios:** mantener versión anterior, inspeccionar `_prisma_migrations` y corregir con migración nueva.
2. **Código falla y esquema es compatible:** volver a digests anteriores.
3. **Código nuevo escribió datos incompatibles:** cerrar acceso/escrituras y aplicar forward fix; no rollback ciego.
4. **Corrupción o pérdida:** cerrar acceso, preservar logs, levantar entorno/base nueva, restaurar R2/snapshot, validar y cambiar el stack al volumen recuperado.
5. **Cloudflare falla:** no abrir IP directa como bypass; tratar como incidente de acceso.
6. **OpenAI falla:** mantener comercio operativo; usar kill switch si el error es sostenido o riesgoso.

Objetivos:

- detección < 10 minutos;
- decisión < 15 minutos;
- recuperación funcional total < 60 minutos.

## 19. Milestones de implementación

Esta secuencia convierte el plan operativo en bloques implementables. Una dependencia indica el trabajo que debe estar terminado antes de comenzar la tarea; no implica que todo el milestone anterior deba bloquear trabajo independiente. Cada milestone termina con un gate y evidencia conservada. Producción no se configura hasta que staging demuestre la misma ruta de despliegue, seguridad, backup y recuperación.

### M0 — Cerrar los gates funcionales previos a ambientes

**Objetivo:** asegurar que la infraestructura se construye para un alcance funcional estable y autorizado, no para un candidato que todavía cambia.

**Estado:** **Cerrado 2026-10-01.** Evidencia y alcance: `docs/RELEASES/v2.0.0.md`.

**Dependencias del milestone:** ninguna; es el punto de entrada obligatorio.

| Paso | Tarea y qué cumple                                                                                                                                                                                            | Dependencias                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| M0.1 | Completar el Paso 10 de `docs/pre_production_business_changes/IMPLEMENTATION_PLAN.md`; demuestra migraciones sobre una copia realista, regresión, concurrencia y suites completas antes de separar ambientes. | Ninguna. **Hecho 2026-10-01.**                                        |
| M0.2 | Obtener el `Verificado` formal de Feature 16 conduces; convierte el walkthrough ya aprobado en autorización explícita para el primer release productivo.                                                      | Ninguna; puede ejecutarse en paralelo con M0.1. **Hecho 2026-10-01.** |
| M0.3 | Registrar el alcance exacto de `v2.0.0`, sus exclusiones y los flujos habilitados; evita desplegar por accidente inventario, Work Orders o CxP que continúan fuera del release.                               | M0.1 y M0.2. **Hecho:** `docs/RELEASES/v2.0.0.md`.                    |
| M0.4 | Levantar una línea base del repositorio y de los checks actuales; identifica qué piezas ya existen, cuáles deben endurecerse y qué evidencia debe conservar cada milestone.                                   | M0.3. **Hecho:** §5 de `docs/RELEASES/v2.0.0.md`.                     |

**Gate de salida:** Paso 10 cerrado, conduces formalmente verificados, alcance `v2.0.0` aprobado y cero cambio funcional pendiente que invalide la configuración de ambientes. **Cumplido 2026-10-01.** Siguiente: M1 (también **cerrado 2026-10-01**).

### M1 — Contrato de runtime y frontera HTTP segura

**Objetivo:** hacer que la API falle de forma segura ante configuración inválida y que solo acepte tráfico del ambiente y de Cloudflare Access previstos.

**Estado:** **Cerrado 2026-10-01.** Evidencia: §6 de `docs/RELEASES/v2.0.0.md`.

**Dependencias del milestone:** M0.

| Paso | Tarea y qué cumple                                                                                                                                                                         | Dependencias                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1.1 | Centralizar y validar el contrato de environment, incluidas validaciones cruzadas por ambiente; impide iniciar con secretos, URLs, hosts o flags incompletos/inseguros.                    | M0.4. **Hecho 2026-10-01:** `apps/api/src/infrastructure/config/runtime-config.ts` (`APP_ENV`, validaciones cruzadas).                                                                                                                                                                                        |
| M1.2 | Limitar la carga de `.env` a local/test y consumir solo variables inyectadas en staging/producción; evita fallbacks silenciosos y archivos locales en servidores.                          | M1.1. **Hecho 2026-10-01:** `load-env.ts` no carga dotenv en staging/production ni con `NODE_ENV=production`.                                                                                                                                                                                                 |
| M1.3 | Implementar `ALLOWED_HOSTS` y `TRUST_PROXY` exactos; bloquea Host spoofing y evita confiar en una cadena de proxies no declarada.                                                          | M1.1. **Hecho 2026-10-01:** middleware Host + trust proxy de un hop; obligatorio en staging/production.                                                                                                                                                                                                       |
| M1.4 | Validar firma, issuer, expiración y audience del JWT de Cloudflare Access; garantiza que alcanzar el origen no omita el control perimetral.                                                | M1.1. **Hecho 2026-10-01:** `cloudflare-access.ts` con `jose` (JWKS); aplica también a health.                                                                                                                                                                                                                |
| M1.5 | Integrar Helmet, límites de payload, rate limiting y cookies seguras respetando la autenticación/roles propios; completa el hardening HTTP sin mezclar Access con autorización de negocio. | M1.3 y M1.4. **Hecho 2026-10-01:** Helmet, body limit, rate limits y cookies existentes cableados al perímetro Access. **Complemento:** rate limit por IP de intentos fallidos de JWT Access (60 / 15 min, `skipSuccessfulRequests`) delante del middleware perimetral; `/metrics` sigue con su techo propio. |
| M1.6 | Confirmar liveness/readiness mínimos, logging JSON con `APP_RELEASE` y redacción de datos sensibles; permite operar y diagnosticar sin filtrar secretos o datos financieros.               | M1.1 y M1.5. **Hecho 2026-10-01:** live/ready confirmados; Pino con `release` y redact ampliado.                                                                                                                                                                                                              |
| M1.7 | Añadir pruebas unitarias e integración de environment, hosts, JWT, proxy, health y cookies; demuestra los rechazos y excepciones controladas antes de empaquetar.                          | M1.2–M1.6. **Hecho 2026-10-01:** suites unitarias de contrato, dotenv, hosts, JWT, edge security y trust proxy.                                                                                                                                                                                               |

**Gate de salida:** la API arranca solo con configuración válida, rechaza host/JWT/proxy incorrectos y las pruebas negativas de la frontera HTTP están verdes. **Cumplido 2026-10-01.** Siguiente: M2.

### M2 — Imágenes, Compose y proxy reproducibles

**Objetivo:** producir un stack versionado que pueda levantarse igual en hosts limpios, con responsabilidades y redes separadas.

**Estado:** **Cerrado 2026-10-02.** Evidencia: §7 de `docs/RELEASES/v2.0.0.md`. Alcance Compose VPS: camino crítico (edge/web/api/db/migrate); backup/exporters/observability en M3/M4 (decisión owner 1B).

**Dependencias del milestone:** M1.

| Paso | Tarea y qué cumple                                                                                                                                                                                                | Dependencias                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| M2.1 | Retirar `prisma migrate deploy` del `CMD` de la API y exponer la migración como comando one-shot; evita que cada arranque o réplica modifique el esquema.                                                         | M1.1. **Hecho 2026-10-02.**             |
| M2.2 | Endurecer las imágenes API/web y `.dockerignore`; crea artefactos mínimos, no-root, sin tests, coverage, `.git`, `.env` ni secretos.                                                                              | M2.1. **Hecho 2026-10-02.**             |
| M2.3 | Evolucionar el Compose local para separar `db`, `db-test`, `migrate`, `api`, `web` y tunnel opcional; mantiene desarrollo/test reproducible sin convertirlo en configuración productiva.                          | M2.1 y M2.2. **Hecho 2026-10-02.**      |
| M2.4 | Crear `infra/vps/compose.yaml` con servicios, redes, volúmenes, health checks, rotación de logs y profiles del camino crítico; materializa el stack común sin secretos. Backup/observability se amplían en M3/M4. | M2.2. **Hecho 2026-10-02.**             |
| M2.5 | Crear la configuración Nginx del origen con same-origin, TLS, AOP, hosts estrictos, headers reemplazados y límites para API/PDF/SSE; expone solo el edge y mantiene API, web y DB privadas.                       | M1.3–M1.6 y M2.4. **Hecho 2026-10-02.** |
| M2.6 | Probar build, arranque, migración one-shot, health checks y aislamiento de redes desde un host limpio; demuestra que Compose es reproducible y que ningún servicio interno publica puertos.                       | M2.3–M2.5. **Hecho 2026-10-02.**        |

**Gate de salida:** las imágenes se construyen limpiamente, el `CMD` de API no migra, Compose VPS levanta por project name y solo Nginx publica 80/443. **Cumplido 2026-10-02.** Siguiente: M3.

### M3 — Persistencia, backup, restore y jobs operativos

**Objetivo:** proteger los datos antes de desplegar usuarios reales y demostrar que pueden recuperarse dentro del RTO.

**Estado:** **Implementado en repositorio 2026-10-02** (ensayo R2/restore con secretos reales: operador, §8 de `docs/RELEASES/v2.0.0.md`). Decisiones owner: systemd (1A), Compose backup image (2A), R2 staging real (3A), snapshots checklist (4A), retención en script (5A), purge un batch (6A), bootstrap one-shot (7).

**Dependencias del milestone:** M2.4; puede avanzar en paralelo con M4 y M5 donde no comparta archivos.

| Paso | Tarea y qué cumple                                                                                                                                                                           | Dependencias                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M3.1 | Definir bootstrap de PostgreSQL para roles `migration`, `runtime`, `backup` y `monitoring`, con pruebas negativas; aplica mínimo privilegio y separa DDL, DML, lectura de backup y métricas. | M2.4. **Hecho 2026-10-02.**                                                                              |
| M3.2 | Implementar `backup-postgres.sh` con `pg_dump`, validación, cifrado `age`, checksum, manifiesto, upload R2 y limpieza segura; cumple el backup externo cifrado y auditable.                  | M3.1. **Hecho 2026-10-02.**                                                                              |
| M3.3 | Implementar `verify-restore.sh` sobre una base nueva y con rechazo explícito de destinos productivos; demuestra recuperación sin sobrescribir el origen.                                     | M3.2. **Hecho 2026-10-02.**                                                                              |
| M3.4 | Configurar scheduler, retención `hourly/daily/monthly` y verificación de snapshots; convierte los scripts en una protección continua y medible.                                              | M3.2 y M3.3. **Hecho 2026-10-02** (timers versionados; checklist snapshots; ejecución Hostinger en M6+). |
| M3.5 | Adaptar `assistant-purge` a un job diario con la imagen API y sin afectar readiness; hace cumplir la retención de 90 días del Assistant.                                                     | M2.4. **Hecho 2026-10-02.**                                                                              |
| M3.6 | Ensayar backup, checksum, descifrado, restore y purge con datos no productivos; valida códigos de salida, limpieza y evidencia antes de depender de los jobs.                                | M3.3–M3.5. **Procedimiento en RELEASES §8.1; ejecución con secretos R2 del operador.**                   |

**Gate de salida:** roles y pruebas negativas aprobados, backup cifrado recuperable en una base aislada y jobs programables con fallos observables.

### M4 — Observabilidad y respuesta operativa

**Objetivo:** detectar fallos dentro de los objetivos definidos y dar al operador información suficiente para actuar sin exponer datos sensibles.

**Estado:** **Implementado en repositorio 2026-10-02** (activación Better Stack/VPS real: M6.6; evidencia §9 de `docs/RELEASES/v2.0.0.md`). Decisiones owner: scrape `/metrics` exento de Access+Host con bearer (1A); uptime Better Stack vía Access service token sin excepción Express (2A); métricas HTTP Prometheus (3A); backup textfile+node_exporter (4A); Vector sidecar (5A); gate repo+smoke local (6A); exporters ambos envs / Prometheus+Grafana solo staging (7).

**Dependencias del milestone:** M1.6, M2.4 y contrato de resultados de M3.2; puede implementarse en paralelo con el resto de M3 y M5.

| Paso | Tarea y qué cumple                                                                                                                                                 | Dependencias                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| M4.1 | Exponer/proteger las métricas de API y Assistant con token por ambiente; permite medir 5xx, latencia, cuotas, tools y sync sin un endpoint público abierto.        | M1.6. **Hecho 2026-10-02.**                                                                                        |
| M4.2 | Versionar Prometheus, Grafana, `node-exporter` y `postgres-exporter` con retención de 30 días; centraliza salud de hosts, contenedores y PostgreSQL desde staging. | M2.4, M3.1 y M4.1. **Hecho 2026-10-02.**                                                                           |
| M4.3 | Configurar logs JSON y uptime de Better Stack mediante service token; mantiene detección externa incluso si staging y su Prometheus fallan.                        | M1.6 y M2.5. **Hecho 2026-10-02** (Vector + procedimiento uptime; cuenta/monitores en M6).                         |
| M4.4 | Implementar alertas de recursos, DB, API, Assistant, backup y deploy con los umbrales iniciales del plan; convierte métricas en avisos accionables al operador.    | M3.2, M4.2 y M4.3. **Hecho 2026-10-02.**                                                                           |
| M4.5 | Documentar y probar rutas de triage, kill switch del Assistant y escalamiento/rollback; enlaza cada alerta con una respuesta segura.                               | M4.4. **Hecho 2026-10-02** (runbooks + procedimiento de simulación; ensayo con cuenta Better Stack = operador/M6). |

**Gate de salida:** una falla simulada de health, backup y Assistant genera alerta sin revelar secretos, y el operador puede seguir el runbook correspondiente. **Código/docs listos 2026-10-02;** simulación local según `infra/vps/docs/PLATFORM_RUNBOOK.md`; cableado VPS/Better Stack en M6.6.

### M5 — CI, cadena de suministro y workflows de release

**Objetivo:** convertir un commit aprobado en imágenes identificables, verificadas y promovibles sin reconstruirlas.

**Estado:** **Implementado en repositorio 2026-10-05** (publish GHCR al empujar `develop`; SSH/Tailscale y Environment `production` reales: M6+/operador). Evidencia: §10 de `docs/RELEASES/v2.0.0.md`. Decisiones owner: Trivy+Gitleaks (1A), smoke mínimo (2A), gate sin VPS (3A), scaffold SSH (4C), confirmación `promote-production` (5), imagen backup en GHCR (6B), backup age+key (7C), allowlist (8B).

**Dependencias del milestone:** M1, M2 y las interfaces de scripts de M3; puede implementarse en paralelo con M4.

| Paso | Tarea y qué cumple                                                                                                                                                                             | Dependencias                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| M5.1 | Consolidar `build.yml` en `ci.yml` sin perder coverage/Sonar y añadir format, lint, types, suites, build y migración sobre PostgreSQL 16 limpio; establece un único gate de Pull Request.      | M1.7, M2.2 y M2.3. **Hecho 2026-10-05.**                         |
| M5.2 | Añadir `npm audit`, secret scan, container scan y SBOM con bloqueo `HIGH`/`CRITICAL`; controla dependencias, secretos y vulnerabilidades antes de publicar.                                    | M5.1. **Hecho 2026-10-05.**                                      |
| M5.3 | Crear `release.yml` para construir una vez API/web, publicar tags por SHA y registrar digests en GHCR; garantiza artefactos inmutables y trazables.                                            | M2.2 y M5.2. **Hecho 2026-10-05** (incluye imagen backup).       |
| M5.4 | Automatizar deploy de `develop` a staging: pull por digest, migración one-shot, actualización, readiness, smoke y evidencia; hace repetible la ruta normal de integración.                     | M2.4–M2.6, M3.1 y M5.3. **Scaffold 2026-10-05**; SSH real en M6. |
| M5.5 | Crear `promote-production.yml` manual con versión, SHA, digests, backup reciente, confirmación literal y GitHub Environment; impide reconstruir o promover un artefacto distinto del validado. | M3.2, M5.3 y M5.4. **Hecho 2026-10-05.**                         |
| M5.6 | Fijar permisos mínimos, acciones por SHA, timeouts, concurrency y artefactos de diagnóstico; evita ejecuciones simultáneas y reduce la superficie de CI/CD.                                    | M5.1–M5.5. **Hecho 2026-10-05.**                                 |

**Gate de salida:** un commit de prueba supera CI, publica ambas imágenes con SBOM/digest y los workflows validan entradas sin acceso de secretos desde Pull Requests. **Código/workflows listos 2026-10-05;** primera publicación GHCR al merge/push a `develop`.

### M6 — Provisionar y desplegar staging

**Objetivo:** crear el primer ambiente real y usarlo para probar toda la ruta antes de tocar producción.

**Estado:** **En curso en host Azure (2026-10-06).** Repo + bootstrap + Tailscale + sync + `staging.env` + PostgreSQL/roles listos. Bloqueado en cambio de nameservers DNS → Cloudflare antes de Origin/Access/edge. Detalle: `docs/RELEASES/v2.0.0.md` §11 y `infra/vps/docs/STAGING_PROVISIONING.md` (Progreso). Hostinger KVM 1 sigue siendo el camino canónico post-ensayo.

**Dependencias del milestone:** M3, M4 y M5; además requiere cuentas operativas, MFA y medios de pago/recovery disponibles.

| Paso | Tarea y qué cumple                                                                                                                                                                  | Dependencias                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| M6.1 | Confirmar disponibilidad regional y contratar KVM 1 en New York o, si no está disponible, Boston; fija región y costo real antes de exigir que producción quede en la misma región. | M5 gate y decisión regional ya definida en la sección 2. |
| M6.2 | Ejecutar el bootstrap idempotente de Ubuntu, Docker, Tailscale, UFW, Fail2ban, usuario de deployment y SSH por llave; crea un host administrable solo por la red privada aprobada.  | M6.1.                                                    |
| M6.3 | Configurar DNS proxied, Access/WARP, audience de staging, TLS `Full (strict)`, Origin Certificate, AOP y allowlist Cloudflare; cierra el acceso público directo al origen.          | M2.5 y M6.2.                                             |
| M6.4 | Crear `/etc/solocamiones/staging.env`, roles/DB, bucket y credencial R2, token de métricas, key OpenAI y vector store exclusivos; materializa la separación de secretos y datos.    | M3.1 y M6.2.                                             |
| M6.5 | Configurar credencial GHCR read-only exclusiva de staging y desplegar Compose por digest; demuestra pull privado y arranque sin build ni `git pull` en el VPS.                      | M5.3, M6.2 y M6.4.                                       |
| M6.6 | Activar backups horarios, snapshot semanal, exporters, Prometheus/Grafana y Better Stack; hace observable y recuperable el ambiente desde su primer uso.                            | M3.4, M4 gate y M6.5.                                    |
| M6.7 | Sincronizar el corpus de staging, habilitar Assistant y programar purge; valida que IA usa credenciales, vector store y retención propios del ambiente.                             | M3.5, M6.4 y M6.5.                                       |

**Gate de salida:** staging es accesible solo por Access/WARP, ejecuta imágenes privadas por digest, tiene datos sintéticos, backups/alertas activos y Assistant aislado.

### M7 — Validar staging y aprobar el candidato operativo

**Objetivo:** demostrar con evidencia que seguridad, negocio, despliegue, rollback y recuperación funcionan juntos.

**Dependencias del milestone:** M6.

| Paso | Tarea y qué cumple                                                                                                                                                                           | Dependencias |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| M7.1 | Desplegar un SHA candidato desde `develop` mediante el workflow completo; valida migración, readiness y conservación de evidencia sin pasos manuales ocultos.                                | M6 gate.     |
| M7.2 | Ejecutar pruebas negativas de origen, WARP/Access, audience cruzado, hosts, puertos, roles y Better Stack; demuestra que no existe bypass de red o autorización.                             | M7.1.        |
| M7.3 | Ejecutar los smoke tests comerciales de la sección 16 con datos sintéticos; confirma que facturación, conduces, pagos, CxC, PDFs, cancelación y rentabilidad sobreviven al empaquetado real. | M7.1.        |
| M7.4 | Probar Assistant documental/live, fuentes, cuotas, purge, sync y kill switch; confirma su operación segura sin convertir AI-010 en gate previo.                                              | M6.7 y M7.1. |
| M7.5 | Ejecutar backup, descarga, checksum, descifrado y restore aislado; mide por primera vez la ruta de recuperación y corrige cualquier paso no reproducible.                                    | M6.6 y M7.1. |
| M7.6 | Ensayar rollback de imagen compatible, reinicio del stack y persistencia de sesiones/datos; demuestra recuperación operativa sin revertir datos a ciegas.                                    | M7.1 y M7.5. |
| M7.7 | Registrar resultados, riesgos residuales y aprobación para provisionar producción; impide avanzar con fallos conocidos o evidencia incompleta.                                               | M7.2–M7.6.   |

**Gate de salida:** smoke y pruebas negativas verdes, restore reproducible, rollback ensayado y autorización explícita para crear producción.

### M8 — Provisionar producción y demostrar recuperación

**Objetivo:** preparar el ambiente productivo aislado sin abrirlo todavía a usuarios.

**Dependencias del milestone:** M7 completo; no se admite configurar producción antes de este gate.

| Paso | Tarea y qué cumple                                                                                                                                                                                                    | Dependencias                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| M8.1 | Contratar KVM 2 en la misma región registrada para staging y documentar costo/renovación; cumple capacidad y aislamiento físico por VPS.                                                                              | M7.7.                                         |
| M8.2 | Ejecutar el mismo bootstrap validado, con credenciales y dispositivo Tailscale propios; evita configuración artesanal divergente entre ambientes.                                                                     | M8.1 y evidencia de M6.2.                     |
| M8.3 | Crear DB/roles, `/etc/solocamiones/production.env`, bucket R2, tokens, key OpenAI, vector store y GHCR read-only exclusivos; impide referencias cruzadas con staging.                                                 | M8.2 y procedimientos validados en M6.4–M6.5. |
| M8.4 | Configurar `app.solocamiones.com`, Access, WARP, TLS, AOP, allowlist y firewall manteniendo cerrado el acceso humano; asegura el perímetro antes de cargar la aplicación.                                             | M8.2.                                         |
| M8.5 | Desplegar temporalmente el stack por digest, sin seeds ni importación histórica, y activar backups, snapshots, exporters y Better Stack; verifica la base operativa productiva sin generar negocio real.              | M8.3 y M8.4.                                  |
| M8.6 | Ejecutar el restore drill completo en una base/entorno aislado y registrar tiempo e integridad; demuestra el RTO menor de 60 minutos antes del go-live.                                                               | M8.5.                                         |
| M8.7 | Verificar recuperación del password manager, MFA, recovery codes, llaves `age`, rollback/forward fix y contacto del operador; evita que la respuesta a incidentes dependa del equipo principal o de memoria informal. | M8.3–M8.6.                                    |

**Gate de salida:** producción permanece cerrada, separada de staging, con backup/snapshot/alertas activos y restore drill menor de 60 minutos sin errores de integridad.

### M9 — Construir, validar y promover `v2.0.0`

**Objetivo:** promover exactamente el candidato verificado y abrirlo de forma controlada.

**Dependencias del milestone:** M8 y ventana de go-live aprobada.

| Paso | Tarea y qué cumple                                                                                                                                                                                                      | Dependencias                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| M9.1 | Congelar cambios, revisar/mergear `develop -> main` y registrar SHA/tag `v2.0.0`; fija la identidad del candidato que se permitirá promover.                                                                            | M8 gate.                         |
| M9.2 | Construir el SHA final una sola vez, publicar API/web y resolver digests; crea los artefactos definitivos sin reutilizar tags mutables.                                                                                 | M9.1 y M5.3.                     |
| M9.3 | Desplegar esos digests finales primero en staging y repetir smoke, seguridad y verificaciones operativas; demuestra que el artefacto exacto de `main` es el aprobado.                                                   | M9.2 y procedimientos M7.2–M7.6. |
| M9.4 | Ejecutar el checklist de 24 horas antes: backups, snapshot, DNS, Access/WARP, TLS/AOP, secrets, corpus, kill switch y coincidencia tag/SHA/digests; autoriza la ventana solo si todos los prerequisitos siguen válidos. | M9.3.                            |
| M9.5 | Ejecutar `promote-production.yml` con aprobación manual, migración one-shot y los mismos digests; realiza el go-live sin reconstruir ni omitir el gate humano.                                                          | M9.4.                            |
| M9.6 | Crear el primer Administrator interactivamente y cambiar su password inicial; establece acceso de negocio sin seeds ni credenciales permanentes predefinidas.                                                           | M9.5 y readiness verde.          |
| M9.7 | Sincronizar/verificar el corpus productivo, habilitar Assistant y confirmar purge/kill switch; activa la capacidad aprobada con recursos exclusivos de producción.                                                      | M9.5 y M8.3.                     |
| M9.8 | Ejecutar smoke productivo no destructivo, verificar monitoreo y abrir Access solo a dispositivos aprobados; confirma salud antes de permitir trabajo real sin crear facturas de prueba para borrarlas.                  | M9.6 y M9.7.                     |

**Gate de salida:** `v2.0.0` sirve desde los digests registrados, Administrator y Assistant están operativos, las validaciones no destructivas pasan y el acceso humano queda limitado a dispositivos aprobados.

### M10 — Observar, estabilizar y cerrar el release

**Objetivo:** comprobar el comportamiento real durante las primeras 24 horas y dejar evidencia suficiente para operación y releases posteriores.

**Dependencias del milestone:** M9.

| Paso  | Tarea y qué cumple                                                                                                                                                                    | Dependencias                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| M10.1 | Monitorear durante 24 horas errores, latencia, reinicios, CPU, memoria, disco, DB, FX, sesiones, Access, Assistant y costos; detecta degradaciones que los smoke tests no reproducen. | M9.8.                                        |
| M10.2 | Verificar que backups horarios, snapshot, manifiestos y alertas continúan funcionando con el release activo; confirma que la protección de datos sobrevivió al go-live.               | M10.1 en curso y M8.5.                       |
| M10.3 | Aplicar el runbook ante incidentes y registrar toda mitigación, rollback o forward fix; preserva trazabilidad y evita correcciones improvisadas.                                      | Solo si M10.1 o M10.2 detectan un incidente. |
| M10.4 | Registrar resultados, SHA/tag/digests, restore drill, evidencia de smoke, riesgos residuales y costos reales; crea el expediente auditable del release.                               | M10.1–M10.3.                                 |
| M10.5 | Cerrar `v2.0.0` solo si se cumplen todos los criterios de la sección 20; convierte la observación satisfactoria en aceptación formal.                                                 | M10.4.                                       |

**Gate de salida:** 24 horas satisfactorias, sin incidente crítico abierto, backups y alertas confirmados, evidencia archivada y criterios finales aceptados.

### 19.1 Camino crítico y paralelismo permitido

```text
M0 -> M1 -> M2 -> M3 -----+
                 \-> M4 --+-> M6 -> M7 -> M8 -> M9 -> M10
                 \-> M5 --+
```

- M3, M4 y M5 pueden avanzar parcialmente en paralelo después de M2, pero M6 requiere los tres gates completos.
- La contratación/configuración de producción (M8) está bloqueada por la validación completa de staging (M7).
- La promoción (M9) usa los mismos digests verificados; nunca reconstruye en producción.
- Un gate fallido devuelve el trabajo al milestone responsable. No se compensa relajando seguridad, tests, backup o aislamiento.

## 20. Criterios finales de aceptación

El despliegue está terminado solo cuando:

- VPS separados y región documentada.
- KVM 1/KVM 2 y costos reales registrados.
- CI verde desde instalación limpia.
- Imágenes privadas promovidas por digest.
- Compose VPS reproducible desde host limpio.
- PostgreSQL sin puerto público y roles con pruebas negativas.
- Nginx, Full strict, AOP, allowlist Cloudflare y JWT Access probados.
- SSH únicamente por Tailscale.
- Staging/production con secrets, buckets, DB y vector stores separados.
- Migraciones fuera del `CMD`.
- Backups R2 horarios y snapshots semanales activos.
- Restore drill < 60 minutos.
- Better Stack y Grafana/Prometheus alertan al operador.
- Assistant habilitado con corpus, purge, métricas y kill switch operativos.
- Producción sin datos demo/importados y Administrator inicial operativo.
- Tag `v2.0.0`, SHA y digests registrados.
- Smoke tests staging y validaciones no destructivas producción completos.
- Observación de 24 horas satisfactoria.

## 21. Fuera de alcance actual

- Importar facturas físicas anteriores o saldos de apertura.
- Kubernetes, Swarm, Nomad, service mesh o microservicios.
- Alta disponibilidad multi-VPS de PostgreSQL.
- Failover automático entre regiones.
- Despliegue productivo totalmente automático sin aprobación.
- Base administrada externa.
- Acceso directo público al origen o bypass temporal de Cloudflare.
- Restaurar directamente sobre una base productiva dañada.
