# SoloCamiones

**Versión del workspace 1.0.1** — snapshot local de preproducción (septiembre de 2026).

Sistema web de **facturación, cobros y cuentas por cobrar** para el negocio de piezas y servicios de camión. Monorepo npm (`apps/api` + `apps/web`) con PostgreSQL como fuente de verdad.

Este snapshot **no** es el MVP completo de inventario y órdenes de trabajo. Incluye el subset comercial de preproducción: acceso, clientes, catálogo de servicios, cotizaciones, conduces y facturas no inventariadas, documentos PDF, pagos, CxC, cancelación financiera, rentabilidad y un asistente de IA opcional para Administradores.

La especificación de producto vive en [`docs/`](docs/). Este README describe el árbol actual; la autorización formal del primer despliegue y el piloto del asistente conservan sus propios gates documentados.

---

## Qué incluye el snapshot actual

Con `VITE_USE_MOCK_API` distinto de `true` (el valor por defecto y el de producción):

| Área | En producción |
|---|---|
| Acceso y usuarios | Login/sesión, perfil, roles Administrador y Vendedor, alta/edición, recuperación autorizada de contraseña |
| Clientes | Directorio, Cliente contado, snapshot en factura |
| Catálogos | Servicios mecánicos (`/api/catalogs/services`). Categorías de inventario **ocultas** |
| Ventas | Borradores, cotizaciones `COT-`, conduces `CON-` y facturas `FAC-` con líneas GENERIC / SERVICE / DELIVERY / EXTERNAL. Moneda DOP o USD, ITBIS y PDF reproducible |
| Pagos y CxC | Reglas CASH/CREDIT, pago inicial según documento/rol, pagos posteriores, vencimiento por plazo comercial, filtros de abiertas y estado de cuenta PDF |
| Cancelación | Anulación de factura o conduce no inventariado (Administrador), reembolso entre cero y el neto cobrado, PDF de cancelación |
| Rentabilidad | Costo DOP, ganancia, equivalencia USD (tasa externa no bloquea la venta). Visible solo a Administrador |
| Historial comercial | Actividad de cotización, conduce o factura: emisión/conversión, pago, PDF y cancelación; utilidad/FX solo Administrador |
| Asistente de IA | Panel global solo para Administrador, RAG sobre corpus aprobado y seis herramientas comerciales de lectura. Deshabilitado por defecto y pendiente del gate AI-010 antes de producción |

Roles: **Administrador** y **Vendedor**. El Mecánico y su app móvil no forman parte de esta versión.

### Fuera del snapshot de producción HTTP

No están en API de producción (las pantallas del prototipo mock no cuentan):

- Inventario por pieza o por cantidad, reservas, venta ITEM/QTY (el API responde **409**)
- Jerarquía / baseline / No desarmar
- Órdenes de trabajo y evidencia del mecánico
- Cuentas por pagar (alcance no confirmado)
- Recuperación administrativa, correcciones protegidas, diagnóstico de consistencia
- Aging avanzado, gestión de cobranzas y conciliación bancaria
- Habilitación del asistente en producción hasta repetir la evaluación y cerrar `docs/assistant-eval/ROLLOUT_CHECKLIST.md`

El prototipo completo (`VITE_USE_MOCK_API=true`) sigue disponible **solo en desarrollo** para demos. No usar mocks en producción.

Fuente del snapshot de implementación: [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md). Detalle por feature: [`docs/FEATURES/README.md`](docs/FEATURES/README.md).

---

## Stack

- **Web:** React 19, TypeScript, Vite 7, React Router 7, Tailwind CSS 4
- **API:** Node.js, Express 5, Prisma 6, Zod, Pino, PDFKit, Argon2, OpenAI SDK detrás de adapters propios
- **Datos:** PostgreSQL 16 (Compose / CI). Local acepta 14+
- **Auth:** sesión por cookie httpOnly, CSRF en mutaciones, rate limit en login/recuperación

Flujo del backend: `Route → Controller → Service → Repository → PostgreSQL`.

---

## Requisitos

- Node.js 22.12+ (CI y Docker usan Node.js 22; las pruebas locales también corren en Node.js 24)
- npm **11.19.1** (el workspace lo exige en la instalación)
- PostgreSQL 14+ en local, o Docker para el stack Compose

---

## Arranque local (Node + PostgreSQL)

Si hace falta actualizar npm:

