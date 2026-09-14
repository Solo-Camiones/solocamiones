# Release 3 — Registro de lo adelantado (pagos, CxC, cancelación financiera)

**Release:** Payments and Basic Accounts Receivable (slice financiero)  
**Plan de producto:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) §Release 3  
**Specs:** [`../FEATURES/12_PAYMENTS_AND_ACCOUNTS_RECEIVABLE.md`](../FEATURES/12_PAYMENTS_AND_ACCOUNTS_RECEIVABLE.md), slice financiero de [`../FEATURES/13_CANCELLATION_AND_REFUNDS.md`](../FEATURES/13_CANCELLATION_AND_REFUNDS.md)  
**Estado:** slice financiero **implementado** en API + UI HTTP; Release 3 **sigue abierta**. El owner confirmó (2026-09-10): hay que implementar **todo lo que piden** los specs R3 que sigan en checklist abierto (hoy: filtros CxC de Feature 12). Eso va **después de cerrar Release 2** (M25 cerrado 2026-09-11). No hay `plans_api/plan_release_3.md`; este archivo es el registro.

Este archivo documenta **qué ya está en el código** para que un plan R3 futuro no lo vuelva a construir. No sustituye los feature specs.

---

## Qué se entregó (producción API)

- Modelo `InvoicePayment` (ledger aditivo: `PAYMENT` / reembolso de cancelación), moneda de la factura, método `CASH`/`TRANSFER`/`CHECK`, `effectiveDate`, referencia, actor, `idempotencyKey`.
- `dueDate` fija a 30 días calendario (`America/Santo_Domingo`) al confirmar.
- Confirmación puede registrar pago inicial (opcional) en la misma transacción que `FAC-`. **Excepción owner 2026-09-11:** `Cliente contado` no admite crédito; el pago inicial debe igualar el total o la confirmación responde 409 y no emite `FAC-`.
- `POST /api/sales/:id/payments` — pagos adicionales; misma moneda; sin sobrecobro; idempotencia.
- Estados derivados Pending / Overdue / Paid / Paid-late / Cancelled (sin columna mutable de status de pago).
- `GET /api/sales/receivables` — abiertas + resumen por cliente y moneda. Query opcional: `customerId`, `currency`, `paymentState` = `PENDING` | `OVERDUE`.
- `POST /api/sales/:id/cancel` — solo Administrator; motivo; reembolso neto obligatorio en la misma transacción si hubo cobro; idempotencia; PDF cancelado.
- History de pago y cancelación/reembolso en la transacción de escritura.
- Tests: `apps/api/tests/integration/sales/payments-cancellation-http.test.ts`, `apps/api/tests/unit/payments/summary.test.ts`.

## Qué se entregó (HTTP UI, `VITE_USE_MOCK_API` ≠ `true`)

Capabilities: `payments` y `invoiceCancellation` encendidas. Registrar pago, historial, `/receivables`, cancelar factura. Filtro de CxC en UI: nombre de cliente sobre el snapshot cargado (no envía aún los query params del API).

## Qué no está (sigue en alcance R3, salvo lo diferido en el spec)

- **Aún hay que implementarlo:** filtros CxC del checklist Feature 12 (cliente, factura, estado de pago incluyendo Paid/Paid-late, fecha, moneda; la UI HTTP debe usar los query params del API).
- Aging, límites de crédito, intereses, planes, cobranzas, extractos, recordatorios, conciliación bancaria (**diferidos a propósito** en el spec; no son el resto abierto del checklist).
- Cancelación con restauración de inventario u órdenes de trabajo (Release 5/7; el `[x]` mock se deja como está).
- CxP (Release 3B, no confirmado).

## Cómo se conecta con Release 2

Billing Core (M1–M25) está **COMPLETED** en local. Los pagos no son un milestone R2; conviven en `sales` / `payments` con el agregado Invoice.
