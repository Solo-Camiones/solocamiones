# Deployment Plan — Truck Parts System / SoloCamiones

## Objetivo

Preparar y desplegar la primera versión productiva del sistema de SoloCamiones de forma segura, con:

- Producción basada en `main`.
- Ambiente separado de `staging`.
- Despliegues versionados.
- Rollback rápido.
- Backups externos.
- RPO objetivo de 1 hora.
- Tolerancia de caída de 5–10 minutos.
- Cloudflare para DNS, HTTPS, WAF, Tunnel y protección del origen.
- PostgreSQL inicialmente dentro del VPS.
- CI/CD con aprobación manual antes de producción.
- Monitoreo y documentación operativa.

---

# Arquitectura objetivo

```text
                         INTERNET
                            |
                            v
                 +---------------------+
                 |     CLOUDFLARE      |
                 |                     |
                 | DNS                 |
                 | HTTPS/TLS           |
                 | WAF                 |
                 | Rate Limiting       |
                 | DDoS Protection     |
                 +----------+----------+
                            |
                    Cloudflare Tunnel
                            |
                            v
              +--------------------------+
              |          VPS             |
              |                          |
              |   +------------------+   |
              |   |   cloudflared    |   |
              |   +--------+---------+   |
              |            |             |
              |            v             |
              |       +---------+        |
              |       |  Nginx  |        |
              |       +----+----+        |
              |            |             |
              |       +----+-----+       |
              |       |          |       |
              |       v          v       |
              |     React      Express   |
              |                   |      |
              |                   v      |
              |              PostgreSQL  |
              |                          |
              +-------------+------------+
                            |
                    Backup cada hora
                            |
                            v
                    Cloudflare R2
```

Principios:

- PostgreSQL no debe exponerse a Internet.
- Express no debe exponerse directamente a Internet.
- Nginx no necesita estar publicado directamente si todo entra mediante Cloudflare Tunnel.
- `cloudflared` inicia la conexión hacia Cloudflare desde el servidor.
- Los backups deben estar fuera del mismo VPS.
- `main` representa producción.

---

# Milestone 0 — Production Readiness Audit

## Objetivo

Auditar la rama:

```text
release_2/Billing_Core
```

antes del PR hacia `main`.

## Revisar

### Frontend
- Manejo de errores.
- Variables de entorno.
- URLs hardcodeadas.
- Build de producción.
- XSS.
- Exposición de información sensible.

### Backend
- Autenticación.
- Autorización.
- Roles.
- Validación de inputs.
- Manejo de errores.
- Rate limiting.
- Headers de seguridad.
- Logs.
- Exposición de stack traces.
- Límites de payload.

### Base de datos
- Prisma schema.
- Migraciones.
- Índices.
- Constraints.
- Datos críticos.
- Integridad referencial.
- Estrategia de rollback de cambios de esquema.

### Infraestructura
- Dockerfiles.
- Docker Compose.
- Nginx.
- Health checks.
- Secrets.
- Puertos.
- Redes.
- Cloudflare.
- CI.

### Seguridad
- Dependencias vulnerables.
- Secrets en repositorio.
- Password hashing.
- JWT/cookies.
- CORS.
- CSRF si aplica.
- IDOR.
- SQL injection.
- XSS.
- Brute force.
- Auditoría de acciones críticas.

## Resultado

Crear:

```text
docs/deployment/production-readiness-audit.md
```

Clasificar hallazgos:

- CRITICAL
- HIGH
- MEDIUM
- LOW

No hacer PR a `main` con riesgos CRITICAL sin resolver.

---

# Milestone 1 — Git Workflow

## Regla principal

```text
main = producción
```

No desarrollar directamente sobre `main`.

## Flujo recomendado

```text
feature/*
    |
    v
develop
    |
    v
staging
    |
    v
Pull Request
    |
    v
main
    |
    v
production
```

La estructura definitiva debe validarse antes de aplicarla.

## Protección de `main`

Configurar en GitHub:

- Require Pull Request.
- Require CI checks.
- Block force push.
- Block branch deletion.
- Requerir rama actualizada antes del merge si aplica.

---

# Milestone 2 — Separación de ambientes

Definir:

```text
LOCAL
STAGING
PRODUCTION
```

Ejemplo:

```text
localhost
staging.solocamiones.com
app.solocamiones.com
```

Cada ambiente debe tener sus propias variables:

- `DATABASE_URL`
- `JWT_SECRET`
- claves externas
- configuración de CORS
- configuración de logging
- configuración de cookies
- cualquier API key

Regla:

```text
staging nunca debe usar la base de datos de producción.
```

---

