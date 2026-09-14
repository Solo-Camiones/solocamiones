# Milestone UX-1 — Accesibilidad de componentes base

| Campo | Valor |
|---|---|
| **ID plan** | UX-1 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-1 |
| **Alcance** | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-2 — Navegación y arquitectura de información |

---

## 1. Objetivo

Hacer que los primitives compartidos (`Modal`, `Field`, `TabBar`/`Tabs`, `Button`) sean usables con teclado y tecnologías asistivas. El efecto es multiplicador: cada pantalla que ya los usa hereda el comportamiento.

El corte de negocio sigue siendo **Release 1 ACTIVE** en [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md). Este milestone no habilita ventas, inventario, OT ni CxP.

## 2. Qué se entregó

### Modal

Portal a `document.body`, fondo `inert`, trap de Tab, Escape, foco inicial en el primer campo (o en el panel, no en una acción destructiva), restauración de foco al trigger, cierre por backdrop y `aria-labelledby` único.

### Field

Contexto hacia `Input` / `Select` / `Textarea` (aunque el control esté anidado): `aria-describedby` para hint/error, `aria-invalid`, labels visibles. El primer control inválido recibe foco cuando aparece un error de campo.

### TabBar vs Tabs

- Ventas y órdenes de trabajo: **filtros** (`aria-pressed`, sin roles de tab).
- Catálogos: **tabs reales** (`tablist` / `tab` / `tabpanel`, flechas).

### Controles pequeños

`Button` `size="icon"` (44px), targets táctiles mínimos, foco visible, `aria-label` en cerrar y en el menú de cuenta. Escape cierra `UserMenu`.

### Formularios

Errores de `Info` con `role="alert"`. En formularios largos el aviso sube al inicio. Login asocia el fallo a usuario y contraseña.

No se añadió Radix ni React Aria: el trap cabe en el `Modal` existente.

## 3. Archivos principales

```text
apps/web/src/shared/ui/Modal.tsx
apps/web/src/shared/ui/focus-dialog.ts
apps/web/src/shared/ui/Field.tsx
apps/web/src/shared/ui/Button.tsx
apps/web/src/shared/layout/TabBar.tsx
apps/web/src/shared/layout/Tabs.tsx
apps/web/tests/component/shared/Modal.test.tsx
apps/web/tests/component/shared/Field.test.tsx
apps/web/tests/component/shared/TabControls.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual: Tab / Shift+Tab / Enter / Space / Escape en un modal de alta, un modal de confirmación y el login con credenciales incorrectas.

## 5. Fuera de alcance

- UX-2 en adelante (navegación agrupada, inventario, POS, mecánico, responsive).
- Auditoría de cada widget custom que no pasa por estos primitives.
- Cambia de reglas de negocio o backend.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-1
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-0.md`](./ux-0.md)
