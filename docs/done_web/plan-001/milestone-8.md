# Milestone 8 — WM8: Punto de venta y borradores (POS)

| Campo          | Valor                                                          |
| -------------- | -------------------------------------------------------------- |
| **ID plan**    | WM8                                                            |
| **Estado**     | Completado                                                     |
| **Fecha**      | 2026-09-01                                                     |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM8 |
| **Alcance**    | Editor de borrador, 6 tipos de línea, ITBIS fiscal, confirmación atómica |
| **Siguiente**  | WM9 — Órdenes de trabajo (escritorio)                          |

---

## 1. Objetivo

Sustituir el placeholder de `/sales/draft/:id` por un punto de venta operable: el vendedor prepara el borrador, reserva inventario, calcula ITBIS solo si hay comprobante fiscal y confirma una factura `FAC-` sin dejar estado parcial. Tras confirmar, el documento entra al ciclo post-venta de WM7 (detalle, pagos, PDF).

## 2. Contexto previo

WM7 ya lista facturas, registra pagos, cancela con ramas de OT y genera el PDF interno. WM5 reserva inventario hacia el borrador abierto. WM8 completa el editor y la confirmación atómica sobre el mismo `AppState`.

## 3. Decisiones clave

### 3.1 Confirmación en servicio, no en la UI

**Decisión:** `createDraft`, `addDraftLine`, `removeDraftLine`, `setDraftMeta`, `setDraftLinePrice`, `discardDraft` y `confirmInvoice` viven en `mocks/services/sales-pos-commands.ts` y se reexportan desde `sales-commands.ts`. `PosPage` solo orquesta. Pagos y cancelación de WM7 permanecen en el mismo módulo de comandos, sin mezclarse con el ciclo pre-venta.

**Por qué:** Misma frontera mock→API que WM4–WM7. Un doble clic no consume dos números `FAC-`: el segundo `confirmInvoice` es idempotente.

### 3.2 ITBIS solo con `fiscal: true`

**Decisión:** El precio de línea es el importe final. `lineItbis` extrae el 18% incluido únicamente si la factura es fiscal y la línea es gravable. Servicio y entrega siguen exentos. Sin comprobante, ITBIS = 0 y el total coincide con la suma de precios.

**Por qué:** Refinamiento del plan respecto al Make, que mostraba ITBIS aunque el documento no fuera fiscal.

### 3.3 Un borrador no es “el” único borrador

**Decisión:** Inventario sin `draftId` sigue reutilizando el primer DRAFT (WM5). El POS siempre pasa `draftId`. `createDraft` abre uno nuevo aunque ya exista otro, para poder rechazar reservas cruzadas.

**Por qué:** El criterio “reservado por otro borrador” no se puede demostrar con un único DRAFT global.

### 3.4 Pieza instalada vs ensamblaje

| Caso | Efecto al confirmar |
| --- | --- |
| Pieza única instalada | `Sold` + sigue `Installed`; OT Desarme pendiente (o reutiliza una activa) |
| Ensamblaje | Marca raíz y descendientes `Sold`; aborta si hay OT pendiente/en proceso en el subárbol o una instalación hacia él |
| Descendiente de `No desarmar` | Rechazado al agregar línea, no solo oculto |

Completar el desarme (cambio físico) sigue siendo WM10.

### 3.5 Snapshot de cliente (CUST-003)

**Decisión:** `confirmInvoice` copia nombre y RNC a `invoice.customerSnapshot`. El detalle WM7 lee el snapshot cuando existe, así una edición posterior del cliente no reescribe documentos emitidos.

## 4. Archivos principales

```text
apps/web/src/
├── api/contracts/sales.ts
├── api/client/sales-api.ts
├── mocks/services/sales-commands.ts
├── mocks/services/sales-pos-commands.ts
├── mocks/services/sales-draft.ts
├── mocks/services/sales-helpers.ts
├── mocks/repositories/MockSalesRepository.ts
└── features/sales/
    ├── PosPage.tsx
    ├── usePos.ts
    ├── DocumentPanel.tsx
    ├── TotalsPanel.tsx
    ├── PriceCell.tsx
    ├── AddLineModal.tsx
    ├── ConfirmSaleModal.tsx
    └── AssemblyTree.tsx
```

## 5. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| Borrador → confirmar → `FAC-` | ✅ `FAC-000100` tras el seed; el detalle WM7 puede cobrar |
| Pieza instalada → OT Desarme Pendiente | ✅ ALT-004 + `OD-DEMO-064` |
| Ensamblaje bloqueado si OT activa | ✅ MOT-001 / MOT-002 |
| `No desarmar` impide línea suelta | ✅ ALT-011 |
| Precio pendiente bloquea confirmación | ✅ |
| Fiscal + Cliente Contado bloqueado | ✅ |
| Reserva de otro borrador rechazada | ✅ |
| `confirmInvoice` idempotente | ✅ |
| Sin fiscal: ITBIS RD$0.00 | ✅ |
| Con fiscal: desglose base + ITBIS | ✅ |
| Cliente nuevo en selector POS | ✅ |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npm test -w @solocamiones/web
```

Resultado: 26 archivos de prueba frontend y 170 pruebas aprobadas. Incluye las pruebas WM7 de listado, detalle, pagos, cancelación y PDF.

**Flujos manuales:**

1. Login `laura` / `demo1234` → Ventas → Borrador `INV-DRAFT-01` o Inventario → ALT-004
2. Totales sin comprobante: ITBIS `RD$0.00`, total `RD$31,600.00`
3. Activar “Factura con comprobante fiscal” (cliente C1) y ver ITBIS incluido
4. Confirmar → `FAC-000100` y OT de desarme; ALT-004 vendido e instalado
5. Desde el POS confirmado, **Ver detalle** → registrar pago (WM7)
6. Crear cliente en `/customers` y comprobarlo en el selector del POS (`/sales/draft/new`)

## 7. Fuera de alcance

- Completar desarme y cambiar la jerarquía física (WM10).
- Listado de OT de escritorio (WM9).
- Liberar reservas abandonadas desde recuperación (WM12).
- Carreras multithread reales; el mock valida en un solo hilo.

## 8. Handoff a WM9

El agregado `Invoice` pasa a `COMPLETED` con número, snapshot de cliente, líneas y OT ligada. WM7 ya lista, cobra y cancela esas facturas. WM9 debe gestionar las OT de desarme creadas al confirmar una pieza instalada (`OD-DEMO-064` tras el seed) sin reabrir el editor de borrador.
