# Milestone UX-0 — Capabilities y separación Prototype / Production

| Campo | Valor |
|---|---|
| **ID plan** | UX-0 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-0 |
| **Alcance** | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-2 — Navegación y arquitectura de información |

---

## 1. Objetivo

Evitar que el prototipo muestre pantallas y acciones de releases posteriores como si ya fueran producción. La UI depende de **capabilities** explícitas, no de que el equipo recuerde qué pertenece a cada corte.

Los cortes visibles siguen [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md) (releases 1–8). No hay preset para Release 3B (CxP): sigue `PENDING VALIDATION`.

## 2. Qué se entregó

### Fuente de verdad

- `apps/web/src/shared/config/capabilities.ts` — flags, mapa a cada release, presets acumulativos, tipos de línea POS.
- `apps/web/src/shared/config/CapabilitiesProvider.tsx` — reparte el set activo a la UI (`useAppCapabilities()`).

Los componentes preguntan `capabilities.inventory`, no `if (release >= 4)`.

### Presets

| Preset | Qué habilita (acumulativo) |
|---|---|
| `release-1` | Acceso y `/users` |
| `release-2` | + clientes, ventas no inventario, rentabilidad admin |
| `release-3` | + pagos y cancelación de factura |
| `release-4` | + inventario independiente/cantidad y catálogos (sin jerarquía ni venta de stock) |
| `release-5` | + líneas ITEM/QTY y agregar a borrador |
| `release-6` | + jerarquía, baseline, ensamblajes, No desarmar |
| `release-7` | + órdenes de trabajo y app mecánico |
| `release-8` | + `/recovery` |
| `prototype` | Todo lo anterior + controles demo |

Selección: `VITE_CAPABILITIES_PRESET` (documentado en `.env.example`). Si no se define, el valor es `prototype`.

### Dónde se aplica

- Navegación (`RoleNav`, `AppShell`, `MechanicBottomNav`).
- Rutas (`RouteAccessGuard`, `MechanicRouteGuard`); una URL directa a una función apagada no abre la pantalla.
- Acciones internas: pago, cancelación, rentabilidad, agregar a borrador, OT manual, KPIs del dashboard, registro de ensamblajes.
- Tipos de línea del POS.
- Controles de prototipo: `DemoControls`, panel de credenciales de prueba, hints de escenario. Van con `prototypeControls`, **no** con un release de producción.

En `npm run dev`, `prototypeControls` se enciende si el preset es `prototype`. En un corte `release-1`…`release-8` el panel de credenciales no aparece, salvo `VITE_ENABLE_DEMO_CONTROLS=true`.

## 3. Decisiones

1. **Los presets copian los releases del Development Plan**, no nombres inventados del front (`sales`, `inventory`).
2. **Capabilities y roles son ortogonales.** Primero “¿existe en este corte?”, después “¿este rol puede usarla?”.
3. **El prototipo sigue siendo el default** para no romper el flujo de demo diario.
4. **CxP no tiene capability activa.** No se adelanta UI de Accounts Payable.

## 4. Archivos principales

```text
apps/web/src/shared/config/capabilities.ts
apps/web/src/shared/config/CapabilitiesProvider.tsx
apps/web/src/shared/layout/navigation.ts
apps/web/src/shared/layout/RouteAccessGuard.tsx
apps/web/src/shared/layout/MechanicRouteGuard.tsx
apps/web/src/App.tsx
apps/web/tests/unit/shared/config/capabilities.test.ts
```

## 5. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

En local: `VITE_CAPABILITIES_PRESET=release-1` y reiniciar Vite. Inventario no debe aparecer en el menú; `/inventory` debe quedar bloqueado. El login no debe mostrar usuarios de prueba. Volver a `prototype` (o quitar la variable) restaura el demo completo.

## 6. Fuera de alcance

- UX-1 en adelante.
- Autorización de servidor (esto solo oculta y bloquea UI).
- Accounts Payable.
- Cambiar reglas de inventario, ventas o OT.

## 7. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-0
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md)
- [`docs/done_web/plan-001/`](../plan-001/) — prototipo mock anterior (WM1–WM12)
