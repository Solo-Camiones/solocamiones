# Plan maestro de despliegue v1.1.0 — Solo Camiones

## 1. Resumen y decisiones cerradas

Este documento reemplaza la estrategia anterior basada en VPS y define el plan ejecutable para preparar y desplegar el primer release real de Solo Camiones.

Arquitectura aprobada:

```text
Usuarios autorizados
        |
Cloudflare Zero Trust + WARP
        |
app.DOMAIN / staging.DOMAIN
        |
DigitalOcean App Platform
  React SPA + Express API
        |
DigitalOcean Managed PostgreSQL
        |
Backups automáticos + PITR
        |
pg_dump cifrado diario
        |
Cloudflare R2
```

Decisiones:

- Release: `v1.1.0`.
- Alcance: Release 2 más pagos, CxC y cancelación ya adelantados.
- Hosting: DigitalOcean App Platform, no Droplet/VPS.
- Región: New York `NYC3`.
- Producción: 24/7, hasta 10 usuarios.
- Staging: efímero y creado bajo demanda.
- PostgreSQL 16 administrado, separado por ambiente.
- Presupuesto objetivo: US$50–100/mes.
- Producción y staging protegidos por Cloudflare Zero Trust y WARP.
- Dispositivos inscritos manualmente mediante tokens individuales revocables.
- Base productiva nueva, sin importar datos locales ni cuentas demo.
- RPO: 1 hora. RTO: 1 hora.
- Backups externos: diarios por 30 días y mensuales por 12 meses en R2.
- Operador único, alertas por email y aplicación móvil.
- Dominio pendiente: usar `DOMAIN`, `app.DOMAIN` y `staging.DOMAIN` hasta sustituirlo.
- Monitoreo: DigitalOcean + Better Stack.
- Go-live fuera del horario laboral.

Estimación inicial:

- App productiva de 1 GB: US$10–12/mes.
- Managed PostgreSQL productivo: desde US$15/mes.
- Staging activo: aproximadamente US$12 adicionales.
- Jobs, R2, Better Stack y transferencia: variables según uso.
- Bloquear la contratación si la estimación total supera US$100/mes sin nueva aprobación.

