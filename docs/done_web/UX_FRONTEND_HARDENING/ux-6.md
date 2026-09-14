# Milestone UX-6 — Experiencia del mecánico

| Campo | Valor |
|---|---|
| **ID plan** | UX-6 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-6 |
| **Alcance** | Solo frontend (`apps/web`), app del mecánico. No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-7 — Responsive Admin/Seller |

---

## 1. Objetivo

Endurecer el uso real en taller: una mano, targets táctiles, fotos con progreso y reintento, y una siguiente acción clara. No rediseñar ni adelantar Release 7.

El corte de negocio sigue siendo **Release 1 ACTIVE**. Las OT siguen detrás de `workOrders` (Release 7). WO-003 no cambia: sin cliente, factura ni precios.

## 2. Qué se entregó

- Shell `h-dvh` con área de trabajo con scroll y bottom nav fija (Pendientes / Mis órdenes / Perfil).
- Inputs a `text-base` / `min-h-12` para evitar zoom de iOS.
- Acción principal pegada al pulgar: **Tomar orden**, **Continuar**, **Completar …** sticky, **Ir a pendientes** si ya está completada.
- Mis órdenes separa **En proceso** y **Completadas**. Completada es historial de solo lectura.
- Subida BEFORE/AFTER: `capture` de cámara, barra de progreso, foto pendiente + **Reintentar subida** si falla la red. La ubicación opcional no se borra si falla completar.
- Copy operativo (`mechanic-copy.ts`) para 5xx / `Failed to fetch` y para claim perdido.
- Estados vacíos con enlace a la otra cola. Reintentar en errores de carga.

## 3. Archivos principales

```text
apps/web/src/features/mechanic/mechanic-copy.ts
apps/web/src/features/mechanic/EvidencePanel.tsx
apps/web/src/features/mechanic/MechanicOrderView.tsx
apps/web/src/features/mechanic/MechanicLayout.tsx
apps/web/src/features/mechanic/MechanicPendingPage.tsx
apps/web/src/features/mechanic/MechanicMinePage.tsx
apps/web/src/features/mechanic/MechanicOrderCard.tsx
apps/web/tests/unit/features/mechanic/mechanic-copy.test.ts
apps/web/tests/component/mechanic/MechanicPages.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual (mecánico, prototipo, ~360–430 px): tomar una pendiente; en 060 subir AFTER y ver progreso; forzar error de red y reintentar sin perder la foto; completar; ver historial e Ir a pendientes. Preset sin `workOrders`: solo Perfil en la nav.

## 5. Fuera de alcance

- UX-7 (sidebar Admin/Seller, laptops).
- Upload real a object storage (Release 7).
- Offline durable tipo IndexedDB.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-6
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md) Release 7
- [`docs/FEATURES/06_MECHANIC_WORK_ORDERS.md`](../../FEATURES/06_MECHANIC_WORK_ORDERS.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-5.md`](./ux-5.md)