```bash
npm install --global npm@11.19.1
```

```bash
npm ci
cp .env.example .env
```

Editar `.env` y poner un `DATABASE_URL` real. Crear la base si no existe:

```bash
psql -U postgres -c "CREATE DATABASE truck_parts_dev;"
```

Generar Prisma Client y aplicar migraciones:

```bash
npm run db:generate
npm run db:migrate:deploy
```

Migraciones interactivas (crean archivos nuevos) en desarrollo:

```bash
npm run db:migrate
```

### Primer Administrador

Con el cliente Prisma generado y las migraciones aplicadas, en una terminal interactiva:

```bash
npm run bootstrap:admin
```

Usa `DATABASE_URL` del entorno o del `.env` raíz. Pide nombre, usuario, teléfono/correo opcionales y contraseña oculta dos veces. Mínimo 6 caracteres Unicode; se conservan tal cual. El usuario se recorta y pasa a minúsculas; contactos vacíos quedan `null`. El rol es siempre `ADMINISTRATOR` y la cuenta queda activa. No crea sesión.

Rechaza cualquier usuario existente (también inactivos). No actualiza ni restablece credenciales. Una transacción serializable evita dos bootstraps simultáneos. Tras un conflicto de concurrencia, revisar la base antes de reintentar.

No acepta argumentos ni credenciales por pipe. Ctrl+C cancela sin crear cuenta. Códigos: `0` éxito, `1` validación/base/conflicto, `130` cancelación. Los errores no imprimen secretos ni connection strings. Si falla el setup, verificar `DATABASE_URL` y `npm run db:migrate:deploy`. No borrar usuarios para reejecutar bootstrap.

Esa cuenta es la del login web cuando `VITE_USE_MOCK_API=false`. Las pruebas de bootstrap usan solo `DATABASE_URL_TEST`.

### URLs locales

- Web: http://localhost:5173
- API liveness: http://localhost:3000/api/health/live
- API readiness: http://localhost:3000/api/health/ready

Vite proxea `/api/*` al backend.

---

## Docker Compose

`docker-compose.yml` levanta PostgreSQL 16, API (sin publicar el puerto 3000) y web en **5173** detrás de nginx. La API solo es cliente interno de nginx. `cloudflared` es opcional para un túnel de prueba.

Variables relevantes del `.env` (nunca commitear `.env`):

- `DATABASE_URL` / `DATABASE_URL_TEST` — host local (puerto publicado, 5433 en el ejemplo)
- `DATABASE_URL_DOCKER` — red interna Compose (`db:5432`)
- `EXCHANGE_RATE_API_KEY` — rentabilidad USD; si falta, la confirmación sigue y el FX queda pendiente
- `ASSISTANT_ENABLED=false` — kill switch del asistente; mantener apagado hasta cerrar AI-010
- `OPENAI_API_KEY` / `OPENAI_VECTOR_STORE_ID` — requeridos para sync/evaluación real y para ejecutar el asistente habilitado
- `METRICS_BEARER_TOKEN` — habilita y protege `GET /metrics`; vacío devuelve 404
- `VITE_USE_MOCK_API=false` en el build de producción

---

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | API (3000) y web (5173) |
| `npm run build` | Build de API y web |
| `npm run typecheck` | TypeScript de todos los workspaces |
| `npm run lint` | ESLint |
| `npm run test` | Pruebas de API y web |
| `npm run test:unit` | Solo unitarias |
| `npm run test:integration` | Integración (API exige PostgreSQL de prueba) |
| `npm run db:generate` | Prisma Client |
| `npm run db:migrate` | Crear/aplicar migraciones en desarrollo |
| `npm run db:migrate:deploy` | Aplicar migraciones existentes |
| `npm run bootstrap:admin` | Primer Administrador en una base sin usuarios |
| `npm run assistant:validate-knowledge` | Validar manifest, archivos y checksums del corpus aprobado |
| `npm run assistant:sync-knowledge -- --dry-run` | Previsualizar la sincronización explícita del corpus |
| `npm run assistant:purge -- --dry-run` | Previsualizar la purga de conversaciones vencidas |
| `npm run assistant:eval -- --mode=fake` | Ejecutar el gate local determinista de evaluación del asistente |

---

## Pruebas

Unitarias de API no necesitan PostgreSQL:

```bash
npm run test:unit -w @solocamiones/api
```

