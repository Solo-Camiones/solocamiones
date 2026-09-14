# Milestone 9 — WM9: Órdenes de trabajo (escritorio)

| Campo          | Valor                                                          |
| -------------- | -------------------------------------------------------------- |
| **ID plan**    | WM9                                                            |
| **Estado**     | Completado                                                     |
| **Fecha**      | 2026-09-01                                                     |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM9 |
| **Alcance**    | Listado, detalle, OT manual, reasignación y cancelación admin  |
| **Siguiente**  | WM10 — Experiencia Mecánico (móvil)                            |

---

## 1. Objetivo

Sustituir el placeholder de `/work-orders` por la gestión administrativa de desarmes e instalaciones: el administrador filtra por estado, abre el detalle, crea OT manuales y recupera trabajo abandonado (reasignar / cancelar con motivo). Completar el trabajo físico y cambiar la jerarquía sigue siendo WM10.

## 2. Contexto previo

WM8 ya crea o reutiliza una OT de desarme pendiente al confirmar una pieza instalada (`OD-DEMO-064` tras el seed). El inventario ya permitía crear OT manual desde el detalle de ítem. WM9 expone esas mismas órdenes en una pantalla de escritorio y añade reasignación y cancelación con historial.

## 3. Decisiones clave

### 3.1 Escritorio ≠ cola del mecánico

**Decisión:** `list` / `getById` / `createManual` / `reassign` / `cancel` exigen `workOrders.manage` (solo Administrador). `listForMechanic` sigue proyectando `MechanicWorkOrderView` sin factura ni campos comerciales y se reserva para WM10 (`workOrders.take`).

**Por qué:** WO-003. El vendedor no ve OT en el menú y el servicio también lo rechaza. Un enlace desde una factura al detalle de OT solo se muestra al administrador.

### 3.2 Crear no mueve jerarquía

**Decisión:** `createManualDesarme` y `createInstalacion` delegan en `createManualWorkOrder` (inventario). La pieza instalada sigue instalada; la independiente no se adjunta al destino.

**Por qué:** WO-006. El cambio físico ocurre al completar (WM10). Así se puede demostrar el criterio “crear desarme no cambia jerarquía” sin adelantar el flujo del mecánico.

### 3.3 Reasignar y cancelar con motivo

| Acción | Estados | Efecto |
| --- | --- | --- |
| Reasignar | Pendiente o en proceso | Mecánico activo; la OT pasa a En proceso; evento `WORK_ORDER_REASSIGNED` |
| Cancelar pendiente | Pendiente | Motivo obligatorio; no toca inventario |
| Cancelar en proceso | En proceso | Motivo + verificación física explícita (WO-002 / WO-010) |
| Completada | — | Rechazada; el reverso es una OT opuesta |

Carlos Méndez está inactivo en el seed: no aparece en el selector y una reasignación a `U-CARLOS` falla.

## 4. Archivos principales

```text
apps/web/src/
├── api/contracts/work-orders.ts
├── api/client/work-orders-api.ts
├── mocks/services/work-order-catalog.ts
├── mocks/services/work-order-commands.ts
├── mocks/repositories/MockWorkOrderRepository.ts
└── features/work-orders/
    ├── WorkOrdersPage.tsx
    ├── WorkOrderDetailPage.tsx
    ├── WorkOrderTable.tsx
    ├── CreateWorkOrderModal.tsx
    ├── WOAdminActions.tsx
    └── WorkOrderHistory.tsx
```

## 5. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| OT seed con estados correctos | ✅ 060 En proceso, 061/062 Pendiente, 063 Completada |
| Crear desarme no cambia jerarquía | ✅ MOT-001 sigue instalado en CAM-001 |
| Reasignación/cancelación generan eventos | ✅ `WORK_ORDER_REASSIGNED` / `WORK_ORDER_CANCELLED` |
| Vendedor bloqueado (ruta + servicio) | ✅ menú, `isRouteAllowedForRole`, `FORBIDDEN` en el repositorio |
| Solo admin crea/reasigna/cancela | ✅ `workOrders.manage` |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npm test -w @solocamiones/web
```

Resultado: 33 archivos de prueba frontend y 209 pruebas aprobadas.

**Flujos manuales:**

1. Login `admin` / `demo1234` → Órdenes de Trabajo → ver las 4 OT seed.
2. Filtro En proceso → solo `OD-DEMO-060` (Pedro, `FAC-000096`).
3. Nueva OT → Desarme de `MOT-001` → detalle pendiente; en Inventario el motor sigue instalado en CAM-001.
4. Detalle `OD-DEMO-061` → Reasignar a Pedro con motivo → En proceso.
5. Detalle `OD-DEMO-062` → Cancelar con motivo → Cancelada; `FIL-001` no cambia de relación.
6. `OD-DEMO-063` sin botones de reasignar/cancelar; evidencia BEFORE/AFTER visible.
7. Login `laura` → `/work-orders` muestra acceso no autorizado.

## 7. Fuera de alcance

- Tomar orden, evidencia y completar desarme/instalación (WM10).
- Liberar asignación sin cancelar (recuperación WM12).
- App móvil del mecánico.

## 8. Handoff a WM10

Las OT de escritorio ya listan contexto, evidencia consultiva e historial. WM10 debe implementar `takeOrder`, fotos BEFORE/AFTER y `completeDesarme` / `completeInstalacion` sobre el mismo `AppState`, usando `MechanicWorkOrderView` y sin exponer factura, cliente ni costos.
