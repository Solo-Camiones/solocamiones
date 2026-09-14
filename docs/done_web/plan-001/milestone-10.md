# Milestone 10 — WM10: Experiencia Mecánico (móvil)

| Campo          | Valor                                                           |
| -------------- | --------------------------------------------------------------- |
| **ID plan**    | WM10                                                            |
| **Estado**     | Completado                                                      |
| **Fecha**      | 2026-09-01                                                      |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM10 |
| **Alcance**    | Cola móvil, claim atómico, evidencia BEFORE/AFTER, completar desarme/instalación |
| **Siguiente**  | WM11 — Catálogos y usuarios (admin)                             |

---

## 1. Objetivo

Sustituir los placeholders de `/mechanic/*` por la app móvil del mecánico: cola compartida de pendientes, mis órdenes, detalle técnico, evidencia y completar el trabajo físico. El payload y la UI no exponen factura, cliente ni costos (WO-003).

## 2. Contexto previo

WM9 ya lista OT de escritorio y permite crear/reasignar/cancelar. Completar no movía jerarquía. El seed deja `OD-DEMO-060` en proceso con Pedro (`TUR-009` vendido e instalado, una foto BEFORE) y dos pendientes (`061`, `062`).

## 3. Decisiones clave

### 3.1 Proyección mecánica, no ocultar en UI

**Decisión:** `listForMechanic` / `getForMechanic` / mutaciones de cola devuelven `MechanicWorkOrderView`. No incluye `invoiceId`, cliente, precios ni costos. La ubicación efectiva se calcula con el mismo helper de inventario (herencia desde la raíz).

**Por qué:** WO-003. Un mecánico no debe poder leer datos comerciales ni siquiera en el estado React.

### 3.2 Claim atómico en el servicio

**Decisión:** `takeOrder` es un check-then-set sobre el `AppState` compartido: solo `PENDING` sin asignado; el ganador pasa a En proceso. Un segundo `take` (otro mecánico o doble clic) es `CONFLICT`. Solo `role === MECHANIC` puede tomar, aunque el administrador tenga la policy.

**Por qué:** WO-004. En JavaScript de un hilo esto es suficiente; el futuro HTTP debe conservar la misma semántica (update condicional).

### 3.3 Completar cambia jerarquía; crear no

| Acción | Efecto físico |
| --- | --- |
| Completar desarme | Pieza `INDEPENDENT`; comercial no cambia (`SOLD` sigue `SOLD`); KMC `REMOVED_AFTER_BASELINE` en el padre directo; completitud solo de ese padre; ubicación opcional |
| Completar instalación | Relación actual; resuelve un KMC compatible por nombre de categoría; no inventa venta |
| Evidencia | Mínimo 1 BEFORE + 1 AFTER (nombres de archivo simulados, igual que el registro de inventario) |
| Otro mecánico | `FORBIDDEN`; la UI no ofrece cargar ni completar |

## 4. Archivos principales

```text
apps/web/src/
├── api/contracts/entities.ts          # MechanicWorkOrderView
├── api/contracts/work-orders.ts       # addPhoto / complete inputs
├── api/contracts/repositories.ts
├── api/client/work-orders-api.ts
├── mocks/services/work-order-catalog.ts
├── mocks/services/work-order-commands.ts
├── mocks/repositories/MockWorkOrderRepository.ts
└── features/mechanic/
    ├── MechanicLayout.tsx
    ├── MechanicBottomNav.tsx
    ├── MechanicPendingPage.tsx
    ├── MechanicMinePage.tsx
    ├── MechanicOrderCard.tsx
    ├── MechanicOrderView.tsx
    ├── EvidencePanel.tsx
    └── useMechanicOrders.ts
```

## 5. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| Flujo venta instalada → desarme → `Vendido + Independiente` | ✅ `TUR-009` / `OD-DEMO-060` |
| OT de otro mecánico no editable | ✅ `FORBIDDEN` en servicio + UI |
| Payload mecánico sin campos comerciales | ✅ proyección + JSON |
| `takeOrder` falla si ya reclamada | ✅ segundo claim `CONFLICT` |
| Completar falla sin evidencia o sin ser asignado | ✅ |
| UX táctil adecuada en móvil | ✅ layout ~430px, botones `min-h-12`, bottom nav |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npm test -w @solocamiones/web
```

Resultado: 34 archivos de prueba frontend y 224 pruebas aprobadas.

**Flujos manuales:**

1. Login `pedro` / `demo1234` → Pendientes muestra `OD-DEMO-061` y `OD-DEMO-062` (sin números `FAC-`).
2. Mis órdenes muestra `OD-DEMO-060` (Turbo Garrett, En proceso).
3. Abrir `060` → agregar foto AFTER → Completar desarme (ubicación opcional). En inventario admin, `TUR-009` queda Vendido + Independiente y `MOT-001` incompleto.
4. Pendientes → Tomar `061` → pasa a Mis órdenes En proceso. Un segundo take (simulado) falla.
5. Login `laura` → `/mechanic` no autorizado.

No hay herramientas de navegador en esta sesión; la UI se verificó con pruebas de componente (cola, take, evidencia y completar).

## 7. Fuera de alcance

- Catálogos y usuarios (WM11).
- Rentabilidad, recuperación y 12 escenarios demo (WM12).
- Subida real a object storage / progreso de red.

## 8. Handoff a WM11

La app mecánico cierra el ciclo físico del prototipo. WM11 cubre `/catalogs` y `/users` para el administrador; el login de usuarios nuevos y categorías en el alta de inventario dependen de ese milestone.
