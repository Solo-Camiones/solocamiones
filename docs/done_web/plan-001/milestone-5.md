# Milestone 5 — WM5: Inventario listado, búsqueda y detalle

| Campo          | Valor                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **ID plan**    | WM5                                                                                                             |
| **Estado**     | Completado                                                                                                      |
| **Fecha**      | 2026-08-28                                                                                                      |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM5                                               |
| **Alcance**    | Catálogo unificado (piezas + cantidad), búsqueda, detalle, chips de dominio, agregar a borrador, acciones admin |
| **Siguiente**  | WM6 — Registro de inventario                                                                                    |

---

## 1. Objetivo

Sustituir los placeholders de `/inventory` y `/inventory/:id` por exploración operativa del seed: listado unificado, filtros, detalle de pieza y de producto por cantidad, y mutaciones validadas en servicio mock.

---

## 2. Contexto previo

WM4 dejó inventario como `PlaceholderPage`. El handoff pedía `features/inventory/` sobre `MockInventoryRepository` (solo lecturas crudas).

---

## 3. Decisiones clave

### 3.1 Proyecciones en servicio, no en la UI

**Decisión:** `buildInventoryCatalog`, `buildItemDetail` y helpers (`effectiveLocation`, `isComplete`, `protectedAncestor`) viven en `mocks/services/`. Los componentes pintan DTOs.

**Por qué:** Misma frontera mock→API que WM3/WM4. Completitud se deriva de Known Missing Components del padre directo (HIER-006), no se edita a mano. Ubicación efectiva de instalados hereda de la raíz (LOC-001).

### 3.2 `No desarmar` se hereda y se valida al reservar

**Decisión:** El chip y el bloqueo usan el ancestro protegido. Agregar a borrador un descendiente de MOT-003 falla en `addInventoryToDraft` aunque la UI oculte el botón. Vender MOT-003 como unidad sí está permitido (HIER-008).

**Por qué:** Endurecimiento vs Make: ocultar el botón no basta.

### 3.3 Agregar a borrador reutiliza el DRAFT abierto

**Decisión:** Se reusa `INV-DRAFT-01` (o se crea uno nuevo) y se navega a `/sales/draft/:id`. El editor POS sigue siendo placeholder de WM8.

**Por qué:** Cumple “abre POS” sin implementar confirmación, líneas genéricas ni ITBIS (WM8).

### 3.4 Acciones admin en el detalle, denegadas en servicio

| Acción             | Permiso             | Nota                                             |
| ------------------ | ------------------- | ------------------------------------------------ |
| Agregar a borrador | `sales.manage`      | Admin y Vendedor                                 |
| No desarmar        | `inventory.admin`   | Solo Admin                                       |
| Corregir costo     | `inventory.admin`   | Motivo obligatorio; historial aditivo            |
| Corregir baseline  | `inventory.admin`   | Solo marca faltantes de recepción como no aplica |
| OT manual          | `workOrders.manage` | No cambia jerarquía (WM10)                       |

El Vendedor no ve esos botones; un `save` directo al mock también es `FORBIDDEN`.

---

## 4. Estructura añadida / modificada

```
apps/web/
├── src/
│   ├── api/contracts/inventory.ts
│   ├── api/client/inventory-api.ts
│   ├── mocks/services/
│   │   ├── inventory-helpers.ts      # ubicación, completitud derivada, No desarmar, overlap
│   │   ├── inventory-catalog.ts      # proyecciones de listado/detalle (sin mutar)
│   │   └── inventory-commands.ts     # reservas, correcciones, OT manual
│   ├── mocks/repositories/MockInventoryRepository.ts
│   ├── shared/domain/StatusChips.tsx
│   └── features/inventory/
│       ├── InventoryPage.tsx
│       ├── InventoryFilters.tsx
│       ├── InventoryTable.tsx
│       ├── InventoryDetailPage.tsx
│       ├── ItemDetailView.tsx
│       ├── QtyProductDetail.tsx
│       ├── HierarchyTree.tsx
│       ├── StatusPanel.tsx
│       ├── PhotoGrid.tsx
│       └── ItemAdminActions.tsx
└── tests/
│   ├── unit/mocks/services/inventory.test.ts
│   ├── integration/mocks/repositories/inventory.repository.test.ts
│   └── component/inventory/
```

