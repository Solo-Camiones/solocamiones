# Milestone 12 — WM12: Rentabilidad, recuperación, escenarios demo y preparación API

| Campo          | Valor                                                           |
| -------------- | --------------------------------------------------------------- |
| **ID plan**    | WM12                                                            |
| **Estado**     | Completado                                                      |
| **Fecha**      | 2026-09-01                                                      |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM12 |
| **Alcance**    | `/profitability`, `/recovery`, 12 escenarios demo, `VITE_USE_MOCK_API` + `Http*Repository` |
| **Siguiente**  | Integración HTTP milestone a milestone cuando existan los endpoints API |

---

## 1. Objetivo

Cerrar el prototipo: rentabilidad USD con tasa demo y reintento, recuperación de reservas abandonadas, runner de 12 escenarios (sin bypass de login) y un composition root para que las features no importen `mocks/`.

## 2. Contexto previo

WM11 dejó catálogos y usuarios sobre el mismo `AppState`. `FAC-000096` ya estaba USD con `profitabilityPendingFx`. `INV-DRAFT-01` reservaba `ALT-004`. Las features importaban `mock*Repository` directo. `/profitability` y `/recovery` eran placeholders.

## 3. Decisiones clave

### 3.1 Enrichment secundario, no venta

**Decisión:** `applyUsdProfitability` corre después de confirmar. `costUsd = storedCostDop / exchangeRateDopPerUsd`. Sin tasa: `PENDING FX RATE`. El toggle demo no recalcula resultados ya persistidos; hay que reintentar.

**Por qué:** COST-003. Una tasa en vivo posterior no puede reescribir un resultado. El retry no toca pagos, inventario ni el número `FAC-`.

### 3.2 Liberar reserva = descartar borrador auditado

**Decisión:** `releaseAbandonedReservation` exige `recovery.manage`, motivo y un mínimo de seis horas desde `createdAt`; reutiliza `discardDraft` (suelta pieza y cantidad) y añade `RESERVATION_RELEASED`. El umbral solo habilita recuperación y nunca libera automáticamente.

**Por qué:** RES-003 / ADMIN-002. No es un editor de `reservedByDraftId`. El vendedor sigue pudiendo descartar por POS; la recuperación es la operación nombrada de administrador.

### 3.3 Features → `api/repositories.ts`

**Decisión:** Un composition root elige mock o `Http*Repository` según `VITE_USE_MOCK_API !== 'false'`. `getSession` HTTP devuelve `ok(null)` para que `/login` monte. El mapa de endpoints vive en `api/client/endpoint-map.ts`.

**Por qué:** Criterio WM12: con flag en `false` la app arranca y las features no importan `mocks/`. Los stubs no lanzan en bootstrap.

### 3.4 Escenarios reinician, no autentican

**Decisión:** Cada escenario hace reset + preparación/verificación del seed y deja un hint de credenciales en `sessionStorage`. El usuario escribe el login. El escenario 5 descarta el borrador seed y prepara un borrador limpio con `MOT-003`, sin órdenes activas que bloqueen la venta completa.

**Por qué:** Misma regla WM2: demo-controls nunca hacen `loginAs`.

## 4. Archivos principales

```text
apps/web/src/
├── api/repositories.ts
├── api/http/repositories.ts
├── api/client/endpoint-map.ts
├── api/contracts/profitability.ts
├── api/contracts/recovery.ts
├── mocks/services/usd-profitability.ts
├── mocks/services/profitability-commands.ts
├── mocks/services/recovery-commands.ts
├── mocks/scenarios/index.ts
├── features/profitability/ProfitabilityPage.tsx
├── features/admin-recovery/AdminRecoveryPage.tsx
└── shared/layout/ScenarioRunner.tsx
```

## 5. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| 12 escenarios sin error | ✅ `runDemoScenario(1..12)` |
| FAC-000096 pendiente FX hasta toggle + reintentar | ✅ 42000/61.50 → utilidad USD |
| Liberar reserva descarta borrador y libera pieza | ✅ `INV-DRAFT-01` / `ALT-004`, solo desde 6 horas |
| Corrección de moneda invalida ganancia manual obsoleta | ✅ conserva el valor anterior en el evento correctivo |
| Escenario 5 permite confirmar ensamblaje completo | ✅ borrador limpio con `MOT-003` y su subárbol |
| `VITE_USE_MOCK_API=false` arranca sin importar mocks en features | ✅ composition root + test de imports |
| Walkthrough Part A/B/C reproducible | ✅ seed + escenarios 1, 7, 11–12 y flujos WM8–WM11 |
| Checklist endurecimiento completado | ✅ policies en servicio, proyecciones por rol, demo sin bypass |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npm test -w @solocamiones/web
```

Resultado: 47 archivos de prueba frontend y 295 pruebas aprobadas.

**Flujos manuales:**

1. Login `admin` / `demo1234` → Rentabilidad: `FAC-000096` Pendiente FX. Activar tasa FX (demo) → Reintentar → utilidad persistida con tasa 61.50. El toggle inverso no borra ese resultado.
2. Recuperación → Liberar `INV-DRAFT-01` con motivo → `ALT-004` deja de estar reservada y el borrador desaparece.
3. Header → cargar escenario 11 → logout forzado → login muestra hint `admin` / `demo1234`.
4. Login `laura` → `/profitability` no autorizado; el repositorio también es `FORBIDDEN`.

No hay herramientas de navegador en esta sesión; la UI se verificó con pruebas de componente (rentabilidad FX + liberación de reserva).

## 7. Fuera de alcance

- Backend, Prisma, sesiones HTTP reales, proveedor FX de producción.
- Regeneración de PDF y recuperación de evidencia (ADMIN-002 restante).
- Controles demo en build productivo (`import.meta.env.DEV` o `VITE_ENABLE_DEMO_CONTROLS`).

## 8. Handoff

El prototipo web del plan 001 está cerrado. Los registros de implementación posteriores de frontend (hardening UX) viven en [`docs/done_web/UX_FRONTEND_HARDENING/`](../UX_FRONTEND_HARDENING/). El swap a API real se hace repositorio a repositorio: `VITE_USE_MOCK_API=false` ya selecciona `Http*Repository`; implementar esos métodos contra Express cuando existan M10+.
