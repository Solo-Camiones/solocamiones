# Milestone UX-8 — Validación final de usabilidad y consistencia

| Campo          | Valor                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **ID plan**    | UX-8                                                                                                   |
| **Estado**     | Walkthrough interno completado; validación con usuarios pendiente                                      |
| **Fecha**      | 2026-09-02                                                                                             |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-8 |
| **Alcance**    | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend.                                 |
| **Siguiente**  | Validación del prototipo con usuarios y propietario                                                    |

---

## 1. Objetivo

Comprobar que los flujos principales de Administrador, Vendedor y Mecánico se sienten claros, predecibles y difíciles de usar mal, y corregir solo la fricción de consistencia que apareció en esa pasada.

El corte de negocio sigue siendo **Release 1 ACTIVE**. Los escenarios de inventario, ventas, rentabilidad y órdenes se recorrieron con el preset `prototype` (capabilities encendidas), no como si ya fueran producción.

Esta pasada fue un walkthrough estructurado (tareas + heurísticas), no una sesión con usuarios reales.

## 2. Escenarios recorridos

### Administrador

| Tarea                   | Resultado                  | Fricción encontrada                                                                                 |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Crear un usuario        | Completada                 | —                                                                                                   |
| Cambiar estado          | Completada                 | **Desactivar** se veía igual que **Editar** (ambos secondary).                                      |
| Registrar una pieza     | Completada                 | El éxito decía «artículo» y el resto del dominio dice «pieza». Error de registro sin título `Info`. |
| Registrar un ensamblaje | Completada                 | Cancelar/Atrás seguían activos mientras guardaba.                                                   |
| Buscar inventario       | Completada                 | Columna «Ítem» (jerga) vs «Nombre» en otras tablas.                                                 |
| Revisar rentabilidad    | Completada (capability on) | Tabla fuera de `TableShell` / `HoverRow` / `Empty`.                                                 |

### Vendedor

| Tarea                   | Resultado                       | Fricción encontrada                                                     |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Buscar cliente          | Completada                      | —                                                                       |
| Crear borrador          | Completada                      | —                                                                       |
| Añadir / corregir línea | Completada                      | Error del modal como `<p>` rojo, no `Info`.                             |
| Confirmar venta         | Completada                      | Igual: error fuera del patrón `Info`.                                   |
| Buscar factura anterior | **Bloqueada antes del arreglo** | No había búsqueda; el vacío pedía crear el borrador «desde inventario». |

### Mecánico

| Tarea                          | Resultado  | Fricción encontrada                                             |
| ------------------------------ | ---------- | --------------------------------------------------------------- |
| Abrir pendientes / una orden   | Completada | Tras abrir un pendiente, el único volver iba a **Mis órdenes**. |
| Identificar pieza / ubicación  | Completada | «Ubicación efectiva» vs «Ubicación» en la tarjeta.              |
| Adjuntar evidencia / completar | Completada | —                                                               |

## 3. Qué se entregó

- Búsqueda en listado de ventas (número, cliente o id) sobre la pestaña activa, con vacío distinto si hay query.
- **Desactivar** usuario en `danger`; **Activar** sigue `secondary`.
- Copy alineado a términos de negocio: pieza, usuario (no `username`), nombres de tabla, títulos de error con artículo.
- Registro de inventario: «Ver pieza», `Info` con título, botones de salida deshabilitados al guardar.
- POS: errores de agregar línea y confirmar con `Info`.
- Rentabilidad: misma cáscara de tabla que el resto del comercial.
- Mecánico: volver a Pendientes si la orden sigue pendiente; etiqueta **Ubicación**.
- Loading de `RouteAccessGuard`: «Cargando sesión…», igual que el resto del shell autenticado.

No se añadieron dependencias. No se cambiaron reglas de confirmación, reservas, permisos ni capabilities.

## 4. Archivos principales

```text
apps/web/src/features/sales/SalesPage.tsx
apps/web/src/features/sales/SalesTable.tsx
apps/web/src/features/sales/AddLineModal.tsx
apps/web/src/features/sales/ConfirmSaleModal.tsx
apps/web/src/features/users/UserTable.tsx
apps/web/src/features/users/UsersPage.tsx
apps/web/src/features/inventory/RegisterItemWizard.tsx
apps/web/src/features/inventory/InventoryTable.tsx
apps/web/src/features/profitability/ProfitabilityPage.tsx
apps/web/src/features/mechanic/MechanicOrderView.tsx
apps/web/tests/component/sales/SalesPage.test.tsx
docs/done_web/UX_FRONTEND_HARDENING/ux-8.md
```

## 5. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual (preset `prototype`):

1. Admin: crear usuario; **Desactivar** debe verse rojo; registrar pieza y ver «Ver pieza»; buscar inventario.
2. Admin: rentabilidad — filas clicables como el resto de tablas.
3. Vendedor: en Ventas, buscar `FAC-000099`; vacío de búsqueda vs vacío de pestaña; confirmar y agregar línea siguen usando avisos `Info` si fallan.
4. Mecánico: abrir un pendiente sin tomarlo → «← Pendientes»; en una orden en proceso → «← Mis órdenes»; la ubicación no dice «efectiva».

Preset `release-1`: rentabilidad, inventario y POS no deben aparecer (UX-0). UX-8 no cambia eso.

## 6. Fuera de alcance

- Estudio formal con usuarios reales / analytics.
- Adelantar releases del Development Plan.
- Rediseño, branding o nuevas dependencias.
- CxP (`PENDING VALIDATION`).

## 7. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-8
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md)
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-7.md`](./ux-7.md)
