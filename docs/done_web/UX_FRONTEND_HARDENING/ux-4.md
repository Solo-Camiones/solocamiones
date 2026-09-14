# Milestone UX-4 — Inventario: jerarquía visual e interacción

| Campo | Valor |
|---|---|
| **ID plan** | UX-4 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-4 |
| **Alcance** | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-5 — Ventas/POS: prevención de errores y claridad |

---

## 1. Objetivo

Hacer legible el estado de inventario **sin fusionar conceptos** (INV-003): disponibilidad comercial, relación física, completitud, reserva y `No desarmar` siguen siendo independientes. Las filas de listado siguen abriendo el detalle al pulsar cualquier celda; el enlace de ID/nombre/documento cubre teclado y “abrir en pestaña”.

El corte de negocio sigue siendo **Release 1 ACTIVE**. Inventario, reservas, jerarquía y OT permanecen detrás de capabilities.

## 2. Qué se entregó

### Jerarquía visual (inventario)

| Capa | Qué se muestra | Tratamiento |
|---|---|---|
| Principal | `Disponible` | Texto seminegrita, no chip |
| Excepción comercial | `Vendido`, `No disponible` | Chip danger / amber |
| Contexto | `Instalado en [padre]`, `Por cantidad`, `Ensamblaje` | Texto secundario (SEARCH-002) |
| Excepción | `Incompleto`, `Reservado`, `No desarmar`, trabajo físico activo | Chip amber o danger |

No se pinta `Independiente`, `Completo` ni `Pieza`: son el caso normal. El listado compacta reserva/`No desarmar` (sin id de borrador ni raíz); el detalle conserva esa referencia.

### Tablas

El listado usa filas etiquetadas `Comercial` / `Físico` / `Atención` para escanear en vertical. Independiente se muestra en Físico para alinear el slot. El detalle añade Tipo y Completitud, y no duplica el padre en otro bloque.

Columna `Stock` del listado de inventario se movió al bloque de estado (solo productos por cantidad). Tipo de OT y tipo de categoría pasan a texto, no a chip de alerta.

## 3. Archivos principales

```text
apps/web/src/shared/domain/status-hierarchy.ts
apps/web/src/shared/domain/StatusChips.tsx
apps/web/src/shared/ui/DataTable.tsx
apps/web/src/features/inventory/InventoryTable.tsx
apps/web/src/features/inventory/StatusPanel.tsx
apps/web/src/features/inventory/HierarchyTree.tsx
apps/web/src/features/sales/SalesTable.tsx
apps/web/src/features/users/UserTable.tsx
apps/web/src/features/work-orders/WorkOrderTable.tsx
apps/web/tests/unit/shared/domain/status-hierarchy.test.ts
apps/web/tests/component/inventory/InventoryPage.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual (preset `prototype`, vendedor o admin): Inventario — MOT-001 muestra `Instalado en Freightliner Cascadia 2018` sin chip Independiente/Completo; MOT-002 `Incompleto`; MOT-003 `No desarmar`; ALT-004 `Reservado`. Click en ubicación o categoría abre el detalle; Tab sigue llegando al nombre. Ventas: click en la fila o en `FAC-000098`. OT: click en la fila abre la orden; el enlace de factura sigue yendo a ventas.

## 5. Fuera de alcance

- UX-5 (jerarquía de acciones del POS, tipos de línea).
- UX-6 / UX-7 (mecánico, sidebar responsive).
- Cambiar reglas de negocio o backend.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-4
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md) Release 4 / 5 / 6
- [`docs/FEATURES/02_INVENTORY.md`](../../FEATURES/02_INVENTORY.md) INV-003, INV-004
- [`docs/FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md`](../../FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md) SEARCH-002
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-3.md`](./ux-3.md)