Referencia: [precios de App Platform](https://docs.digitalocean.com/products/app-platform/details/pricing/) y [precios de Managed PostgreSQL](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/).

## 2. Preparación de aplicación e infraestructura

### Fase 0 — Auditoría obligatoria

- Confirmar que `main` contiene exclusivamente el candidato que será desplegado.
- Registrar SHA, migraciones Prisma, versión Node 22, npm 11.19.1 y PostgreSQL 16.
- Resolver el fallo local de escritura sobre `apps/api/dist` y ejecutar un build limpio.
- Obtener acceso funcional a Docker y construir la imagen productiva localmente.
- Revisar los nueve warnings actuales de ESLint; ninguno puede convertirse en error.
- Ejecutar búsqueda de secretos, `npm audit --audit-level=high` y escaneo de imagen.
- Revisar todas las migraciones sobre una base vacía y confirmar que el código anterior no será necesario después de aplicarlas.
- No continuar con riesgos `CRITICAL` o `HIGH` sin resolver.

### Fase 1 — Empaquetado productivo

- Crear una imagen multi-stage única que compile API y React.
- Servir los assets de React desde Express y mantener `/api/*` para la API.
- Implementar fallback de SPA únicamente para rutas no API.
- Ejecutar como usuario no root y escuchar en `0.0.0.0:$PORT`.
- Actualizar `docker-compose.yml` como stack exclusivo de desarrollo/integración local, con migraciones en un servicio one-shot y Cloudflare Quick Tunnel bajo un profile opcional.
- Mantener Nginx y los Dockerfiles actuales exclusivamente para desarrollo local; staging y producción se describen únicamente mediante App Specs de DigitalOcean.
- Eliminar `prisma migrate deploy` del `CMD`; las migraciones se ejecutarán mediante un deployment job.
- Fijar durante el build:
  - `VITE_USE_MOCK_API=false`
  - `VITE_CAPABILITIES_PRESET=release-2`
  - `VITE_ENABLE_DEMO_CONTROLS=false`
- Publicar la imagen privada en GHCR con tag `sha-<commit>` y conservar su digest. Staging y producción usarán exactamente ese digest.

### Fase 2 — Configuración y contratos

Variables de runtime de la aplicación:

- `NODE_ENV=production`
- `PORT`
- `LOG_LEVEL`
- `DATABASE_URL`
- `INITIAL_PASSWORD`
- `EXCHANGE_RATE_API_KEY`
- `APP_RELEASE`
- `ALLOWED_HOSTS`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- configuración explícita de proxy confiable.

Variables exclusivas de jobs:

- `DATABASE_MIGRATION_URL`
- `BACKUP_DATABASE_URL`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- clave pública de cifrado del backup.

Cambios de seguridad:

- Añadir middleware global que valide firma, issuer, expiración y audience del JWT de Cloudflare Access mediante una biblioteca mantenida como `jose`.
- Rechazar peticiones sin JWT válido incluso cuando lleguen por el dominio `ondigitalocean.app`.
- Excluir únicamente `/api/health/live` y `/api/health/ready`, cuyas respuestas seguirán siendo genéricas.
- Conservar autenticación, roles y cookie `sid` propios de Solo Camiones.
- Mantener cookies `HttpOnly`, `Secure` y `SameSite=Lax`.
- No confiar en `X-Forwarded-For` o `CF-Connecting-IP` hasta validar la cadena de proxy y el token de Access.
- Aplicar allowlist de hosts, límites de payload, Helmet y rate limiting.
- No habilitar CORS: SPA y API permanecerán en el mismo origen.

### Fase 3 — DigitalOcean

Crear dos App Platform apps independientes:

- `solocamiones-production`
- `solocamiones-staging`

Producción:

- Región `NYC3`.
- Instancia compartida de 1 GB.
- Managed PostgreSQL 16 de un nodo.
- Conexión privada por VPC.
- Base accesible únicamente desde la app y los jobs autorizados.
- Health check de readiness en `/api/health/ready`.
- Liveness en `/api/health/live`.
- Alertas de deployment, dominio, CPU, memoria, reinicios y health checks.

Staging:

- Instancia de 512 MB.
- Base de desarrollo PostgreSQL separada.
- Datos sintéticos exclusivamente.
- Se crea desde un App Spec versionado, se valida y se destruye después de la promoción.
- Nunca utiliza secrets, URLs ni backups de producción.

Definir tres roles PostgreSQL:

- `migration`: permisos DDL, usado solo por el deployment job.
- `runtime`: mínimo DML requerido por Prisma y lectura de `_prisma_migrations`.
- `backup`: permisos de lectura para `pg_dump`.

El deployment job `PRE_DEPLOY` ejecutará `prisma migrate deploy`. Si falla, el servicio nuevo no recibe tráfico. Los jobs de DigitalOcean pueden ejecutarse antes o después del despliegue: [deployment jobs](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/).

## 3. Archivos, configuración por ambiente y estándares

Esta sección define los cambios que deberán implementarse en una tarea posterior. No se deben crear archivos alternativos con la misma responsabilidad ni almacenar configuración productiva fuera de las ubicaciones aquí indicadas.

### Principios generales de configuración

- Aplicar [The Twelve-Factor App](https://12factor.net/config): el código y la configuración versionable se separan de credenciales y valores propios de cada ambiente.
- Construir una sola imagen de aplicación inmutable por SHA. No recompilar esa imagen al promover de staging a producción. Los backups usan una imagen operativa separada, mínima y ligada al mismo SHA.
- Mantener paridad funcional entre staging y producción; solo cambian recursos, datos, dominios, credenciales y nivel de capacidad.
- Validar toda variable al iniciar y fallar de forma segura si falta una configuración obligatoria.
- No usar valores productivos por defecto, fallback silencioso, `latest`, credenciales compartidas ni secretos en argumentos de build.
- Versionar ejemplos, esquemas declarativos y nombres de variables; almacenar valores secretos únicamente en GitHub, DigitalOcean o Cloudflare según su consumidor.
- Mantener configuración local compatible con el flujo existente. Los archivos de Docker Compose y Nginx locales no representan producción.
- Evitar archivos `.env.staging` o `.env.production` versionados. `.env` continúa ignorado por Git.

### Matriz de archivos de aplicación y empaquetado

| Archivo                                                 | Acción futura | Responsabilidad y estándar                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile.production`                                 | Crear         | Imagen OCI multi-stage única para API y SPA. Fijar Node/npm, usar `npm ci`, copiar solo artefactos necesarios, ejecutar como usuario no root, no contener secretos y arrancar únicamente Express. Las imágenes base se fijarán por versión y digest revisable.                                           |
| `Dockerfile.backup`                                     | Crear         | Imagen operativa separada con cliente PostgreSQL 16, `age`, cliente S3 compatible y scripts de backup/restore. Ejecutar como usuario no root, sin servidor web ni dependencias de la aplicación que no sean necesarias.                                                                                  |
| `.dockerignore`                                         | Crear         | Excluir `.git`, `.env*`, `node_modules`, `dist`, coverage, logs, documentación no requerida y artefactos locales para reducir contexto, tiempo y riesgo de filtrar secretos. Mantener `.env.example` solo si el build realmente lo necesita.                                                             |
| `docker-compose.yml`                                    | Modificar     | Definir únicamente el entorno local: PostgreSQL de desarrollo, PostgreSQL de test separado, migración one-shot, API, web y túnel opcional. No contener configuración ni secretos de staging/producción. Aplicar health checks, dependencias por estado, redes explícitas y puertos enlazados a loopback. |
| `apps/api/Dockerfile`                                   | Modificar     | Conservar la imagen local de API, pero retirar `prisma migrate deploy` del `CMD`. El contenedor debe ejecutar una sola responsabilidad; Compose invocará la misma imagen como servicio de migración antes de iniciar la API.                                                                             |
| `apps/web/Dockerfile`                                   | Revisar       | Mantener el build local de React/Nginx, fijar imágenes base revisables y conservar validación de build args. No se publicará como imagen productiva independiente.                                                                                                                                       |
| `apps/web/nginx.conf`                                   | Revisar       | Conservar same-origin y reemplazo seguro de headers para Compose local. No añadir reglas específicas de DigitalOcean ni usarlo como reverse proxy productivo.                                                                                                                                            |
| `apps/api/src/app.ts`                                   | Modificar     | Montar seguridad y host allowlist antes de rutas privadas; conservar health checks mínimos; servir `apps/web/dist` con `express.static`; aplicar fallback de SPA solo para `GET/HEAD` no pertenecientes a `/api`. No incorporar reglas de negocio.                                                       |
| `apps/api/src/index.ts`                                 | Modificar     | Consumir configuración ya validada, escuchar explícitamente en `0.0.0.0:$PORT`, registrar `APP_RELEASE` y conservar graceful shutdown con timeout acotado. No ejecutar migraciones ni bootstrap al arrancar.                                                                                             |
| `apps/api/src/infrastructure/config/env.ts`             | Crear         | Definir con Zod el contrato tipado de variables, normalización y validaciones cruzadas por ambiente. Exportar una configuración inmutable en lugar de leer `process.env` de forma dispersa.                                                                                                              |
| `apps/api/src/infrastructure/config/load-env.ts`        | Modificar     | Cargar archivos locales solo fuera de producción. En staging/production confiar exclusivamente en variables inyectadas por la plataforma y no buscar `.env` en rutas alternativas.                                                                                                                       |
| `apps/api/src/infrastructure/http/cloudflare-access.ts` | Crear         | Middleware de infraestructura que valide JWT de Access mediante JWKS, algoritmo permitido, firma, issuer, audience y tiempo. Denegar por defecto y no convertir identidad de Cloudflare en autorización de negocio.                                                                                      |
| `apps/api/src/infrastructure/http/allowed-hosts.ts`     | Crear         | Validar `Host`/`X-Forwarded-Host` conforme a proxies confiables. Permitir únicamente el dominio del ambiente; health checks internos tendrán una excepción mínima y comprobable.                                                                                                                         |
| `apps/api/src/infrastructure/http/index.ts`             | Modificar     | Exportar los nuevos middlewares sin crear dependencias circulares ni mezclar configuración con HTTP.                                                                                                                                                                                                     |
| `apps/api/src/infrastructure/logging/logger.ts`         | Modificar     | Incluir `APP_RELEASE` y mantener redacción de cookies, tokens, URLs, secretos y datos financieros. Producción usa JSON estructurado; formato legible se limita a desarrollo.                                                                                                                             |
| `apps/api/package.json`                                 | Modificar     | Añadir `jose` para validación estándar de JWT/JWKS y scripts separados de `start`, `migrate:deploy` y validación de configuración. No añadir otra librería si `jose` cubre la necesidad.                                                                                                                 |
| `package.json` y `package-lock.json`                    | Modificar     | Exponer comandos reproducibles de build productivo, validación y smoke tests; el lockfile cambia únicamente mediante npm 11.19.1.                                                                                                                                                                        |
| `.env.example`                                          | Modificar     | Convertirlo en catálogo documentado de variables locales, sin credenciales reales, espacios ambiguos ni URLs con contraseñas plausibles. Clasificar cada variable como build-time, runtime o job-only.                                                                                                   |

El resultado de `docker-compose.yml` deberá seguir estas reglas:

- `db` usa PostgreSQL 16 fijado por versión/digest, volumen nombrado y health check; su puerto se publica solo en `127.0.0.1:${DATABASE_PORT}`.
- `db-test` usa PostgreSQL 16, credenciales/base/volumen diferentes y el profile `test`; solo las pruebas pueden resetearlo y nunca comparte datos con `db`.
- `migrate` es un servicio one-shot construido desde `apps/api/Dockerfile`, ejecuta `prisma migrate deploy` y termina con código distinto de cero ante cualquier error.
- `api` espera `service_completed_successfully` de `migrate` y `service_healthy` de `db`; no publica el puerto 3000 al host.
- `web` espera readiness de `api` y publica el puerto local únicamente en `127.0.0.1:${WEB_PORT}`.
- `cloudflared` se mueve al profile `tunnel`, usa una versión fijada en lugar de `latest` y nunca arranca con `docker compose up` salvo que se solicite el profile explícitamente.
- Definir redes `frontend` y `backend`: PostgreSQL pertenece solo a `backend`; web y tunnel no tienen acceso directo a la base.
- Usar interpolación obligatoria `${VARIABLE:?message}` para credenciales y valores críticos; no definir contraseñas de fallback.
- Mantener health checks con intervalos, timeouts, retries y `start_period` explícitos.
- Añadir límites razonables de logging y políticas `restart` solo a servicios de larga duración; `migrate` no debe reiniciarse automáticamente.
- Validar con `docker compose config` y probar desde un volumen vacío antes de considerar listo el stack.

No se crearán `docker-compose.staging.yml` ni `docker-compose.prod.yml`. DigitalOcean App Specs son la única fuente de verdad para esos ambientes; duplicarlos en Compose permitiría divergencias de red, recursos, secretos y jobs.

### Matriz de archivos de infraestructura y automatización

| Archivo                                    | Acción futura | Responsabilidad y estándar                                                                                                                                                                      |
| ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/digitalocean/app.production.yaml`   | Crear         | App Spec declarativo de producción: región, tamaño, imagen por digest, health checks, jobs, alertas y referencias a secretos. No incluir valores sensibles ni IDs copiados de staging.          |
| `infra/digitalocean/app.staging.yaml`      | Crear         | App Spec independiente y de menor tamaño. Debe poder crear y destruir staging de manera repetible con PostgreSQL y secrets propios.                                                             |
| `scripts/deployment/backup-postgres.sh`    | Crear         | Ejecutar `pg_dump`, cifrado, checksum y upload a R2 con `set -euo pipefail`, archivos temporales seguros, limpieza mediante trap y códigos de salida no ambiguos. Nunca imprimir URLs o claves. |
| `scripts/deployment/verify-restore.sh`     | Crear         | Restaurar en una base aislada, ejecutar migraciones/diagnósticos y producir un resultado auditable. Debe rechazar explícitamente una URL que coincida con producción.                           |
| `scripts/deployment/smoke-staging.mjs`     | Crear         | Smoke tests HTTP idempotentes o con datos sintéticos identificables. Aceptar URL y credenciales por entorno, nunca codificarlas.                                                                |
| `.github/workflows/ci.yml`                 | Modificar     | Convertir el workflow de Release 1 en el gate general: permisos mínimos, acciones fijadas por SHA, timeouts, concurrency y todos los checks del plan.                                           |
| `.github/workflows/build.yml`              | Retirar       | Eliminarlo solo después de integrar en `ci.yml` cobertura y SonarQube, evitando checks duplicados o contradictorios.                                                                            |
| `.github/workflows/release.yml`            | Crear         | Tras merge a `main`, construir, escanear y publicar las imágenes `app-sha-*` y `backup-sha-*` en GHCR; desplegar el digest de aplicación en staging y ejecutar smoke tests.                     |
| `.github/workflows/promote-production.yml` | Crear         | `workflow_dispatch` manual que valida versión, tag, SHA y digest antes de actualizar producción. No vuelve a construir la imagen.                                                               |

Estándares para App Specs y workflows:

- Revisar los App Specs mediante Pull Request igual que el código.
- Usar nombres estables de recursos y referencias de variables proporcionadas por DigitalOcean.
- Mantener staging y producción en archivos separados para impedir referencias cruzadas accidentales.
- Validar los specs con `doctl apps spec validate` antes de aplicarlos.
- Usar imágenes por digest `sha256:*`; los tags son metadatos y no la fuente de identidad del artefacto.
- Fijar GitHub Actions de terceros por commit SHA y declarar `permissions` por job.
- Los workflows de Pull Request no tendrán acceso a secrets de despliegue.
- Configurar `concurrency` para impedir dos promociones o migraciones simultáneas del mismo ambiente.
- Aplicar timeouts y conservar logs/artefactos suficientes para diagnóstico sin publicar secretos.
- El token de DigitalOcean tendrá únicamente permisos de App Platform requeridos; las credenciales de R2 pertenecerán solo al job de backup.

### Matriz de pruebas que acompañará la configuración

| Archivo                                                       | Cobertura requerida                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/tests/unit/infrastructure/env.test.ts`              | Variables obligatorias, defaults seguros solo en local/test, rechazo de URLs locales en producción y validaciones cruzadas.       |
| `apps/api/tests/unit/http/cloudflare-access.test.ts`          | JWT válido, firma inválida, issuer/audience incorrectos, expiración, ausencia de token, rotación de JWKS y errores del proveedor. |
| `apps/api/tests/unit/http/allowed-hosts.test.ts`              | Host permitido, dominio técnico, encabezados falsificados, puertos locales y excepción limitada de health checks.                 |
| `apps/api/tests/integration/http/production-boundary.test.ts` | Orden real de middlewares, acceso a SPA/API, bypass directo bloqueado, health público mínimo y cookies seguras.                   |
| `apps/api/tests/integration/health/routes.test.ts`            | Readiness con PostgreSQL/migraciones y respuesta sin detalles internos.                                                           |
| `apps/web/tests/unit/shared/config/capabilities.test.ts`      | Build HTTP con Release 2 más la funcionalidad financiera adelantada y controles demo desactivados.                                |

Las pruebas verificarán comportamiento observable; no se debilitarán aserciones existentes para acomodar la infraestructura. Los tests de JWT usarán claves efímeras locales y no dependerán de Cloudflare real.

### Matriz de ambientes

| Configuración               | Local                                      | Test                                          | Staging                            | Production                             |
| --------------------------- | ------------------------------------------ | --------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `NODE_ENV`                  | `development`                              | `test`                                        | `production`                       | `production`                           |
| PostgreSQL                  | Contenedor/local reiniciable               | PostgreSQL 16 desechable por ejecución        | Base separada con datos sintéticos | Managed PostgreSQL 16 con datos reales |
| `VITE_USE_MOCK_API`         | `false` por defecto; mock solo explícito   | Definido por suite                            | `false`                            | `false`                                |
| `VITE_CAPABILITIES_PRESET`  | `release-2` para HTTP                      | Definido por prueba                           | `release-2`                        | `release-2`                            |
| `VITE_ENABLE_DEMO_CONTROLS` | Opcional en desarrollo                     | Según prueba                                  | `false`                            | `false`                                |
| Cloudflare Access           | Desactivado                                | Middleware inyectado/bypass explícito de test | Obligatorio                        | Obligatorio                            |
| Allowed hosts               | `localhost`, `127.0.0.1` y puertos locales | Host de Supertest                             | `staging.DOMAIN`                   | `app.DOMAIN`                           |
| Base URL API                | Same-origin local mediante Vite/nginx      | Supertest                                     | Same-origin HTTPS                  | Same-origin HTTPS                      |
| Logs                        | Legibles, nivel `debug/info`               | `silent` salvo fallo                          | JSON `info`                        | JSON `info`, ajustable temporalmente   |
| Datos                       | Desarrollo                                 | Fixtures desechables                          | Sintéticos y eliminables           | Reales; sin seeds demo                 |
| Backups                     | No operativos                              | Prueba del script con dobles                  | Opcional para ensayo               | PITR + R2 obligatorio                  |

Staging y producción usarán el mismo digest y los mismos valores Vite compilados. Sus diferencias serán exclusivamente runtime o recursos externos.

### Propiedad y ubicación de secretos

| Secreto                                   | Ubicación                               | Consumidor                                                       |
| ----------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `DIGITALOCEAN_ACCESS_TOKEN`               | GitHub Actions secrets                  | Workflows de staging/promoción con permisos mínimos              |
| Credencial de lectura de GHCR             | DigitalOcean encrypted secret           | App Platform para descargar la imagen privada                    |
| `DATABASE_URL`                            | DigitalOcean encrypted runtime variable | Servicio Express con rol `runtime`                               |
| `DATABASE_MIGRATION_URL`                  | DigitalOcean encrypted job variable     | Job `PRE_DEPLOY` con rol `migration`                             |
| `BACKUP_DATABASE_URL`                     | DigitalOcean encrypted job variable     | Job de backup con rol `backup`                                   |
| `INITIAL_PASSWORD`                        | DigitalOcean encrypted runtime variable | Creación administrativa de usuarios; valor distinto por ambiente |
| `EXCHANGE_RATE_API_KEY`                   | DigitalOcean encrypted runtime variable | Adaptador server-side de ExchangeRate-API                        |
| `CF_ACCESS_TEAM_DOMAIN` y `CF_ACCESS_AUD` | DigitalOcean runtime variables          | Validación de Access; audience diferente por ambiente            |
| Credenciales R2 y clave de cifrado        | DigitalOcean encrypted job variables    | Job de backup exclusivamente                                     |
| Service token de Better Stack             | Better Stack secret headers             | Monitor externo; separado de tokens de dispositivos              |

Reglas obligatorias:

- Nunca reutilizar credenciales entre local, test, staging y producción.
- No exponer secretos como `VITE_*`, build args, outputs de Actions, logs o artefactos.
- Rotar inmediatamente cualquier valor mostrado accidentalmente y registrar el incidente.
- Mantener recovery codes fuera del equipo principal y verificar su acceso antes del go-live.
- Documentar fecha, propietario, alcance y próxima revisión de cada credencial sin registrar su valor.

### Estándares de base de datos, migraciones y backups

- Aplicar least privilege con roles separados para runtime, migraciones y backup.
- Exigir TLS y private networking; no habilitar el endpoint público salvo una operación temporal aprobada y auditada.
- Ejecutar migraciones una sola vez mediante `PRE_DEPLOY`, nunca desde `CMD`, réplicas o health checks.
- Validar cada release en una base limpia y en una copia representativa de staging.
- Usar estrategia expand-migrate-contract para cambios incompatibles y posponer `DROP` destructivos a otro release.
- No modificar migraciones ya aplicadas ni usar `prisma migrate reset` fuera de local/test.
- Limitar el pool conforme al máximo de conexiones del plan y reservar conexiones para jobs/operación.
- Cifrar backups antes de salir del job, calcular SHA-256 y verificar tamaño mayor que cero.
- Conservar manifiesto con timestamp UTC, versión PostgreSQL, release SHA, checksum y ruta del objeto, sin URLs ni credenciales.
- Hacer restores siempre en una base nueva y destruirla únicamente después de conservar el resultado de validación.

## 4. Cloudflare, backups y observabilidad

### Cloudflare Zero Trust

- Crear cuenta con el correo personal aprobado, MFA y recovery codes guardados offline.
- Migrar el DNS de `DOMAIN` a Cloudflare.
- Crear `app.DOMAIN` y `staging.DOMAIN` apuntando a DigitalOcean y activar proxy.
- Configurar TLS estricto y verificar certificados antes de habilitar HSTS.
- Crear aplicaciones Access independientes para staging y producción.
- Aplicar política default-deny y requerir WARP.
- Entregar un token de inscripción distinto por dispositivo; nunca compartir un token entre equipos.
- Documentar propietario, dispositivo, fecha y revocación de cada token.
- Crear un service token independiente para Better Stack.
- Validar criptográficamente el JWT en la aplicación porque no se usará Cloudflare Tunnel: [validación de Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).
- Proteger login con WAF/rate limiting sin cachear `/api/*`, login, PDFs ni respuestas autenticadas.

### Backups y recuperación

- Habilitar backups automáticos y PITR antes de crear usuarios o facturas. DigitalOcean conserva backups diarios por siete días y permite restaurar a un clúster nuevo: [restauración de PostgreSQL](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/).
- Ejecutar diariamente un job de `pg_dump` en formato comprimido.
- Cifrar antes de enviar, generar checksum y subir a R2.
- Usar prefijos separados:
  - `daily/`: eliminación automática después de 30 días.
  - `monthly/`: copia del primer backup de cada mes y eliminación después de 365 días.
- El job falla si dump, cifrado, checksum o upload no finalizan correctamente.
- Alertar si el último backup exitoso supera 26 horas.
- Ejecutar antes del go-live una restauración completa en una base aislada.
- Medir el tiempo desde la declaración del incidente hasta readiness funcional; debe ser menor de una hora.
- Repetir el restore drill trimestralmente.
- Nunca restaurar directamente sobre producción ni considerar un volumen como backup.

### Monitoreo

Better Stack verificará cada cinco minutos:

- `https://app.DOMAIN/api/health/live`
- `https://app.DOMAIN/api/health/ready`

Los chequeos usarán el service token de Cloudflare y alertarán por email y app móvil después de dos fallos consecutivos.

DigitalOcean alertará sobre:

- deployment o migración fallida;
- CPU/memoria sostenida;
- reinicios;
- conexiones y almacenamiento PostgreSQL;
- fallo de dominio/certificado;
- backup o job fallido.

Los logs incluirán release SHA, request ID, error ID, duración y resultado, pero nunca cookies, contraseñas, URLs firmadas, API keys ni información financiera innecesaria.

## 5. CI/CD, validación y despliegue

### CI y ramas

- Mantener `develop → PR → main`.
- Prohibir commits directos y force-push sobre `main`.
- Consolidar los workflows duplicados y eliminar el nombre obsoleto `CI R1`.
- Requerir antes del merge:
  - instalación desde lockfile;
  - Prettier check;
  - lint;
  - typecheck de API, web y tests;
  - unit tests;
  - integración sobre PostgreSQL 16 limpio;
  - componentes web;
  - build productivo;
  - `prisma validate`;
  - migraciones sobre base vacía;
  - `npm audit --audit-level=high`;
  - escaneo de secretos y contenedor.

Después del merge a `main`:

1. Construir la imagen de aplicación y la imagen operativa de backup.
2. Etiquetarlas respectivamente como `app-sha-<commit>` y `backup-sha-<commit>`.
3. Publicarlas en GHCR.
4. Registrar los dos digest y sus SBOM.
5. Crear/actualizar staging con ese digest.
6. Ejecutar migraciones.
7. Esperar readiness.
8. Ejecutar smoke tests.
9. Detener la promoción ante cualquier fallo.

GitHub Free privado usará un `workflow_dispatch` exclusivo del propietario con entradas obligatorias:

- versión esperada `v1.1.0`;
- SHA validado;
- digest validado;
- confirmación literal de producción.

El workflow rechazará la promoción si tag, SHA y digest no coinciden.

### Smoke tests de staging

Validar:

- Cloudflare bloquea dispositivos no inscritos.
- El dominio técnico de DigitalOcean no permite saltar Access.
- Login, logout, sesión y cambio de contraseña.
- Matriz negativa de Administrator y Seller.
- Creación y edición de clientes.
- `Cliente contado`.
- Catálogo de servicios.
- Borradores con líneas `GENERIC`, `SERVICE`, `DELIVERY` y `EXTERNAL`.
- Rechazo `409` de líneas `ITEM` y `QTY`.
- Confirmación DOP y USD.
- FAC único y no reutilizable.
- ITBIS, redondeo y snapshot de cliente.
- Generación y regeneración de PDF.
- Rentabilidad exclusiva de Administrator.
- ExchangeRate-API actual, histórica y reintento.
- Pago inicial y posterior.
- CxC.
- Cancelación y reembolso no inventariable.
- Idempotencia y conflictos de autorización.
- Reinicio del servicio sin pérdida de sesiones.
- Backup, descarga, checksum, descifrado y restore aislado.
- Rollback de aplicación sin revertir datos.

### Go-live

1. Confirmar CI, staging, restore drill, backups y alertas.
2. Crear tag anotado `v1.1.0` apuntando al SHA probado.
3. Tomar/verificar backup inmediatamente antes de producción.
4. Ejecutar manualmente la promoción del mismo digest.
5. Ejecutar migraciones mediante el job `PRE_DEPLOY`.
6. Esperar liveness y readiness.
7. Configurar `app.DOMAIN`.
8. Crear el primer Administrator con `npm run bootstrap:admin` desde una consola interactiva segura.
9. Verificar login y cambiar inmediatamente la contraseña inicial.
10. Confirmar que no existen cuentas demo ni datos sintéticos.
11. Ejecutar en producción solo smoke tests no destructivos: Access, login, sesión, permisos, health, catálogos vacíos y FX.
12. Abrir el acceso a los dispositivos aprobados.
13. Registrar versión, SHA, digest, migration set, hora y resultado.

### Rollback

- Fallo antes de aceptar tráfico: bloquear Access y revertir el deployment.
- Fallo de código compatible con el esquema: usar rollback de App Platform al deployment anterior. DigitalOcean conserva los diez últimos despliegues exitosos: [rollback de App Platform](https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/).
- Fallo de migración: el job debe detener el despliegue; no editar una migración aplicada.
- Corrupción o migración irreversible: detener escrituras, restaurar PITR en un clúster nuevo, validar integridad y cambiar `DATABASE_URL`.
- Durante el primer go-live, si todavía no existen datos reales, cerrar Access y corregir hacia adelante; nunca resetear una base después de iniciar operaciones.
- Toda migración futura debe ser backward-compatible o incluir un runbook específico de recuperación.

## 6. Criterios finales de aceptación

El go-live solo se considera completado cuando:

- CI y build de imagen están en verde.
- Staging usó el mismo digest que producción.
- Producción y staging tienen bases, secrets y dominios separados.
- PostgreSQL no es público.
- Cloudflare Access no puede omitirse usando el dominio técnico.
- Cookies seguras funcionan detrás de Cloudflare y DigitalOcean.
- Migraciones no se ejecutan durante el arranque normal.
- Backups automáticos, PITR y copia externa están activos.
- El restore drill cumple RTO de una hora.
- Better Stack y DigitalOcean entregan alertas por ambos canales.
- El Administrator inicial puede operar y no existen cuentas demo.
- Los flujos de Billing Core y finanzas adelantadas pasaron en staging.
- El tag `v1.1.0`, SHA, digest y deployment coinciden.
- El procedimiento de rollback fue ensayado.
- CPU, memoria, errores, latencia, WAF y backups se revisan durante 2 horas, 24 horas, 72 horas y 7 días.

Supuestos aceptados:

- La falta de un operador de respaldo es un riesgo consciente; MFA y recovery codes son obligatorios.
- El dominio real se sustituirá antes de crear DNS o certificados.
- No se necesitan fotos ni object storage de aplicación en este release; R2 se usa solo para backups.
- Los filtros todavía pendientes de Release 3 no bloquean el lanzamiento.
- Si el restore drill supera una hora o la estimación excede US$100/mes, el go-live queda bloqueado hasta redimensionar o aprobar una excepción.

## 7. Guía paso a paso para un primer despliegue

Esta guía es el orden obligatorio de ejecución para un ingeniero que nunca ha realizado un despliegue. No se debe saltar a DigitalOcean antes de completar la preparación local y CI. Cada etapa termina con un **gate**: si el resultado no coincide con lo indicado, se detiene el proceso y se corrige antes de continuar.

### 7.1 Conceptos mínimos

- **Local:** entorno de desarrollo en la computadora. Puede reiniciarse y usar datos descartables.
- **Test:** entorno automático aislado. Cada ejecución crea o limpia sus datos.
- **Staging:** copia funcional de producción con recursos pequeños y datos sintéticos; se usa para probar el release real.
- **Production:** ambiente con usuarios y datos reales. No se experimenta ni se ejecutan resets.
- **CI:** controles automáticos que validan el repositorio.
- **CD:** automatización que entrega un artefacto ya validado a un ambiente.
- **Imagen:** paquete ejecutable del servicio.
- **Tag:** nombre legible de una imagen o commit; puede cambiar y no prueba identidad por sí solo.
- **Digest:** huella `sha256` inmutable de una imagen. Es la identidad usada para promoción.
- **Migración:** cambio versionado de la estructura PostgreSQL.
- **PITR:** restauración de PostgreSQL a un instante específico.
- **RPO 1 hora:** no se acepta perder más de una hora de datos.
- **RTO 1 hora:** el servicio debe recuperarse en menos de una hora.
- **Secret:** credencial o valor sensible. Nunca se copia al repositorio, capturas, tickets o logs.

Todo texto en mayúsculas como `DOMAIN`, `APP_IMAGE_DIGEST` o `PRODUCTION_DATABASE_URL` es un placeholder. Debe sustituirse en el proveedor correspondiente, no mediante búsqueda/reemplazo indiscriminado dentro del repositorio.

### 7.2 Etapa 0 — Hoja de control y requisitos

Antes de escribir código:

1. Crear un issue privado de release llamado `Deployment v1.1.0`.
2. Registrar sin secretos:
   - dominio real;
   - ventana de go-live y zona horaria `America/Santo_Domingo`;
   - propietario de GitHub, DigitalOcean, Cloudflare y Better Stack;
   - presupuesto estimado;
   - SHA candidato;
   - enlaces a ejecuciones de CI, staging, restore drill y producción.
3. Crear entradas en un password manager para cada cuenta y ambiente.
4. Activar MFA en todas las cuentas y guardar recovery codes fuera de la computadora principal.
5. Confirmar una tarjeta/método de pago y alertas de facturación en DigitalOcean y Cloudflare.
6. Sustituir `DOMAIN` en la copia de trabajo del plan antes de configurar DNS.

**Gate 0:** no continuar si no se controla el dominio, falta MFA, no existe método de recuperación de cuentas o el estimado excede US$100/mes.

### 7.3 Etapa 1 — Preparar la estación de trabajo

Instalar desde sus fuentes oficiales:

- Git.
- Node.js 22.
- npm 11.19.1.
- Docker Desktop con Docker Compose v2.
- `doctl`, CLI oficial de DigitalOcean.
- un cliente PostgreSQL 16 que incluya `psql`, `pg_dump` y `pg_restore`.
- `age` para cifrado.

Verificar desde PowerShell:

```powershell
git --version
node --version
npm --version
docker version
docker compose version
doctl version
psql --version
pg_dump --version
age --version
```

Resultados esperados:

- Node comienza con `v22`.
- npm comienza con `11.19.1`.
- `pg_dump` y `pg_restore` tienen major version 16.
- `docker version` muestra cliente y servidor, no solo cliente.
- Ningún comando devuelve `command not found`, `Access denied` o error de conexión al engine.

**Gate 1:** resolver primero el acceso denegado a Docker y los permisos de `apps/api/dist` ya detectados. No usar ejecución como Administrator como solución permanente; corregir propietario/permisos del directorio y confirmar que un usuario normal puede construir.

### 7.4 Etapa 2 — Crear la rama y establecer la línea base

1. Actualizar referencias remotas sin modificar trabajo local.
2. Crear desde `develop` una rama enfocada, por ejemplo `chore/deployment-v1.1.0`.
3. Confirmar que no existen cambios ajenos antes de comenzar.
4. Crear `.env` a partir de `.env.example`, completar únicamente valores locales y confirmar que Git lo ignora.
5. Arrancar PostgreSQL de desarrollo y test. `DATABASE_URL` debe apuntar a `db`; `DATABASE_URL_TEST` debe apuntar exclusivamente a `db-test`:

```powershell
docker compose --profile test up --detach db db-test
docker compose ps
```

6. Instalar exactamente el lockfile y ejecutar la línea base:

```powershell
npm ci --ignore-scripts
npm run format:check
npm run lint
npm run typecheck
npm run test
$env:VITE_USE_MOCK_API = 'false'
$env:VITE_CAPABILITIES_PRESET = 'release-2'
$env:VITE_ENABLE_DEMO_CONTROLS = 'false'
npm run build
```

7. Guardar en el issue el resultado, los nueve warnings conocidos de lint y cualquier fallo nuevo.
8. No mezclar correcciones funcionales no relacionadas con el despliegue.

**Gate 2:** tests, typecheck y build deben finalizar con código 0. ESLint puede conservar temporalmente solo los nueve warnings ya inventariados; no se aceptan errores ni warnings nuevos.

### 7.5 Etapa 3 — Implementar configuración y seguridad en orden

La implementación se divide en commits revisables en este orden:

1. **Contrato de environment:** crear `env.ts`, sus pruebas y actualizar `.env.example`.
2. **Frontera HTTP:** implementar allowed hosts y validación de Cloudflare Access con tests unitarios.
3. **Servidor unificado:** servir la SPA desde Express, proteger rutas y conservar health checks.
4. **Contenedores:** crear `.dockerignore`, `Dockerfile.production` y `Dockerfile.backup`.
5. **Compose local:** separar migración, API, web, base y profile de tunnel.
6. **Scripts operativos:** backup, restore y smoke tests.
7. **App Specs:** staging primero y producción después.
8. **CI/CD:** consolidar CI, luego release a staging y finalmente promoción manual.

Después de cada bloque ejecutar sus tests específicos, typecheck y lint. Después del último bloque ejecutar la suite completa.

**Gate 3:** la aplicación debe fallar al arrancar si una variable productiva obligatoria falta, pero local/test deben seguir siendo fáciles de ejecutar con valores explícitos y seguros.

### 7.6 Etapa 4 — Validar Docker Compose local

Validar primero la configuración resuelta, sin mostrarla en tickets porque puede contener valores locales:

```powershell
docker compose config --quiet
docker compose build
docker compose up
```

En otra terminal verificar:

```powershell
docker compose ps --all
curl.exe -i http://127.0.0.1:5173/api/health/live
curl.exe -i http://127.0.0.1:5173/api/health/ready
```

Estado esperado:

- `db`: healthy.
- `db-test`: healthy cuando se usa `--profile test`; no arranca en el uso local normal.
- `migrate`: exited con código 0.
- `api`: healthy, sin puerto publicado al host.
- `web`: healthy y accesible solo desde loopback.
- `cloudflared`: no creado en el arranque normal.
- liveness y readiness: HTTP 200 con respuesta genérica.

Probar el profile opcional por separado:

```powershell
docker compose --profile tunnel up
```

El quick tunnel es exclusivamente una demostración local. Su URL no se registra como staging ni producción.

Para validar desde cero, usar una base local descartable nueva. Nunca eliminar un volumen que pueda contener datos necesarios sin comprobar primero su ruta y propósito.

**Gate 4:** no continuar si API o PostgreSQL están expuestos más allá de loopback, si la migración se ejecuta en cada restart o si la app depende del tunnel para funcionar localmente.

### 7.7 Etapa 5 — Construir y probar imágenes

La imagen de aplicación se construye con valores Vite no sensibles:

```powershell
$releaseSha = git rev-parse HEAD
docker build --file Dockerfile.production `
  --build-arg VITE_USE_MOCK_API=false `
  --build-arg VITE_CAPABILITIES_PRESET=release-2 `
  --build-arg VITE_ENABLE_DEMO_CONTROLS=false `
  --tag "solocamiones-app:$releaseSha" .
docker build --file Dockerfile.backup `
  --tag "solocamiones-backup:$releaseSha" .
```

Pruebas mínimas:

- inspeccionar que el proceso no use UID 0;
- arrancar la imagen de aplicación contra PostgreSQL local;
- confirmar que no ejecuta migraciones al arrancar;
- comprobar SPA, API, liveness, readiness y graceful shutdown;
- comprobar que la imagen de backup contiene versiones compatibles de `pg_dump`, `age` y cliente S3;
- escanear ambas imágenes y generar SBOM.

Los comandos manuales solo validan. GitHub Actions será la única fuente de imágenes publicadas en GHCR.

**Gate 5:** ninguna vulnerabilidad `CRITICAL` conocida sin excepción documentada; la imagen de aplicación no contiene `.env`, `.git`, código de tests, herramientas de backup ni dependencias de desarrollo innecesarias.

### 7.8 Etapa 6 — Configurar GitHub y CI/CD

En GitHub:

1. Proteger `main`: Pull Request obligatorio, CI requerido, force-push y borrado bloqueados.
2. Habilitar GitHub Packages/GHCR para el repositorio privado.
3. Crear secrets con nombres explícitos; no usar un único JSON con todas las credenciales.
4. Dar `packages: write` solo al job que publica imágenes.
5. Dar acceso al token de DigitalOcean únicamente a los workflows de release/promoción.
6. Configurar SonarQube antes de retirar `build.yml`.
7. Ejecutar el nuevo `ci.yml` en la Pull Request y confirmar todos los gates.
8. Mergear a `main` solo después de revisión.

`release.yml` debe:

1. leer el SHA de `main`;
2. construir ambas imágenes una sola vez;
3. ejecutar tests y escaneos;
4. publicar `app-sha-<SHA>` y `backup-sha-<SHA>`;
5. resolver y guardar sus digest;
6. generar SBOM y resumen de release;
7. aplicar el App Spec de staging con el digest de aplicación;
8. ejecutar smoke tests;
9. detenerse sin tocar producción si cualquier paso falla.

`promote-production.yml` debe:

1. requerir `v1.1.0`, SHA, digest y confirmación literal;
2. verificar que el tag apunta al SHA;
3. verificar que el digest pertenece al artefacto probado en staging;
4. aplicar el App Spec productivo sin volver a construir;
5. esperar migración, readiness y verificación post-deploy;
6. publicar un resumen sin secrets.

**Gate 6:** una Pull Request de prueba debe demostrar que CI no puede desplegar; un release de prueba debe demostrar que staging sí se actualiza; producción solo puede cambiar mediante el workflow manual.

### 7.9 Etapa 7 — Crear cuentas y proyectos externos

Orden recomendado:

1. Crear equipo/proyecto `Solo Camiones` en DigitalOcean, región principal `NYC3`.
2. Crear zona DNS y organización Zero Trust en Cloudflare.
3. Crear bucket privado de R2.
4. Crear proyecto y monitor en Better Stack.
5. Conectar GitHub con DigitalOcean/GHCR usando credenciales de mínimo alcance.
6. Activar alertas de gasto al 50 %, 75 %, 90 % y 100 % del techo mensual.

No reutilizar tokens personales amplios cuando el proveedor permita tokens de servicio acotados. Guardar en el issue únicamente el nombre/ID no sensible de cada recurso.

**Gate 7:** MFA activo, recuperación comprobada, facturación configurada y ningún secreto almacenado en el issue o repositorio.

### 7.10 Etapa 8 — Crear PostgreSQL y sus roles

Producción usa un clúster Managed PostgreSQL 16 de un nodo en `NYC3`. Crear dentro de él la base `solocamiones`; no usar `defaultdb` para datos de aplicación. Staging usa una base descartable distinta llamada `solocamiones_staging`. Ambos ambientes deben utilizar private networking y `sslmode=require`.

Antes de la primera migración, conectarse como usuario administrador y crear roles separados. Las contraseñas se asignan con el mecanismo interactivo seguro del cliente, nunca dentro de un archivo SQL versionado:

```sql
CREATE ROLE sc_migration LOGIN;
CREATE ROLE sc_runtime LOGIN;
CREATE ROLE sc_backup LOGIN;

GRANT CONNECT ON DATABASE solocamiones TO sc_migration, sc_runtime, sc_backup;
GRANT USAGE, CREATE ON SCHEMA public TO sc_migration;
GRANT USAGE ON SCHEMA public TO sc_runtime, sc_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE sc_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sc_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sc_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sc_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sc_migration IN SCHEMA public
  GRANT SELECT ON TABLES TO sc_backup;
```

Asignar cada contraseña desde la sesión interactiva de `psql`, que evita escribirla en el archivo o en el historial del shell:

```text
\password sc_migration
\password sc_runtime
\password sc_backup
```

Ejecutar los grants conectado específicamente a la base `solocamiones`; repetir con nombres de roles terminados en `_staging` dentro del ambiente de staging para evitar cualquier reutilización accidental.

Después de la migración inicial, otorgar permisos sobre objetos ya creados:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sc_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sc_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sc_backup;
```

Luego:

- construir `DATABASE_MIGRATION_URL` con `sc_migration`;
- construir `DATABASE_URL` con `sc_runtime`;
- construir `BACKUP_DATABASE_URL` con `sc_backup`;
- guardarlas directamente como encrypted variables en DigitalOcean;
- retirar cualquier trusted source temporal usada para administración.

Verificar negativamente que `sc_runtime` no puede crear/eliminar tablas y que `sc_backup` no puede insertar, actualizar ni eliminar registros.

**Gate 8:** migraciones limpias con `sc_migration`, readiness con `sc_runtime`, dump con `sc_backup` y pruebas negativas de permisos exitosas.

### 7.11 Etapa 9 — Configurar R2 y cifrado

1. Crear bucket privado `solocamiones-production-backups`.
2. Bloquear acceso público y public listing.
3. Crear credencial S3 limitada a leer/escribir/listar únicamente ese bucket.
4. Generar un par de claves `age` en una estación segura.
5. Guardar la clave privada de descifrado en el password manager y una copia offline.
6. Entregar al job únicamente el recipient público de `age`.
7. Crear lifecycle de 30 días para `daily/` y 365 días para `monthly/`.
8. Configurar alertas ante fallo del job o ausencia de backup nuevo durante 26 horas.

Cada ejecución debe generar:

```text
daily/YYYY/MM/DD/solocamiones-UTC_TIMESTAMP.dump.age
daily/YYYY/MM/DD/solocamiones-UTC_TIMESTAMP.dump.age.sha256
daily/YYYY/MM/DD/solocamiones-UTC_TIMESTAMP.manifest.json
```

El primer día de cada mes se conserva además una copia bajo `monthly/YYYY/MM/`. El manifiesto no contiene secretos y registra SHA del release, versión PostgreSQL, timestamp UTC, tamaño y checksum.

**Gate 9:** descargar un objeto, validar checksum, descifrarlo y comprobar que `pg_restore --list` puede leerlo.

### 7.12 Etapa 10 — Completar App Specs

Crear primero staging. Cada spec debe declarar explícitamente:

- nombre del app;
- región `nyc`/`NYC3` según el valor exigido por el schema de DigitalOcean;
- imagen por digest;
- tamaño e instance count;
- puerto HTTP;
- readiness y liveness;
- variables públicas no sensibles;
- referencias/placeholders de encrypted variables;
- deployment job `PRE_DEPLOY` para Prisma;
- scheduled backup job solo en producción;
- alertas;
- dominio del ambiente.

Valores mínimos:

| Recurso    | Staging                   | Production                            |
| ---------- | ------------------------- | ------------------------------------- |
| App        | `solocamiones-staging`    | `solocamiones-production`             |
| Compute    | 512 MB, 1 instancia       | 1 GB, 1 instancia                     |
| Database   | PostgreSQL 16 descartable | Managed PostgreSQL 16                 |
| Datos      | Sintéticos                | Reales                                |
| Backup job | Manual para ensayo        | Diario, 02:15 `America/Santo_Domingo` |
| Dominio    | `staging.DOMAIN`          | `app.DOMAIN`                          |

Validar sin aplicar:

```powershell
doctl apps spec validate infra/digitalocean/app.staging.yaml
doctl apps spec validate infra/digitalocean/app.production.yaml
```

Revisar el diff del spec antes de cada `doctl apps update`. No copiar el spec productivo y reemplazar solo el nombre: revisar cada referencia a DB, audience, dominio, secrets y tamaño.

**Gate 10:** ambos specs válidos, staging no referencia ningún recurso productivo y producción no contiene valores secretos en texto plano.

### 7.13 Etapa 11 — Configurar Cloudflare

1. Añadir `DOMAIN` a Cloudflare y cambiar nameservers en el registrador.
2. Esperar estado `Active`; no borrar registros existentes durante la migración.
3. Añadir primero los dominios custom en DigitalOcean.
4. Crear DNS proxied para `staging.DOMAIN` y `app.DOMAIN` hacia los targets indicados por DigitalOcean.
5. Configurar TLS `Full (strict)` y verificar certificados.
6. Crear dos Access applications con audiences diferentes.
7. Crear política humana default-deny que requiera dispositivo WARP inscrito.
8. Emitir un token distinto por dispositivo, registrarlo sin guardar su valor en el issue y comprobar revocación.
9. Crear una política `Service Auth` separada para Better Stack.
10. Configurar WAF y rate limiting para login, sin cachear `/api/*` ni contenido autenticado.
11. Habilitar HSTS únicamente después de comprobar todos los subdominios por HTTPS.

Pruebas obligatorias:

- dispositivo no inscrito: bloqueado por Cloudflare;
- dispositivo inscrito: llega al login de Solo Camiones;
- token revocado: acceso bloqueado;
- `ondigitalocean.app`: rutas privadas devuelven 403 porque falta JWT válido;
- JWT con audience de staging contra producción: rechazado;
- Better Stack: puede consultar health con su service token y no puede usar rutas de negocio.

**Gate 11:** no abrir producción si el dominio técnico permite bypass, si se comparte un token entre dispositivos o si TLS no está en modo estricto.

### 7.14 Etapa 12 — Desplegar y validar staging

1. Ejecutar CI y mergear la Pull Request a `main`.
2. Esperar publicación de ambas imágenes y registrar digest.
3. Crear staging mediante `release.yml`.
4. Confirmar que el deployment job aplica migraciones antes de readiness.
5. Crear el Administrator de staging mediante la consola interactiva y una contraseña exclusiva.
6. Cargar únicamente datos sintéticos identificados como `STAGING`.
7. Ejecutar todos los smoke tests de la sección 5.
8. Reiniciar el servicio y verificar persistencia de sesiones y datos.
9. Ejecutar rollback al deployment anterior y volver al candidato para ensayar ambos sentidos.
10. Conservar logs, resultados y tiempos en el issue.

No destruir staging hasta completar el restore drill y la promoción productiva. Después puede destruirse para controlar costos; el App Spec debe permitir recrearlo.

**Gate 12:** cero fallos en smoke tests, misma imagen candidata que se promoverá, migraciones correctas y rollback ensayado.

### 7.15 Etapa 13 — Ejecutar el restore drill

1. Disparar manualmente el job de backup.
2. Confirmar dump, cifrado, checksum, manifiesto y upload.
3. Crear una base PostgreSQL aislada que no sea staging ni producción.
4. Iniciar cronómetro.
5. Descargar y verificar checksum.
6. Descifrar mediante la clave privada offline.
7. Restaurar con:

```text
pg_restore --exit-on-error --no-owner --no-acl --dbname RESTORE_DATABASE_URL BACKUP.dump
```

8. Ejecutar readiness, consultas de consistencia y smoke tests de lectura.
9. Verificar usuarios/roles, clientes, catálogos, facturas, FAC, pagos, cancelaciones, history y estados PDF/FX.
10. Detener cronómetro cuando la aplicación restaurada esté lista.
11. Registrar resultado y destruir la base temporal solo después de conservar evidencia.

**Gate 13:** tiempo total inferior a 60 minutos, cero errores de integridad y procedimiento reproducible por el documento. Si falla, el RTO/RPO no está demostrado y producción queda bloqueada.

### 7.16 Etapa 14 — Promover a producción

#### Veinticuatro horas antes

- Confirmar dominio, cuentas, facturación, secrets, PITR y alertas.
- Confirmar que no hay cambios nuevos en `main` después del SHA probado.
- Notificar la ventana de mantenimiento.
- Preparar procedimiento de cierre de Access y rollback.

#### Una hora antes

- Revisar estado de DigitalOcean, Cloudflare, GitHub y ExchangeRate-API.
- Confirmar último backup válido.
- Mantener staging disponible.
- Crear tag solo sobre el SHA probado:

```powershell
git tag --annotate v1.1.0 RELEASE_SHA --message "Solo Camiones v1.1.0"
git push origin v1.1.0
```

#### Durante la ventana

1. Mantener la política humana de producción cerrada.
2. Ejecutar `promote-production.yml` con versión, SHA y digest comprobados.
3. Observar deployment job y detenerse ante cualquier error de migración.
4. Esperar HTTP 200 de liveness y readiness.
5. Confirmar release SHA en logs.
6. Crear el primer Administrator mediante consola interactiva.
7. Iniciar sesión, cambiar la contraseña y verificar sesión/cookies.
8. Confirmar base sin cuentas demo ni datos sintéticos.
9. Probar permisos y operaciones de solo lectura.
10. Abrir Access únicamente a dispositivos aprobados.
11. Verificar Better Stack y alertas de DigitalOcean.

No crear una factura real de prueba que luego deba borrarse. Las pruebas financieras completas ya ocurrieron en staging; producción conserva solo validaciones no destructivas.

**Gate 14:** versión, SHA y digest coinciden; migración, Access, login, health, backups y alertas están operativos antes de permitir usuarios.

### 7.17 Etapa 15 — Decidir rollback sin improvisar

Usar esta secuencia:

1. **¿El fallo ocurre antes de datos reales?** Cerrar Access, conservar logs y revertir el deployment o corregir hacia adelante.
2. **¿Solo falla el código y el esquema sigue siendo compatible?** Rollback de App Platform al último deployment sano.
3. **¿Falló `PRE_DEPLOY` sin aplicar cambios completos?** Mantener la versión anterior, inspeccionar `_prisma_migrations` y corregir con una migración nueva; no editar la aplicada.
4. **¿La app nueva escribió datos que la vieja no entiende?** No hacer rollback ciego. Cerrar escrituras y aplicar forward fix.
5. **¿Existe corrupción o pérdida?** Cerrar escrituras, restaurar PITR/backup en un clúster nuevo, validar y cambiar conexión.
6. **¿Cloudflare falla pero el origen está sano?** No publicar el dominio técnico como bypass; tratarlo como incidente de acceso.

Objetivo temporal:

- detección: menos de 10 minutos;
- decisión: menos de 15 minutos desde detección;
- restauración de servicio: menos de 60 minutos total.

### 7.18 Etapa 16 — Monitoreo posterior

Umbrales iniciales:

- uptime: alertar después de dos fallos consecutivos de cinco minutos;
- error rate HTTP 5xx: advertir sobre 2 % y crítico sobre 5 % durante cinco minutos;
- p95 de latencia: advertir sobre 1 segundo y crítico sobre 2 segundos durante diez minutos;
- CPU: advertir sobre 80 % durante quince minutos;
- memoria: advertir sobre 85 % durante diez minutos;
- almacenamiento PostgreSQL: advertir al 75 % y crítico al 85 %;
- conexiones PostgreSQL: advertir al 70 % del máximo disponible;
- backup: crítico si no existe uno válido en 26 horas;
- migración/deployment/job fallido: crítico inmediato;
- certificado: advertir con menos de 30 días si la renovación no está confirmada;
- login: revisar más de 10 fallos por origen o 25 globales en diez minutos;
- rentabilidad FX pendiente: alertar si permanece sin resolver durante 30 minutos;
- Feature 17 (cuando `ASSISTANT_ENABLED=true`): alertar por tasa de `assistant_errors_total` (5xx/timeout/provider), `PROVIDER_RATE_LIMIT` / 429, rechazo de cuota (`assistant_quota_rejections_total`), y `assistant_knowledge_sync_failures_total`; job `assistant-purge` fallido = crítico. Detalle en `docs/assistant-ops/OPERATIONS.md`. Fragmento de job: `docs/assistant-ops/purge.job.fragment.yaml` (fusionar en App Specs futuros).

Revisiones manuales:

- primeras 2 horas: permanecer disponible y observar logs/latencia;
- 24 horas: revisar errores, FX, sesiones, backups y facturación;
- 72 horas: revisar tendencias de CPU, memoria y DB;
- 7 días: confirmar costos reales, ajustar thresholds y cerrar el issue de release.

No aumentar recursos ante un único pico aislado. Escalar después de confirmar una tendencia y conservar la métrica que justificó el cambio.

### 7.19 Definición de terminado para la implementación

La implementación completa, no solo el documento, termina cuando existen evidencias de:

- todos los archivos de las matrices creados/modificados y revisados;
- CI verde desde una instalación limpia;
- imágenes escaneadas y promovidas por digest;
- Compose local reproducible desde base vacía;
- App Specs validados y ambientes separados;
- Cloudflare sin bypass del origen;
- roles PostgreSQL y pruebas negativas de permisos;
- backup cifrado, lifecycle y restore drill menor a una hora;
- staging con smoke tests completos;
- producción con validaciones no destructivas;
- alertas recibidas por email y aplicación móvil;
- tag `v1.1.0`, SHA y digest registrados;
- monitoreo satisfactorio durante siete días.