# Milestone 3 — Docker de producción

Separar configuración de desarrollo y producción.

Posible estructura:

```text
docker-compose.yml
docker-compose.staging.yml
docker-compose.prod.yml
```

## Producción

Evitar publicar innecesariamente:

- PostgreSQL.
- API.
- Nginx, si todo entra por Tunnel.

## Versionado de imágenes

No usar `latest` para componentes propios.

Ejemplo:

```text
truck-parts-api:1.0.0
truck-parts-web:1.0.0
```

o imágenes ligadas al commit:

```text
truck-parts-api:sha-82ad91f
```

---

# Milestone 4 — VPS Hardening

## Sistema

Usar una distribución estable tipo Ubuntu Server LTS.

## SSH

- Crear usuario no root.
- Deshabilitar login SSH de root.
- Deshabilitar autenticación por contraseña.
- Usar llaves SSH.
- Proteger las llaves privadas localmente.

## Sistema

- Actualizaciones de seguridad.
- Firewall.
- Hora/NTP.
- Log rotation.
- Docker.
- Docker Compose.
- Política de reinicio.
- Espacio en disco.
- Backups de configuración.

## Firewall

Idealmente:

```text
HTTP        cerrado
HTTPS       cerrado
PostgreSQL  cerrado
API         cerrado
SSH         restringido
```

Cloudflare Tunnel será la entrada a la aplicación.

---

# Milestone 5 — Cloudflare

## Dominio

Conectar el dominio a Cloudflare.

Ejemplo:

```text
app.solocamiones.com
staging.solocamiones.com
```

## Tunnel

Crear Named Cloudflare Tunnels.

No utilizar Quick Tunnel para producción.

## Activar

- DNS.
- HTTPS/TLS.
- WAF.
- DDoS protection.
- Rate limiting.
- Security headers cuando corresponda.

## Origen

El VPS no debe quedar expuesto directamente como origen de la aplicación.

---

# Milestone 6 — Proteger staging

Configurar:

```text
staging.solocamiones.com
```

detrás de Cloudflare Access.

Objetivo:

```text
Usuario autorizado
        |
        v
Cloudflare Access
        |
        v
Login de SoloCamiones
        |
        v
Staging
```

Staging no debe ser accesible libremente desde Internet.

---

# Milestone 7 — CI

Antes de cualquier deploy ejecutar:

```text
npm ci
lint
typecheck
unit tests
integration tests
build API
build Web
Prisma validation
security checks
```

Opcional/recomendado:

- Dependency scanning.
- Secret scanning.
- Container image scanning.

Si CI falla:

```text
NO MERGE
```

---

# Milestone 8 — CD a staging

Flujo:

```text
código aprobado
    |
    v
build
    |
    v
deploy staging
    |
    v
prisma migrate deploy
    |
    v
health checks
    |
    v
smoke tests
```

## Smoke tests

Probar al menos:

- Login.
- Usuarios.
- Inventario.
- Crear venta.
- Factura.
- Cancelación.
- Permisos.
- Tipo de cambio si aplica.
- Operaciones administrativas críticas.

---

# Milestone 9 — Approval antes de producción

No hacer despliegue automático a producción inmediatamente después de un merge.

Flujo:

```text
CI OK
  |
  v
Staging OK
  |
  v
Manual Approval
  |
  v
Production
```

Motivo:

Los tests automáticos no detectan necesariamente errores de negocio.

Antes de producción hacer validación manual de los flujos críticos.

---

# Milestone 10 — Deployment versionado

Cada release debe tener versión o identificador inequívoco.

Ejemplo:

```text
v1.0.0
v1.0.1
v1.1.0
```

Mantener relación entre:

- Git tag.
- Commit SHA.
- Docker image.
- Deployment.

Nunca depender únicamente de `latest`.

---

# Milestone 11 — Rollback

Objetivo:

Poder volver a la versión anterior en menos de 5–10 minutos.

Ejemplo:

```text
v1.3.0 -> falla
   |
   v
v1.2.0 -> rollback
```

## Importante

```text
Rollback de aplicación
!=
Rollback de base de datos
```

Las migraciones deben diseñarse para permitir compatibilidad hacia atrás cuando sea posible.

## Estrategia de esquema

Usar:

```text
Expand -> Migrate -> Contract
```

Ejemplo:

1. Crear nueva columna.
2. Hacer que la app soporte columna vieja y nueva.
3. Migrar datos.
4. Desplegar nueva versión.
5. Validar.
6. Eliminar la columna antigua en un release posterior.

---

# Milestone 12 — Backup y Disaster Recovery

## Requisito

RPO:

```text
1 hora
```