`npm run test:watch -w @solocamiones/api` observa solo unitarias. `npm run test -w @solocamiones/api` corre unitarias e integración (incluye el reset de la base de prueba).

Para integración de API: `docker compose up -d db`, crear `truck_parts_test` si no existe, y `DATABASE_URL_TEST` en `.env` (puerto 5433 en `.env.example`):

```bash
npm run test:integration -w @solocamiones/api
```

El setup valida `DATABASE_URL_TEST` antes de asignarlo a Prisma. Si existen ambas URLs, los **nombres de base** deben ser distintos; credenciales u host distintos no bastan. Un entorno de prueba puede llevar solo `DATABASE_URL_TEST`. Sin ella, se quita el fallback de desarrollo y la suite falla. Las URLs inválidas fallan sin imprimir credenciales.

La integración **resetea** la base de prueba y reaplica todas las migraciones. Luego comprueba `/api/health/live` y `/api/health/ready`. Una base inalcanzable falla; no se omiten casos. No apuntar `DATABASE_URL_TEST` a datos que deban conservarse.

Inventario reciente de pruebas: [`docs/TESTING.md`](docs/TESTING.md).

### Health

| Endpoint | Significado | Éxito | Fallo |
|---|---|---|---|
| `GET /api/health/live` | El proceso corre | `200 { "status": "ok" }` | Proceso caído |
| `GET /api/health/ready` | PostgreSQL accesible y migraciones al día | `200 { "status": "ok", "database": "up", "migrations": "up_to_date" }` | `503` si la base está caída o hay migraciones pendientes |

---

## Estructura

```text
apps/
  api/                 Express + TypeScript
    prisma/            Schema y migraciones
    src/
      features/        access, users, customers, catalogs, sales,
                       payments, profitability, invoice-documents,
                       history, assistant, health
      infrastructure/  Prisma, logging, HTTP, PDF, FX, OpenAI, métricas
      cli/             bootstrap y operaciones/evaluación del asistente
  web/                 React + Vite
    src/
      api/             Contratos y clientes HTTP
      features/        Pantallas por dominio
      mocks/           Prototipo in-memory (no producción)
      shared/          Layout, UI, capabilities
docs/                  Fuente de verdad de producto
```

Cada feature de API sigue, en general:

```text
routes → controller → service → repository
+ validation, types, projection, policies
```

---

## Documentación

| Documento | Uso |
|---|---|
| [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) | Releases, snapshot de lo implementado, reglas de Cursor |
| [`docs/FEATURES/README.md`](docs/FEATURES/README.md) | Índice de specs; cada `FEATURES/*.md` es canónico para ese dominio |
| [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md) | Decisiones de arquitectura |
| [`docs/ROLES_AND_PERMISSIONS.md`](docs/ROLES_AND_PERMISSIONS.md) | Autorización |
| [`docs/INFRASTRUCTURE_PLAN.md`](docs/INFRASTRUCTURE_PLAN.md) | Hosting, backups, HTTPS, secretos |
| [`docs/TESTING.md`](docs/TESTING.md) | Inventario y cómo correr pruebas |
| [`docs/assistant-ops/README.md`](docs/assistant-ops/README.md) | Seguridad, operación, métricas, sync, purge y kill switch del asistente |
| [`docs/assistant-eval/README.md`](docs/assistant-eval/README.md) | Dataset, runner y gate AI-010 |
| [`docs/done_api/release-1.md`](docs/done_api/release-1.md) | Cierre Access/Users |
| [`docs/done_api/release_2.md`](docs/done_api/release_2.md) | Cierre Billing Core |
| [`docs/done_api/release_3.md`](docs/done_api/release_3.md) | Cierre del slice financiero adelantado de Release 3 |

No implementar ideas de [`docs/FUTURE_ROADMAP.md`](docs/FUTURE_ROADMAP.md) salvo petición explícita.

---

## CI

El workflow **CI R1** (`.github/workflows/ci.yml`) corre en pull requests y pushes a `main`: Node.js 22, npm 11.19.1, PostgreSQL 16 desechable. Ejecuta lint, typecheck, pruebas unitarias/integración/componente, build y audit de dependencias. No usa secretos de despliegue ni la base local.

El check requerido en `main` sigue llamándose **R1 quality** (nombre histórico del job). Cubre el árbol actual, no solo Release 1.
