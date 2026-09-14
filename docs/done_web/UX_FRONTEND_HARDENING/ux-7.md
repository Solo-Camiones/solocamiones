# Milestone UX-7 — Responsive y comportamiento en distintos tamaños

| Campo | Valor |
|---|---|
| **ID plan** | UX-7 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-7 |
| **Alcance** | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-8 — Validación final de usabilidad y consistencia |

---

## 1. Objetivo

Que Admin/Seller sigan siendo usables cuando el ancho baja (laptop, tablet horizontal, ventana partida, zoom 200%). No convertir esa experiencia en mobile-first. El mecánico permanece en su shell de teléfono.

El corte de negocio sigue siendo **Release 1 ACTIVE**. Las capabilities (UX-0) no cambian.

## 2. Qué se entregó

Tres modos alineados a Tailwind `xl` / `md`:

| Ancho | Modo | Comportamiento |
|---|---|---|
| ≥ 1280px | `full` | Sidebar persistente `w-64` (1920, 1440, 1366, 1280). |
| 768–1279px | `compact` | Sidebar `w-52`, colapsable. Cubre 1024×768. |
| < 768px | `drawer` | Overlay con trap de foco. Incluye ~200% de 1280px (640 CSS px). |

El `overflow-hidden` del shell ya no envuelve el viewport entero: el scroll vive en `main`, el drawer se porta a `document.body`.

POS apila el documento/totales bajo las líneas hasta `xl`, para no comprimir dos columnas junto a un sidebar. Tablas siguen con scroll horizontal propio. Modales: cabecera fija, cuerpo con scroll, `dvh`, overlay desplazable. PageHeader y cards usan `min-w-0` para que el contenido no fuerce scroll global.

No se añadieron iconos de nav: compactar sin un sistema de iconos no aportaba; el ancho menor + colapso sí.

## 3. Archivos principales

```text
apps/web/src/shared/layout/breakpoints.ts
apps/web/src/shared/layout/useMediaQuery.ts
apps/web/src/shared/layout/useCommercialNavMode.ts
apps/web/src/shared/layout/CommercialSidebar.tsx
apps/web/src/shared/layout/NavDrawer.tsx
apps/web/src/shared/layout/AppShell.tsx
apps/web/src/shared/layout/RoleNav.tsx
apps/web/src/shared/layout/PageHeader.tsx
apps/web/src/shared/ui/Modal.tsx
apps/web/src/shared/ui/DataTable.tsx
apps/web/src/shared/ui/Card.tsx
apps/web/src/features/sales/PosPage.tsx
apps/web/src/features/mechanic/MechanicLayout.tsx
apps/web/tests/unit/shared/layout/breakpoints.test.ts
apps/web/tests/component/layout/RoleNav.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual (admin, prototipo): 1920 y 1440 sidebar completo; 1024×768 compacto y «Ocultar menú»; 640px «Abrir menú» y overlay; zoom 200% en 1280 completar login y una pantalla principal; POS en 1024 apilado; modal de alta con mucho contenido; mecánico a 360–430px.

## 5. Fuera de alcance

- UX-8 (pasada de usabilidad por escenarios).
- Rediseño mobile-first de Admin/Seller.
- Iconos en el menú comercial.
- Cambiar reglas de negocio o backend.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-7
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-6.md`](./ux-6.md)
