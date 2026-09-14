# Milestone UX-2 — Navegación y arquitectura de información

| Campo | Valor |
|---|---|
| **ID plan** | UX-2 |
| **Estado** | Completado |
| **Fecha** | 2026-09-02 |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-2 |
| **Alcance** | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend. |
| **Siguiente** | UX-4 — Inventario: jerarquía visual e interacción |

---

## 1. Objetivo

Reducir la carga de escanear una lista plana de secciones. El menú comercial agrupa por **intención de trabajo**, sin submenús y sin adelantar releases.

El corte de negocio sigue siendo **Release 1 ACTIVE** en [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md). Las pantallas posteriores siguen ocultas o bloqueadas por capabilities (UX-0).

## 2. Qué se entregó

### Agrupación

Fuente de verdad: `navGroupsForRole()` en `navigation.ts`.

| Grupo | Secciones |
|---|---|
| Operación | Inicio, Inventario, Ventas y Facturas, Clientes, Órdenes de Trabajo |
| Administración | Catálogos, Usuarios |
| Finanzas y control | Rentabilidad, Administración y Recuperación |

Los encabezados solo aparecen cuando hay **más de un grupo visible**. El Vendedor ve un único grupo (Operación), así que su menú permanece plano. Un grupo vacío por capabilities no se renderiza (p. ej. Release 1 no muestra Finanzas y control).

### Sidebar

Se eliminó el recuento `N secciones`. Los nombres de sección se conservaron (lenguaje de negocio ya usado: `Inicio`, no Dashboard). No hay duplicados ni rutas nuevas.

### Mecánico

Sin cambios: bottom nav independiente, fuera del sidebar comercial.

### Accesibilidad y capabilities

`aria-current="page"` se mantiene. Los grupos usan `role="group"` y `aria-labelledby` cuando hay encabezados. Roles y capabilities siguen siendo ortogonales.

## 3. Archivos principales

```text
apps/web/src/shared/layout/navigation.ts
apps/web/src/shared/layout/RoleNav.tsx
apps/web/src/shared/layout/AppShell.tsx
apps/web/tests/unit/shared/layout/navigation.test.ts
apps/web/tests/component/layout/RoleNav.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual: login `admin` (preset `prototype`) → tres grupos en el sidebar. Login `laura` → lista plana sin encabezados. `VITE_CAPABILITIES_PRESET=release-1` → Inicio + Usuarios, sin Finanzas. Mecánico sigue en la app de cola.

## 5. Fuera de alcance

- UX-3 en adelante (registro de inventario, POS, mecánico, responsive del `w-64`).
- Submenús o rediseño visual del sidebar.
- Cambiar reglas de negocio o backend.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-2
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-0.md`](./ux-0.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-1.md`](./ux-1.md)