**Modificados:** `repositories.ts`, `contracts/index.ts`, `router.tsx`.

---

## 5. Números / casos esperados tras reinicio

| Caso                           | Resultado                                                   |
| ------------------------------ | ----------------------------------------------------------- |
| Listado sin “Mostrar vendidos” | TUR-009 oculto                                              |
| CAM-001                        | Un motor (MOT-001); Transmisión faltante; Incompleto        |
| MOT-002 / MOT-003              | Independientes en Patio B / Patio C                         |
| MOT-002                        | Incompleto + faltante Turbo                                 |
| MOT-003                        | Chip No desarmar; ALT-011 instalado y bloqueado al reservar |
| QTY-OIL-15W40                  | 48 exist. − 2 res. = 46 disp.                               |
| ALT-004                        | Reservado en INV-DRAFT-01; ubicación efectiva Patio A       |

---

## 6. Criterios de aceptación

| Criterio                                 | Estado                                        |
| ---------------------------------------- | --------------------------------------------- |
| Jerarquía CAM-001 navegable              | ✅ árbol con links                            |
| MOT-003: No desarmar en descendientes    | ✅ helper + rechazo en servicio               |
| MOT-002: incompleto + faltante           | ✅                                            |
| Cantidad: disponible = onHand − reserved | ✅                                            |
| Agregar a borrador abre POS              | ✅ navega a `/sales/draft/:id` (UI POS = WM8) |
| No desarmar rechazado en servicio        | ✅                                            |
| Vendedor sin acciones admin              | ✅ UI + `FORBIDDEN`                           |
| Rechazo de reserva sin cambios parciales | ✅ no crea borrador, línea, reserva ni evento |
| Corrección de costo/procedencia aditiva  | ✅ motivo + costo y procedencia antes/después |
| Error de acción administrativa           | ✅ visible dentro del modal activo            |

### Reglas canónicas verificadas

| Regla      | Evidencia WM5                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INV-006`  | Corrección de costo solo por `inventory.admin`; motivo obligatorio; evento con actor, fecha, costo y procedencia antes/después. `null` borra procedencia explícitamente. |
| `HIER-008` | Un descendiente bajo `No desarmar` no entra al borrador ni deja cambios parciales; la raíz protegida sigue siendo elegible como unidad.                                  |
| `RES-001`  | La reserva se crea junto con la línea solo después de validar existencia, disponibilidad, restricción y solapamiento; reservar no marca el inventario como vendido.      |

Los flujos de confirmación, liberación o descarte del borrador y concurrencia real permanecen en WM8/backend; no se declaran completados en este hito.

---

## 7. Verificación

```bash
cd apps/web
npm test
npm run typecheck
```

**Flujos manuales:**

1. Login `admin` / `demo1234` → Inventario
2. Abrir CAM-001 → navegar a MOT-001 (hijos instalados) y a MOT-003 (ALT-011 No desarmar)
3. QTY-OIL-15W40 → 46 disponibles
4. FIL-001 → Agregar a borrador → ruta `/sales/draft/INV-DRAFT-01` (placeholder WM8)
5. Login `laura` → detalle sin botones No desarmar / OT / costo / baseline
6. Reiniciar datos demo → TUR-009 sigue fuera del listado normal

---

## 8. Fuera de alcance (WM5)

| Tema                                             | Milestone |
| ------------------------------------------------ | --------- |
| Registrar inventario / ensamblaje / fotos reales | WM6       |
| Editor POS, precios, confirmar venta, ITBIS      | WM8       |
| Listado de OT de escritorio                      | WM9       |
| Completar desarme (cambia jerarquía)             | WM10      |

---

## 9. Handoff a WM6

Listo para el wizard `Registrar inventario` desde Inventario. Catálogo y detalle ya consumen el mismo `AppState`. No añadir el alta aquí: WM6 es el dueño del checklist de ensamblaje.

---

## 10. Referencias

- [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM5
- [`docs/FEATURES/02_INVENTORY.md`](../../FEATURES/02_INVENTORY.md)
- [`docs/FEATURES/03_QUANTITY_STOCK.md`](../../FEATURES/03_QUANTITY_STOCK.md)
- [`docs/FEATURES/05_HIERARCHY_AND_BASELINE.md`](../../FEATURES/05_HIERARCHY_AND_BASELINE.md)
- [`docs/FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md`](../../FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md)
