# Milestone 7 — WM7: Ventas, detalle, pagos y cancelación

| Campo          | Valor                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| **ID plan**    | WM7                                                                            |
| **Estado**     | Completado                                                                     |
| **Fecha**      | 2026-08-31                                                                     |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM7                 |
| **Alcance**    | Listado, detalle, pagos, cancelación, corrección de moneda, PDF interno, ITBIS |
| **Siguiente**  | WM8 — Punto de venta y borradores (POS)                                        |

---

## 1. Objetivo

Sustituir los placeholders de `/sales` y `/sales/:id` por el ciclo post-venta: consulta de documentos, registro de pagos, cancelación administrativa, vista previa PDF y panel de rentabilidad para administrador. El editor de borradores sigue en WM8.

## 2. Implementación

- `/sales` lista facturas con pestañas Todas / Borrador / Completada / Cancelada, estado, pago, total y saldo.
- Un borrador navega a `/sales/draft/:id` (placeholder POS). Una factura numerada abre el detalle.
- El detalle muestra líneas (base, ITBIS, total), cliente, pagos/reembolsos, OT vinculadas, historial y acciones.
- **ITBIS 18% incluido** solo si `fiscal: true` y la línea es gravada. Sin comprobante, ITBIS es 0 y la columna muestra “—”.
- `addPayment` es aditivo, no puede superar el saldo ni ser ≤ 0, y reusa `idempotencyKey`.
- `cancelInvoice` exige motivo, reembolso opcional ≤ pagado, y aplica las ramas de desarme (pendiente / en proceso / completado).
- `correctCurrency` es solo administrador, factura completada y sin pagos; no convierte importes.
- El PDF interno muestra `FAC-` y `NCF: ______________________` sin implicar DGII.

## 3. Reglas y validaciones

- `sales.manage` (Admin y Vendedor): listar, ver, pagar.
- `sales.cancel` y `sales.correctCurrency`: solo Administrador. El servicio rechaza al Vendedor aunque la UI oculte los botones.
- La rentabilidad no viaja en el DTO del Vendedor (COST-004).
- Cancelación pendiente: OT cancelada; pieza `Available` y sigue instalada.
- Cancelación en proceso: decisión explícita STOP (cancela OT) o CONTINUE (el desarme sigue).
- Cancelación con desarme completado: pieza `Available` + independiente; el padre no se reinstala.
- Un segundo cancel sobre el mismo documento se rechaza porque ya no está `COMPLETED`.

## 4. Archivos principales

```text
apps/web/src/
├── api/contracts/sales.ts
├── api/client/sales-api.ts
├── mocks/services/sales-catalog.ts
├── mocks/services/sales-commands.ts
├── mocks/repositories/MockSalesRepository.ts
└── features/sales/
    ├── SalesPage.tsx
    ├── InvoiceDetailPage.tsx
    ├── PayModal.tsx
    ├── CancelInvoiceModal.tsx
    ├── CurrencyCorrectionModal.tsx
    └── PdfPreviewModal.tsx
```

## 5. Criterios de aceptación

| Criterio                                                         | Estado |
| ---------------------------------------------------------------- | ------ |
| FAC-000098 sin pagar; FAC-000099 parcial                         | ✅     |
| Pago actualiza saldo y chip                                      | ✅     |
| Cancelación aditiva; PDF con ITBIS 0 o desglose según `fiscal`   | ✅     |
| Factura no fiscal: ITBIS “—”; total = suma de precios finales    | ✅     |
| Factura fiscal: ITBIS 18% solo en líneas gravadas                | ✅     |
| Vendedor sin cancelación ni corrección de moneda                 | ✅     |
| Pago > saldo o ≤ 0 rechazado                                     | ✅     |
| Reembolso > pagado rechazado; cancelación sin motivo rechazada   | ✅     |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npx vitest run tests/unit/mocks/services/sales.test.ts tests/integration/mocks/repositories/sales.repository.test.ts tests/component/sales
```

Resultado WM7: 4 archivos / 24 pruebas de ventas aprobadas.

**Flujos manuales:**

1. Login `admin` / `demo1234` → Ventas → FAC-000098 Sin pagar y FAC-000099 Parcial.
2. Detalle FAC-000098 → Registrar pago 5000 → chip Parcial.
3. Vista previa PDF en FAC-000098 (ITBIS desglosado) y FAC-000099 (ITBIS — / RD$0.00).
4. Cancelar FAC-000097 con motivo y reembolso; el documento permanece visible como Cancelada.
5. Login `laura` → detalle sin Cancelar factura ni Corregir moneda ni Rentabilidad.

## 7. Fuera de alcance

- Editor POS, confirmación de venta y asignación `FAC-` (WM8).
- Listado de OT de escritorio (WM9).
- Completar desarme físico (WM10).
- Reintento de rentabilidad USD / pantalla de rentabilidad (WM12).
- Integración DGII / NCF / e-CF.

## 8. Handoff a WM8

El listado y el detalle consumen el mismo `AppState`. Los borradores ya existen (`INV-DRAFT-01`) y se abren en `/sales/draft/:id`. WM8 debe implementar el editor, la confirmación atómica y el cálculo de ITBIS al togglear `fiscal`, reutilizando `invoice-money.ts` y `MockSalesRepository`.
