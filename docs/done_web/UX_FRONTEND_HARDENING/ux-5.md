# Milestone UX-5 — Ventas / POS: prevención de errores y claridad

| Campo | Valor |
|---|---|
| **ID plan** | UX-5 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-5 |
| **Alcance** | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-6 — Experiencia del mecánico |

---

## 1. Objetivo

Hacer el POS difícil de usar mal: **Confirmar venta** es la acción principal, **Descartar borrador** no se confunde con ella, y el copy/tipos de línea siguen las capabilities del Development Plan (Release 2 factura sin reserva de inventario; ITEM/QTY en Release 5; pagos en Release 3; OT en Release 7).

## 2. Qué se entregó

### Acciones

- **Confirmar venta** (primary, `lg`) junto a **Agregar línea** (secondary).
- **Descartar borrador** debajo, `ghost` en rojo. Con líneas, pide confirmación (`Sí, descartar` / `Seguir editando`). Sin líneas, descarta de inmediato.
- Confirmar no tiene un segundo diálogo de “¿estás seguro?”: el modal de confirmar ya es la revisión.
- Un lock de mutación en `usePos` evita doble submit; el modal muestra `Confirmando…`.
- Un descarte exitoso vuelve a `/sales` (no a inventario, que puede estar apagado).

### Capabilities y copy

- Tipos ITEM/QTY siguen `enabledPosLineTypes`.
- Reserva de inventario solo se menciona si `inventorySales` o `quantitySales` están activas, o al agregar esas líneas.
- Pago inicial en el modal de confirmar: solo con `payments`.
- Aviso de desarme / IDs de OT: solo con `workOrders`.
- Conflictos de stock se traducen a acción del vendedor (`pos-copy.ts`). El borrador no se tira si falla la confirmación.

### Totales y validación

- Panel **Total a cobrar** más visible; blockers del borrador junto a totales.

## 3. Archivos principales

```text
apps/web/src/features/sales/PosPage.tsx
apps/web/src/features/sales/ConfirmSaleModal.tsx
apps/web/src/features/sales/AddLineModal.tsx
apps/web/src/features/sales/TotalsPanel.tsx
apps/web/src/features/sales/usePos.ts
apps/web/src/features/sales/pos-copy.ts
apps/web/tests/unit/features/sales/pos-copy.test.ts
apps/web/tests/component/sales/PosPage.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual (vendedor): prototipo — confirmar sigue siendo el botón grande; descartar pide diálogo si hay líneas; agregar línea ITEM explica la reserva. Preset `release-2` — copy sin reserva, sin ITEM/QTY, sin pago inicial ni aviso de OT.

## 5. Fuera de alcance

- UX-6 / UX-7 / UX-8.
- Cambiar reglas de confirmación, reservas o pagos en el mock/backend.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-5
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md) Release 2 / 3 / 5 / 7
- [`docs/FEATURES/10_SALES_AND_INVOICES.md`](../../FEATURES/10_SALES_AND_INVOICES.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-0.md`](./ux-0.md)