Por tanto:

```text
backup de PostgreSQL cada hora
```

## Flujo

```text
PostgreSQL
    |
    v
pg_dump
    |
    v
compress
    |
    v
encrypt
    |
    v
checksum
    |
    v
Cloudflare R2
```

## Retención inicial sugerida

```text
Hourly   -> últimas 24 horas
Daily    -> últimos 14 días
Weekly   -> últimas 8 semanas
Monthly  -> últimos 6 meses
```

## Regla crítica

Un volumen Docker no es un backup.

El backup debe estar fuera del VPS.

## Restore test

Mensualmente:

1. Descargar backup.
2. Restaurar en DB temporal.
3. Levantar o conectar la aplicación.
4. Ejecutar validaciones.
5. Confirmar integridad.

---

# Milestone 13 — Observabilidad

Monitorear:

- Logs de aplicación.
- Errores API.
- Docker.
- CPU.
- RAM.
- Disco.
- PostgreSQL.
- Estado de backups.
- Health checks.

Endpoints recomendados:

```text
/api/health/live
/api/health/ready
```

Agregar monitoreo externo periódico.

---

# Milestone 14 — Seguridad de aplicación

Aplicar defensa en profundidad.

```text
Cloudflare
    |
    v
Nginx
    |
    v
Express
    |
    v
PostgreSQL
```

## Backend

Revisar:

- Helmet.
- CORS.
- Rate limiting.
- Input validation.
- Auth.
- Authorization.
- Password hashing.
- Cookies/JWT.
- Request size limits.
- Safe error responses.
- Audit logs.

## Login

Proteger con:

```text
Cloudflare Rate Limiting
+
Express Rate Limiting
+
protecciones de autenticación
```

---

# Milestone 15 — Auditoría de negocio

Registrar eventos críticos.

Ejemplos:

```text
SALE_CREATED
SALE_CANCELLED
REFUND_CREATED
PRICE_CHANGED
STOCK_CHANGED
USER_CREATED
ROLE_CHANGED
```

Cada evento debería almacenar cuando corresponda:

- quién realizó la acción;
- cuándo;
- recurso afectado;
- valor anterior;
- valor nuevo;
- motivo.

---

# Milestone 16 — Go Live

Checklist mínimo:

```text
[ ] Domain OK
[ ] Cloudflare OK
[ ] HTTPS OK
[ ] Tunnel OK
[ ] WAF OK
[ ] Rate limiting OK

[ ] VPS hardened
[ ] SSH keys only
[ ] Firewall OK

[ ] Production DB created
[ ] DB not exposed
[ ] Migrations OK

[ ] Backup OK
[ ] Restore tested

[ ] Admin created
[ ] Demo accounts removed

[ ] CI passing
[ ] Staging passing

[ ] Health checks OK
[ ] Monitoring OK
[ ] Alerts OK

[ ] Rollback tested

[ ] Release tagged
```

Solo después:

```text
GO LIVE
```

---

# Milestone 17 — Post Deployment

Monitorear especialmente durante:

```text
24 horas
72 horas
7 días
```

Revisar:

- CPU.
- RAM.
- Disco.
- DB connections.
- API errors.
- Response times.
- WAF events.
- Failed logins.
- Backup status.

---

# Documentación final esperada

```text
docs/
└── deployment/
    ├── README.md
    ├── architecture.md
    ├── production-readiness-audit.md
    ├── environments.md
    ├── server-hardening.md
    ├── cloudflare.md
    ├── ci-cd.md
    ├── deployment-runbook.md
    ├── rollback-runbook.md
    ├── database-migrations.md
    ├── backup-restore.md
    ├── monitoring.md
    ├── incident-response.md
    ├── security-hardening.md
    └── production-checklist.md
```

---

# Costos esperados

## Probablemente gratuitos inicialmente

- Cloudflare DNS.
- Cloudflare Tunnel.
- HTTPS/TLS.
- WAF básico.
- DDoS protection.
- Cloudflare R2 dentro del free tier.
- GitHub Actions dentro de límites.
- Docker.
- Nginx.
- PostgreSQL dentro del VPS.

## De pago

- Dominio.
- VPS.

El VPS probablemente será el principal costo mensual operativo.

---

# Decisiones pendientes

Antes de implementar infraestructura definitiva se debe decidir:

1. Proveedor del VPS.
2. Presupuesto mensual aceptable.
3. Si producción quedará detrás de Cloudflare Access además del login propio.
4. Workflow definitivo entre `develop`, `staging` y `main`.
5. Política definitiva de secrets.
6. Herramienta de monitoreo externo.
7. Política de rotación de backups y cifrado.
