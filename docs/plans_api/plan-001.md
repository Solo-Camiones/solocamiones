# Plan 001 — Release 1 Milestones: Foundation + Access and Users

**Release:** 1 — Application Foundation and Access (Local Development)  
**Estado:** Release 1 cerrado. Milestone 11 completado y verificado en local (exit gate de navegador confirmado por el owner el 2026-09-07). Milestone 4 cerrado: CI GitHub y check obligatorio `R1 quality` verificados.
**Último milestone:** Milestone 11 — Integrar users HTTP + exit gate Release 1

---

## Contexto

- **Release activo:** Release 1 — Application Foundation and Access (Local Development) ([`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §Release 1).
- **Release 0:** COMPLETADO y aprobado.
- **Entorno:** desarrollo y pruebas **únicamente en local** durante Release 1. No hay staging ni producción.
- **Primer despliegue productivo:** después de completar Release 2 — Billing Core ([`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §First production deployment).
- **Features en alcance:** [`../FEATURES/01_ACCESS_AND_USERS.md`](../FEATURES/01_ACCESS_AND_USERS.md) + slice R1 de [`../FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`](../FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md).
- **Frontend:** el prototipo mock de [`../plans_web/plan-001.md`](../plans_web/plan-001.md) está **cerrado** (WM12). M10–M11 ya conectaron login, shell por rol, perfil, usuarios y recuperación de contraseña a HTTP cuando `VITE_USE_MOCK_API=false`; el prototipo completo se conserva con `true`.
- **Estado API:** M1–M11 completados. Auth HTTP, `requireAuth`/`requireRole`, gestión y recuperación de contraseña están disponibles. History M9 persiste eventos atómicos de usuarios, perfil, contraseña y recuperación. CI GitHub (`R1 quality`) verificado.
- **Ciclo por milestone:** plan → implementación → pruebas → revisión → commit. La integración web se hace **solo** cuando la función API cumple el criterio de la sección Integración API → Web.



## Alcance total de Release 1

| Incluido | Excluido |
|---|---|
| Scaffold FE/BE, Prisma, PostgreSQL local, validación, errores, tests, CI local | Facturas, clientes, inventario, Work Orders, fotos, CxC, CxP |
| Login por `username`, sesiones, roles, gestión de usuarios, autorización server-side | Dashboard KPIs del prototipo, recovery/diagnostics completos (Release 8) |
| History envelope + eventos de ciclo de vida de usuarios | Otros tipos de evento de negocio (Release 2+) |
| Bootstrap CLI del primer Administrator | Staging, producción, hosting, RPO/RTO, HTTPS productivo, backups gestionados, rollback productivo |
| Verificación en browser de flujos UI | Object storage (Release 4+) |

## Decisiones cerradas (fuente de verdad)

Documentadas en [`../FEATURES/01_ACCESS_AND_USERS.md`](../FEATURES/01_ACCESS_AND_USERS.md), [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md), [`../FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`](../FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md) y [`../INFRASTRUCTURE_PLAN.md`](../INFRASTRUCTURE_PLAN.md):

1. Login identity: `username` único.
2. Primer Administrator: comando CLI one-shot; rechaza si ya existen usuarios; sin credenciales hardcodeadas de producción.
3. Perfil MVP: `name`, `username`, `phone?`, `email?`, `role`, `active`, `passwordHash`, `mustChangePassword` (controlado por servidor), `createdAt`, `updatedAt`.
4. Contraseña MVP: mínimo 6 caracteres; sin reglas extra de complejidad. Decisión del owner (2026-09-05): las cuentas creadas por Administrator reciben `solocamiones` como contraseña inicial y deben cambiarla desde su propio perfil antes de operar. Administrator no elige ni edita contraseñas libremente; solo puede aprobar recuperación solicitada y el sistema genera una contraseña temporal sin vencimiento. El bootstrap CLI mantiene su contraseña elegida interactivamente.
5. Release 0 completado; Release 1 activo.
6. Hosting / RPO / RTO: pendientes; requeridos solo antes del primer despliegue productivo (post Release 2); **no bloquean Milestones 1–11**.
7. CI smoke R1: migraciones, `/health/live`, `/health/ready`, login, sesión, autorización.
8. Mechanic en R1: proyección mínima de sesión + tests negativos; proyección WO completa en release correspondiente.
9. History R1: envelope reutilizable + solo eventos de ciclo de vida de usuarios.
10. Feature 01: un feature de producto; módulos `access` y `users` compartiendo modelo/repositorio de usuario.
11. Integración web Release 1: M10–M11 conectaron la UI de Feature 01 a HTTP después de completar su stack backend (ruta → controller → service → repository → validation → types + tests) y el contrato de errores de M3. Pantallas de Releases 2–8 (clientes, facturas, inventario, OT, etc.) **permanecen en mock** aunque la UI exista.

## Integración API → Web (cuándo cablear)

El prototipo web ya está listo para Access/Users. El cuello de botella es la API, no la UI.

**Una función está lista para integrar** cuando se cumplen los tres lados:

| Lado | Listo cuando |
|---|---|
| API | Módulo con routes, controller, service, repository, validation, types; tests de la función; errores HTTP estables (M3) |
| Web | Pantalla/flujo + interfaz de repositorio + stub HTTP en `apps/web/src/api/` (ya cubierto por WM2/WM11/WM12 para auth, perfil y usuarios) |
| Alcance de release | La función pertenece a Release 1. Tener UI mock de un release posterior **no** autoriza a integrar esa API ahora ([`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §1.7) |

Hasta entonces: `VITE_USE_MOCK_API` distinto de `false` (mocks). No mezclar login real con listados mock de usuarios, ni al revés.

### Estado final local (después de M11)

**Access/Users usa HTTP cuando `VITE_USE_MOCK_API=false`.** M10 completó auth,
sesión y perfil; M11 completó administración y recuperación de contraseña. History
M9 continúa como persistencia interna sin UI nueva.

| Función API | ¿Integrable ahora? | Motivo |
|---|---|---|
| `GET /api/health/live` | Opcional (ops) | API completa. El prototipo **ya no** tiene pantalla de health; no es Feature 01. Se puede usar a mano o en CI. |
| `GET /api/health/ready` | Opcional (ops) | Igual: readiness de PostgreSQL, no flujo de usuario. |
| Login / logout / sesión / perfil propio | Sí, integrado | Endpoints M6–M7 conectados y verificados en M10. |
| Gestión Administrator de usuarios y recuperación de contraseña | Sí, integrado | Backend M8 conectado y verificado en M11. |
| History de usuarios | Sin integración UI R1 | Envelope y eventos implementados y verificados. Es persistencia interna + tests, sin endpoint público de historial. |
| Clientes, facturas, inventario, OT, dashboard KPIs y recovery operacional | No (fuera de R1) | UI mock existe; API y release correspondientes son R2+. |

### Matriz Release 1 — primer momento integrable

| Función | Componentes API | Componentes web (ya existen) | Primer momento integrable | Trabajo de integración |
|---|---|---|---|---|
| Health live/ready | M1–M2 | Ninguno de producto (se quitó el health check de WM1) | **Después de M2** (ya cumplido) | No hay slice de producto. Smoke/CI solamente. |
| Contrato de errores (`errorId`, 400/401/403/409/500) | M3 | Toasts / `Result<T, AppError>` | Después de M3 | No se “integra” una pantalla. M10–M11 **mapean** estos códigos. Sin M3 no se cablea auth. |
| Test harness / CI | M4 | — | Nunca a UI | Plantilla de smoke; se completa cuando existan login y policies. |
| User/Session + bootstrap CLI | M5 | — | Nunca a UI | Persistencia y CLI. El web sigue en mock hasta que haya HTTP. |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` | M6 | `AuthRepository`, `LoginForm`, `AuthContext`, `credentials: 'include'` previsto | **Después de M6** a nivel de cliente HTTP; **no** activar mock→HTTP de sesión hasta M7 | El swap real es M10. Tras M6 se puede implementar `auth-api.ts` contra el contrato, pero la proyección Mechanic/roles llega en M7. |
| `GET /api/auth/me`, `PATCH /api/auth/me` (perfil propio: name, phone, email, password; no username/rol/active) | M6 (mismo módulo `access`) | `ProfilePage`, `updateOwnProfile` | **Después de M6** (mismo corte que login) | Incluir estos endpoints en M6: el web ya los declara en `endpoint-map.ts`. Feature 01 checklist frontend. |
| Policies `requireRole` / proyección `/session` | M7 | Shell por rol, `policies.ts` (UX, no seguridad) | **Después de M7** | Primera integración de producto: M10. Login real + cookie + 401/403. |
| `POST/GET/PATCH` usuarios Administrator | M8 | `UserTable`, `UserFormModal`, `UserRepository` | **Después de M8** | Integración en M11. Alinear paths web (`/api/users`) vs este plan (`/api/admin/users`) en el cliente HTTP; **la API de este plan es la fuente HTTP**. |
| Eventos `USER_*` | M9 | Sin pantalla R1 | **No integrar UI en R1** | Append en la misma transacción que M8. El exit gate de M11 **verifica** eventos por API/tests, no por una vista nueva. |

### Qué hacer después de cada milestone

| Al terminar | Integrar a web | No integrar todavía |
|---|---|---|
| **M1** (hecho) | Health stub si la app era el placeholder | Auth, usuarios |
| **M2** (hecho) | Nada de producto. Health ready queda para CI/manual | Auth, usuarios. El prototipo web sigue 100 % mock |
| **M3** | Nada de pantallas. Deja el contrato de error que M10–M11 consumirán | Login HTTP |
| **M4** | Nada de UI | Login HTTP (los tests de smoke auth esperan M6–M7) |
| **M5** | Nada de UI. Bootstrap CLI crea el admin real para pruebas posteriores | Login HTTP |
| **M6** | **Preparar** `HttpAuthRepository` (login/logout/session/me/profile). Aún no poner `VITE_USE_MOCK_API=false` como default | Shell por rol contra proyección incompleta; usuarios admin |
| **M7** | Auth **queda integrable** (login/sesión/perfil/shell). En este plan el swap se hace en M10, después de M8, para probar los 3 roles con usuarios reales | `/users` (falta M8); cualquier pantalla R2+ |
| **M8** | Usuarios admin **quedan integrables**. El swap se hace en M11 (tras M10) | History UI; facturación |
| **M9** | Nada de UI nueva | Recovery/diagnostics (Release 8) |
| **M10** | Auth HTTP verificado en browser (3 roles) | Gestión de usuarios si M8 no está |
| **M11** | Usuarios HTTP + exit gate R1 | Release 2 (clientes/facturas) |

**Release 1 cerrado:** solo Access/Users (+ health + envelope de history) habla con API real. El resto del prototipo permanece mock hasta su release en [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md).

## Diagrama de dependencias

```mermaid
flowchart TD
  M1[M1 Scaffold monorepo]
  M2[M2 PostgreSQL Prisma health]
  M3[M3 Errores logging validacion]
  M4[M4 Test harness CI]
  M5[M5 Modelo User Session bootstrap]
  M6[M6 Autenticacion login logout]
  M7[M7 Autorizacion policies]
  M8[M8 User management backend]
  M9[M9 History envelope R1]
  M10[M10 Integrar auth HTTP]
  M11[M11 Integrar users HTTP + exit gate]

  M1 --> M2 --> M3 --> M4
  M2 --> M5 --> M6 --> M7 --> M8
  M5 --> M9
  M8 --> M9
  M3 --> M10
  M6 --> M10
  M7 --> M10
  M8 --> M11
  M9 --> M11
  M10 --> M11
```

## Milestones — estado

| ID | Milestone | Estado | Integración web |
|---|---|---|---|
| M1 | Scaffold monorepo FE/BE + convenciones + health stub | completado | Health stub (histórico; ya no es UI de producto) |
| M2 | PostgreSQL + Prisma + health readiness | completado | **Nada de producto.** Health solo CI/ops |
| M3 | Errores, logging, validación HTTP | completado | Contrato de errores; aún sin pantallas HTTP |
| M4 | Test harness + CI baseline (smoke R1) | completado | Ninguna |
| M5 | Modelo User/Session + bootstrap CLI admin | completado en local | Ninguna (CLI, no HTTP) |
| M6 | Login/logout/sesiones + perfil propio (AUTH-001) | completado en local | Cliente HTTP auth **preparable**; swap no default |
| M7 | Autorización server-side (AUTH-002/005) | completado en local | **Listo para M10** (auth + shell); swap no default |
| M8 | User management backend (AUTH-003/004) | completado en local | **Listo para M11** (`/users`) |
| M9 | History envelope R1 + eventos de usuarios | completado en local | Sin UI R1; tests/API en el exit gate |
| M10 | Integrar auth HTTP (login/sesión/perfil/shell) | completado en local | Swap `AuthRepository` mock → HTTP |
| M11 | Integrar users HTTP + exit gate Release 1 | completado y verificado en local | Swap `UserRepository` mock → HTTP completado |

---

## Milestone 1 — Scaffold monorepo y convenciones

**Objetivo:** Crear la estructura mínima ejecutable del monolito modular (frontend + backend) con TypeScript, scripts de desarrollo y convención feature-based.

**Alcance:**
- `apps/web/` — React + Vite + TypeScript
- `apps/api/` — Node.js + Express + TypeScript
- ESLint + Prettier + `tsconfig` estricto
- Scripts: `dev`, `build`, `lint`, `typecheck`
- `.gitignore`, `.env.example` (nombres, sin secretos)
- README mínimo de arranque local

**Principales cambios esperados:**
- `package.json` raíz (npm workspaces recomendado)
- Express app vacía + Vite app placeholder
- Convención `feature/{routes,controller,service,repository,validation,types}` con stub `health`

**Dependencias / decisiones:**
- Same-origin en despliegue futuro; en local: proxy Vite → API o puertos coordinados

**Pruebas:**
- `npm run typecheck` y `npm run build` pasan
- Smoke manual: health stub responde

**Definición de terminado:**
- Clonar, instalar, ejecutar FE+BE en local, ver health check.
- Sin lógica de negocio ni BD.

**Integración web:** En su momento el placeholder consultaba `/api/health`. Ese UI ya no existe. No hay más que cablear de M1.

---

## Milestone 2 — PostgreSQL, Prisma y conectividad

**Objetivo:** Persistencia PostgreSQL local con Prisma, migraciones y health readiness.

**Alcance:**
- Cliente Prisma singleton + cierre graceful
- Migración inicial
- `GET /health/live` y `GET /health/ready`
- PostgreSQL local nativo o contenedor

**Principales cambios esperados:**
- `apps/api/src/infrastructure/database/`
- `DATABASE_URL` en `.env.example`
- Scripts `db:migrate`, `db:generate`

**Pruebas:**
- Integration: readiness falla sin BD, pasa con BD
- Migración aplicable en BD limpia

**Definición de terminado:**
- API reporta readiness real contra PostgreSQL local.
- Migraciones reproducibles desde cero.

**Integración web (después de M2 — estado actual):** **No se integra Access/Users.** Health live/ready quedan para smoke y diagnóstico. El prototipo web sigue enteramente en mock. No poner `VITE_USE_MOCK_API=false`.

---

## Milestone 3 — Errores, logging, validación HTTP

**Objetivo:** Infraestructura transversal: errores, middleware, logs estructurados, validación runtime.

**Alcance:**
- Taxonomía de errores de aplicación
- Correlation/request ID, error mapper, secure headers básicos
- Logger estructurado (Pino recomendado)
- Convención Zod en `validation/` por feature
- Respuestas con `errorId` seguro al cliente

**Pruebas:**
- Unit: mapeo error → status HTTP
- Integration: 400 consistente; 500 genérico + errorId

**Definición de terminado:**
- Pipeline estándar request → validate → controller → service operativo.
- Logs correlacionables por request ID.

**Integración web (después de M3):** **Aún no hay pantallas HTTP.** Este milestone desbloquea el mapeo de `errorId` / 400 / 401 / 403 / 409 / 500 que M10–M11 usarán. Sin este contrato no se cablea login.

---

## Milestone 4 — Test harness y CI baseline

**Estado:** completado (local 2026-09-03; GitHub 2026-09-07).

**Avance local:** aislamiento de `DATABASE_URL_TEST`, fallo explícito si PostgreSQL
no está disponible, preparación global de integración con reset de la BD desechable
y reaplicación de migraciones, health real y respuestas HTTP negativas verificadas.
La suite API pasa con 43 pruebas unitarias y 15 de integración; el monorepo suma 501 pruebas.
Workflow GitHub Actions y smoke R1 documentados en
[`milestone-4-ci.md`](milestone-4-ci.md). El owner confirmó el 2026-09-07 que la
parte GitHub de M4 quedó lista: ejecución de **CI R1** y check obligatorio
`R1 quality`. Se corrigieron las dependencias identificadas: `deepmerge-ts 8.0.0`
mediante override limitado a `@prisma/config@6.19.3`, y `qs 6.16.0`. npm 11.19.1
queda fijado para aplicar el override correctamente en workspaces. La instalación
limpia, Prisma, pruebas, typecheck, lint y build pasan. El 2026-09-04,
`npm audit --audit-level=high` completó correctamente con cero vulnerabilidades.
El gate de auditoría permanece obligatorio.

**Objetivo:** Unit + integration contra PostgreSQL real; CI sin despliegue.

**Alcance:**
- Vitest (o Jest) + Supertest
- BD de test separada (`DATABASE_URL_TEST`)
- GitHub Actions: install → lint → typecheck → unit → integration → build
- **Smoke R1 en CI:** migraciones, `/health/live`, `/health/ready`, login, sesión, autorización (cuando existan en milestones posteriores; plantilla lista desde M4, completada en M6–M7)

**Pruebas:**
- CI verde
- Integration test health/ready como plantilla

**Definición de terminado:**
- CI bloquea merge si falla typecheck o tests.
- Smoke scope R1 documentado y automatizable.

**Integración web (después de M4):** Ninguna. El smoke de login/sesión se rellena cuando existan M6–M7; no adelantar UI.

---

## Milestone 5 — Modelo User + Session + bootstrap CLI

**Avance — paso 2 implementado:** modelos Prisma `User`, `Session` y enum `Role`,
con UUID generados en PostgreSQL, timestamps con zona horaria, índices y FK con
borrado restringido. La migración exige usernames no vacíos, en minúsculas y sin
espacios exteriores; `Session` almacena `tokenHash` único. Restricciones verificadas
con pruebas de integración sobre PostgreSQL.

**Avance — paso 3 implementado:** validación Zod reutilizable para creación de
usuarios: nombre requerido, username normalizado, roles cerrados y contacto opcional
(vacío a `null`, email validado). Se rechazan campos ajenos al input de creación.
Contraseña de al menos 6 caracteres Unicode, sin transformaciones ni complejidad
adicional. Hashing/verificación con Argon2id (19 MiB, 2 iteraciones, paralelismo 1),
salt aleatorio por hash y errores internos sin secretos. Pruebas unitarias con
Argon2 real.

**Avance — paso 4 implementado:** `UserRepository` compartible por `access` y `users`,
con creación a partir de passwordHash, consultas por ID/username, comprobación de
existencia incluyendo inactivos y actualización de active sin borrado. Acepta cliente
Prisma de transacción; commit y rollback verificados contra PostgreSQL, junto con
unicidad y conservación de identidad. Devuelve registros internos con hash, que no
deben exponerse en HTTP ni logs. Validación, autorización, hashing e invalidación de
sesiones se coordinan desde servicios.

**Avance — paso 5 implementado:** `SessionRepository` permite crear sesiones con
tokenHash, userId y expiresAt, consultar por hash, revocar una sesión o todas las de
un usuario. Las revocaciones son idempotentes y devuelven el número de registros
eliminados. Acepta cliente transaccional; persistencia, aislamiento entre usuarios y
rollback conjunto con cambios de usuario probados en PostgreSQL. La consulta devuelve
el registro persistido, incluso expirado: expiración y estado activo se validarán en
el servicio de autenticación de M6. No se generan tokens ni cookies todavía.

**Avance — paso 6 implementado:** `npm run bootstrap:admin` solicita datos y contraseña
oculta con confirmación, sin argumentos ni entrada por pipes. Crea un Administrator
activo, con Argon2id, solo si no existe ningún usuario; comprobación y creación en
transacción serializable, con rechazo seguro de conflictos concurrentes. Sin sesión,
sin credenciales predefinidas ni secretos en salida; cierre de conexión y cancelación
de entrada probados. Pruebas de base vacía, cuenta previa activa/inactiva, validación
y dos bootstraps simultáneos. Uso documentado en README. No se creó administrador
de desarrollo durante la implementación.

**Paso 7 — verificación local completada (2026-09-04):** 580 pruebas aprobadas
(85 unitarias API, 52 integración API y 443 web), typecheck de aplicaciones y tests,
lint sin errores y build de ambos workspaces correctos. Migraciones reaplicadas desde
cero únicamente en la base de pruebas. Se mantienen 4 advertencias de lint web y la
advertencia de tamaño del bundle web. El 2026-09-04,
`npm audit --audit-level=high` completó correctamente con cero vulnerabilidades;
esto no equivale a una ejecución aprobada del workflow remoto de CI.
Evidencia y límites en [`milestone-5-verification.md`](milestone-5-verification.md).
M5 cumple su definición de terminado local. M4 quedó cerrado en GitHub el 2026-09-07.

**Objetivo:** Modelar usuarios, roles, sesiones y bootstrap del primer Administrator.

**Alcance:**
- Campos MVP confirmados: `name`, `username` (unique), `phone?`, `email?`, `role`, `active`, `passwordHash`, `createdAt`, `updatedAt`
- Enum rol: `ADMINISTRATOR`, `SELLER`, `MECHANIC`
- Tabla `Session`: token opaco, `userId`, `expiresAt`
- Repositorios en módulos `access` y `users` (compartiendo modelo User)
- **CLI bootstrap one-shot:** crea primer Administrator solo si no existen usuarios; rechaza si ya hay usuarios; sin credenciales hardcodeadas de producción
- Validación contraseña: mínimo 6 caracteres

**Dependencias / decisiones:**
- Argon2id implementado: 19 MiB de memoria, 2 iteraciones y paralelismo 1; salt aleatorio por hash.

**Pruebas:**
- Unique constraint en `username`
- Usuario inactive no borrado físicamente
- Bootstrap exitoso en BD vacía; rechazo si ya hay usuarios

**Definición de terminado:**
- Migración User + Session con FKs e índices.
- Bootstrap CLI documentado y testeado.
- Repositorios testeados sin HTTP de auth aún.

**Integración web (después de M5):** Ninguna. No hay rutas HTTP. El CLI deja el primer Administrator para cuando M6 exista; el login de la web sigue siendo mock (`admin` / `demo1234` no es el usuario de PostgreSQL).

---

## Milestone 6 — Autenticación: login, logout, sesiones (AUTH-001)

**Objetivo:** Login por `username` + password; sesiones same-origin con cookie HttpOnly.

**Alcance:**
- `POST /api/auth/login` — verificación credenciales, sesión nueva, rotación
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/auth/me` — usuario de la sesión (sin `passwordHash`)
- `PATCH /api/auth/me` — perfil propio: `name`, `phone?`, `email?`, cambio de password (mínimo 6; requiere password actual). **No** acepta `username`, `role` ni `active` del cliente (eso es M8 / `users.manage`)
- Cookie: `HttpOnly`, `SameSite` explícito; `Secure` solo en despliegue HTTPS futuro
- Sesiones en PostgreSQL
- Rate limiting + mensaje genérico en login fallido
- Rechazar login si cuenta inactive
- Middleware `requireAuth` + recheck active user

**Dependencias / decisiones:**
- CSRF para mutaciones — decidir en plan del milestone

**Pruebas:**
- Login válido → cookie + session OK
- Credenciales inválidas / inactive → rechazo
- Logout invalida sesión
- Sin password/hash en responses ni logs
- PATCH propio: actualiza contacto; rechaza username/rol/active; password corta o actual incorrecta → 400

**Definición de terminado:**
- AUTH-001 cubierto por tests automatizados vía API.
- Perfil propio cubierto por tests (validación + rechazo de campos de cuenta).

**Integración web (después de M6):** **Preparable, no default.** Implementar `apps/web/src/api/client/auth-api.ts` contra estos paths. No activar `VITE_USE_MOCK_API=false` hasta M7/M10: falta proyección por rol y denegaciones 403. No cablear `/users`.

---

## Milestone 7 — Autorización server-side (AUTH-002, AUTH-005)

**Avance — implementado (2026-09-04):** `requireRole` / `requireAdministrator` después de `requireAuth`
(401 sin sesión, 403 rol insuficiente). `GET /api/auth/session` proyecta Mechanic como identidad
mínima y Seller/Administrator con contacto propio; `/me` sigue siendo perfil propio para todos
los roles. `GET /api/auth/admin-probe` es un placeholder admin-only hasta M8. Tests unitarios e
integración cubren denegaciones y proyección. La proyección completa de Work Orders (WO-003)
queda para el release de OT. El prototipo web permanece en mock.

**Objetivo:** Enforcement de roles en servidor; base para matriz de [`../ROLES_AND_PERMISSIONS.md`](../ROLES_AND_PERMISSIONS.md).

**Alcance:**
- Helpers/policies: `requireRole(...)`, `requireAdministrator`
- Proyección mínima por rol en `/api/auth/session`:
  - Mechanic: solo datos mínimos de sesión (`id`, `username`, `name`, `role`) — **sin datos comerciales**
  - Seller/Administrator: proyección de perfil acorde al rol
- Rutas protegidas placeholder para tests negativos
- Documentar que proyección WO completa queda para release de Work Orders

**Pruebas:**
- Seller/Mechanic → 403 en ruta admin-only
- Administrator → 200
- Request sin sesión → 401

**Definición de terminado:**
- Tests negativos de rol vía Supertest.
- Mechanic verificado solo con proyección mínima + denegaciones.

**Integración web (después de M7):** **Sí — ejecutar M10.** Login, logout, sesión, perfil propio y shell por rol pueden dejar el mock. Mechanic no recibe datos comerciales en `/session` (proyección mínima). `GET /me` es perfil propio para todos los roles, incluido contacto (`phone`/`email`/`active`), según Feature 01. `/users` espera M8.

---

## Milestone 8 — Gestión de usuarios Administrator (backend, AUTH-003/004)

**Estado:** completado y verificado localmente (2026-09-05). Alcance final según decisiones del owner: cuentas existentes sin cambio obligatorio; recuperación solicitada y aprobada por otro administrador; contraseña temporal sin vencimiento.

**Objetivo cumplido:** administración HTTP de cuentas, desactivación sin borrado, primer acceso restringido, cambio propio de contraseña y recuperación autorizada. Implementación y contrato detallados en [`milestone-8-verification.md`](milestone-8-verification.md); evidencia de cierre en [`../done_api/release-1.md`](../done_api/release-1.md).

**Endpoints entregados:**
- `POST /api/admin/users`: name, username, role y contacto opcional; sin contraseña elegida por Administrator. Servidor asigna `solocamiones` y `mustChangePassword=true`.
- `GET /api/admin/users`: listado paginado, incluye inactivos.
- `PATCH /api/admin/users/:id`: perfil, username, rol y estado; rechaza credenciales y manipulación del flag.
- `POST /api/auth/recovery-requests`: solicitud pública por username, respuesta genérica, rate limit y una pendiente por usuario; vence a las 24 horas.
- `GET /api/admin/users/recovery-requests`: solicitudes pendientes vigentes, paginadas.
- `POST /api/admin/users/recovery-requests/:id/resolve`: otro Administrator aprueba con `identityVerified=true` o rechaza. Al aprobar el sistema genera contraseña temporal aleatoria, sin vencimiento, devuelta una sola vez para entrega personal.

**Reglas implementadas:**
- Solo Administrator activo y sin cambio pendiente administra cuentas/solicitudes; autorización repetida dentro del servicio.
- Ningún administrador puede desactivarse, quitarse su rol o resolver su propia solicitud. Las transacciones protegen la permanencia de un Administrator activo ante concurrencia.
- Cuentas existentes y bootstrap conservan contraseña y flag false. Activación/rol no restablecen credenciales ni eliminan restricciones pendientes.
- Login/session/me incluyen `mustChangePassword` para los tres roles. El guard bloquea operaciones normales hasta cambiar contraseña; permite perfil, sesión y logout.
- Todo cambio desde perfil requiere contraseña actual y nueva distinta, mínimo seis caracteres Unicode; guarda hash, elimina flag, revoca todas las sesiones y cancela solicitudes pendientes atómicamente. Limpia cookie y exige nuevo login.
- Recuperación aprobada guarda hash temporal, establece flag, revoca sesiones y consume solicitud dentro de una transacción. No existe reset libre ni contraseña elegida por Administrator.
- Desactivar conserva identidad/hash, revoca sesiones y cancela solicitudes; reactivar no recupera sesiones ni modifica flag.
- No hay correo, comando local de recuperación ni obligación de segundo Administrator. Si el único administrador pierde acceso, la aplicación no ofrece recuperación para él.

**Persistencia:** migración aditiva User.mustChangePassword + PasswordRecoveryRequest con FK restrictivas e índice único parcial para pendientes. Repositorios transaccionales reutilizados; errores HTTP M3 y CSRF en escrituras autenticadas. No se guardan contraseñas en texto plano ni en solicitudes/logs.

**Pruebas:** unitarias de validación/policies; integraciones PostgreSQL/HTTP de tres roles, primer acceso, cambio voluntario/obligatorio, recuperación, vencimiento de solicitud, contraseña temporal sin vencimiento, concurrencia, rollback, unicidad, paginación, secretos excluidos y desactivación. Integraciones M6–M7 también ejecutadas en el cierre.

**Definición de terminado:** API usable y verificada sin frontend. History queda en M9. Evidencia y cifras finales en release-1.

**Integración web pendiente:** M10 adapta perfil/login/solicitud de recuperación; M11 conecta administración y resolución de solicitudes y elimina contraseña del formulario. M8 no modifica frontend ni activa HTTP web.

---
## Milestone 9 — History mínimo Release 1 (HIST-001/002 slice)

**Estado:** completado y verificado localmente (2026-09-05). Evidencia en [`milestone-9-verification.md`](milestone-9-verification.md).

**Objetivo:** Envelope reutilizable + eventos de administración de usuarios.

**Alcance:**
- Tabla `HistoryEvent`: UUID, `occurredAt`, `actorType`, `actorUserId` (FK User para actores autenticados; null para ANONYMOUS/SYSTEM), `eventType`, `subjectType`, `subjectId`, `payload` JSONB.
- Tipos R1: `USER_CREATED`, `USER_ROLE_CHANGED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `USER_PROFILE_CHANGED`, `USER_PASSWORD_CHANGED` y `USER_RECOVERY_REQUESTED/APPROVED/REJECTED/EXPIRED/CANCELLED`.
- Decisiones aprobadas por el owner: perfil con valores anteriores/nuevos (name, username, phone, email); cambio propio de contraseña obligatorio/voluntario solo con metadata; bootstrap con actor SYSTEM y origen CLI; solicitudes públicas con actor ANONYMOUS; vencimientos SYSTEM; cancelaciones con actor y motivo. Sin backfill de acontecimientos desconocidos.
- Append en misma transacción que mutación de usuario
- Actor desactivado sigue resolviendo en lectura histórica
- Validación estricta por evento y payload; repositorio interno solo append; trigger PostgreSQL rechaza UPDATE/DELETE. No-op no genera evento de cambio.

**Pruebas:**
- Crear/desactivar → eventos append-only
- Actor desactivado resoluble en eventos previos
- Operación fallida → sin evento de éxito

**Definición de terminado:**
- AUTH-004 + HIST-002 demostrables con integration test.
- Sin recuperación operativa/diagnósticos de Release 8 ni eventos de otros dominios. Recuperación de contraseña M8 sí incluida.

**Integración web (después de M9):** **Ninguna pantalla nueva.** Release 1 no tiene timeline de usuarios. M11 comprueba eventos con tests/API (crear/desactivar produce `USER_*`). La recuperación operacional y los diagnósticos del prototipo siguen en mock (Release 8); esto no se refiere a la recuperación de contraseña de Feature 01, integrada en M11.

---

## Milestone 10 — Integrar auth HTTP: login, sesión, perfil y shell

**Avance:** completado en local. 708 pruebas aprobadas, typecheck/lint/build correctos y flujos de navegador verificados con participación del usuario para introducir contraseñas nuevas. Detalle en [`milestone-10-verification.md`](milestone-10-verification.md).

**Transición aprobada para M10:** Usuarios queda temporalmente no disponible en modo HTTP hasta M11; se conserva en modo mock. El modo HTTP limita navegación a acceso/perfil y no consulta KPIs ni pantallas de releases posteriores. El prototipo completo permanece disponible con `VITE_USE_MOCK_API=true`.

**Objetivo:** Sustituir el mock de `AuthRepository` por la API de M6–M7. La UI de login/shell/perfil **ya existe** (prototipo WM2 + perfil); se adapta al cambio obligatorio añadido en M8.

**Alcance:**
- Implementar `HttpAuthRepository` / `auth-api.ts`: login, logout, session, me, `updateOwnProfile`
- `credentials: 'include'` y manejo de cookie HttpOnly
- Mapear 401 (sesión expirada / inactive) y errores de validación a la UX existente
- Consumir `mustChangePassword` en login/session/me: redirigir al perfil propio y bloquear navegación operativa mientras esté pendiente, incluso tras recarga o acceso por URL. Permitir logout. La API M8 aplica la misma restricción.
- Solicitud de recuperación desde login: username, confirmación genérica y manejo de 429; consumir contrato M8 sin revelar existencia de cuentas.
- Perfil en primer acceso: contraseña actual, nueva y confirmación; explicar que debe cambiar la inicial. Al completar, limpiar estado autenticado y volver a login con la nueva contraseña porque M8 revoca todas las sesiones.
- App shell por rol usando la proyección de `/api/auth/session` (Admin → Users en nav; Seller/Mechanic shells ya montados)
- Mechanic: sin datos comerciales en la sesión HTTP
- Route guards UX complementarios (la seguridad sigue en el servidor)
- Verificación en browser obligatoria
- Default de desarrollo puede seguir en mock hasta que este milestone esté verde; entonces auth R1 usa API real

**Pruebas:**
- Browser: login/logout por 3 roles con usuarios de bootstrap/M8 (no las credenciales demo del mock)
- Mechanic no ve nav admin/comercial
- Perfil propio persiste tras recargar
- Browser: primer acceso de los tres roles obliga a cambiar contraseña; errores mantienen la restricción; completar exige nuevo login y permite después el shell correspondiente.

**Definición de terminado:**
- Checklist frontend Feature 01 de login/logout/session/nav/perfil contra API local.
- Inventario, ventas, clientes, OT, etc. **siguen en mock**.

**Integración web (este milestone):** **Hacer el swap de auth.** No swap de `UserRepository` si M8 no está cerrado.

---

## Milestone 11 — Integrar users HTTP + exit gate Release 1

**Avance:** completado y verificado localmente (2026-09-07). Las pruebas automatizadas aprobaron y el owner confirmó que pasó íntegramente la verificación manual de navegador del exit gate.

**Objetivo:** Sustituir el mock de `UserRepository` por la API de M8 y cerrar Release 1 en local.

**Alcance:**
- `HttpUserRepository`: list → `GET /api/admin/users`; create → `POST`; update/deactivate/role → `PATCH /api/admin/users/:id`
- Listado: `name`, `username`, rol, estado, phone/email si existen
- Quitar contraseña de creación/edición en `UserFormModal`, contratos y adaptadores de usuarios, incluidos mocks usados por pruebas. No ofrecer reset libre; agregar atención de solicitudes de recuperación y entrega única de contraseña temporal generada por el sistema. Informar al crear que la contraseña inicial es `solocamiones` y debe cambiarse al entrar; no obtenerla de una respuesta API.
- Errores 409/403/validation en la UI existente (`UserFormModal` / toasts)
- Actualizar checklists Feature 01 y slice R1 de Feature 14
- Confirmar que history `USER_*` se escribe (tests/API), sin pantalla nueva de historial

**Pruebas:**
- Browser E2E local: Admin crea Seller sin elegir contraseña; Seller entra con `solocamiones`, cambia desde perfil, vuelve a iniciar sesión y obtiene acceso; Admin desactiva y login falla.
- Seller intenta ruta admin → 403 API + UX coherente
- Suite CI smoke R1 completa: migraciones, health, login, sesión, autorización
- Feature 01 acceptance criteria verificables end-to-end en local

**Definición de terminado (exit gate Release 1):**
- Access and Users completamente funcional y probado en **entorno local**.
- Roles autentican localmente; requests directos no autorizados fallan.
- Migraciones limpias en BD local fresca.
- **Último milestone de Release 1.** No iniciar implementación de API de Release 2 hasta aprobación explícita. Las pantallas R2+ del prototipo permanecen mock.

**Integración web (este milestone):** **Hacer el swap de usuarios.** Nada de clientes, facturas ni inventario.

---

## Orden de ejecución

Secuencial: **M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11**.

El prototipo web no es dependencia: M10/M11 incluyen swaps HTTP y las adaptaciones de contraseña inicial definidas en M8. En la secuencia de este plan, M10 va **después de M8** para poder verificar Administrator, Seller y Mechanic con cuentas de PostgreSQL (el CLI de M5 solo crea el primer Administrator). M11 espera M8 + M10; M9 debe estar hecho para el exit gate (eventos), no para pintar `/users`.

Tras **cerrar Release 1**, la siguiente integración web de negocio es Release 2 (clientes/facturas), no un cableado anticipado del prototipo.

## Qué NO planificar aquí

- Clientes, facturas, inventario, reservas, pagos, Work Orders, fotos, PDFs, CxC, CxP
- Staging, producción, hosting, RPO/RTO, backups gestionados, rollback productivo (→ antes del primer despliegue, post Release 2)

## Próximo paso

**Milestone 11:** completado. La integración HTTP de administración de usuarios y recuperación está implementada, cubierta automáticamente y validada manualmente en navegador por el owner.

**Milestone 4:** cerrado. CI GitHub y el check obligatorio `R1 quality` están verificados.

Auth, perfil, usuarios y recuperación de contraseña usan HTTP con `VITE_USE_MOCK_API=false`. Los módulos de Release 2+ se planifican en [`plan_release_2.md`](plan_release_2.md); el prototipo completo se conserva con `true`.

Antes de seguir, asegúrate de tener `.env` con un `DATABASE_URL` válido, la base `truck_parts_dev` creada, y haber corrido:

```bash
npm run db:migrate:deploy
```

Luego `GET /api/health/ready` debe responder `200` con `"database": "up"`.
