# Milestone UX-3 — Registro de inventario simplificado

| Campo          | Valor                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **ID plan**    | UX-3                                                                                                   |
| **Estado**     | Completado                                                                                             |
| **Fecha**      | 2026-09-02                                                                                             |
| **Referencia** | [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-3 |
| **Alcance**    | Solo frontend (`apps/web`). No cambia reglas de negocio ni el backend.                                 |
| **Siguiente**  | UX-4 — Inventario: jerarquía visual e interacción                                                      |

---

## 1. Objetivo

Aplicar _progressive disclosure_ al alta: el operador registra el **mínimo práctico** (INV-002) y deja el resto para enriquecer después. Los ensamblajes anuncian _Paso 1 de 2_ / _Paso 2 de 2_ **antes** de Continuar.

El corte de negocio sigue siendo **Release 1 ACTIVE**. Inventario sigue siendo Release 4 y jerarquía Release 6; la UI de prototipo permanece detrás de capabilities (`inventory`, `hierarchy`).

## 2. Qué se entregó

### Mínimo vs enriquecimiento

La lista obligatoria sigue las specs, no el ejemplo del plan UX (la ubicación es opcional: LOC-001 / INV-002).

| Tipo                  | Visible de inmediato                                          | Información adicional                                                                             |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Pieza individual      | ID, nombre, categoría, condición, costo DOP (opcional)        | Marca, modelo, serial, número de parte, procedencia del costo, ubicación, atributos, notas, fotos |
| Producto por cantidad | ID, nombre, categoría, existencia inicial, costo unitario DOP | Marca, ubicación                                                                                  |
| Componente presente   | ID, nombre, condición, costo DOP (opcional)                   | Marca, serial, número de parte                                                                    |

### Stepper y persistencia

El stepper solo aparece si hay un segundo paso real (categoría de ensamblaje + capability `hierarchy`). Volver atrás no borra el formulario ni el checklist: `mergeBaselineEntries` reutiliza filas ya capturadas.

### Post-registro

Tras un alta válida el modal no se cierra con un toast genérico. Informa que la pieza o el producto quedó registrado, qué datos siguen pendientes y ofrece **Ver pieza**, **Ver producto** o **Volver al listado**, según corresponda.

Una corrección posterior protege la captura sin guardar: las salidas implícitas y **Cancelar** piden
confirmación cuando hay cambios, y todas las vías de cierre quedan bloqueadas durante el guardado.

## 3. Archivos principales

```text
apps/web/src/features/inventory/RegisterItemWizard.tsx
apps/web/src/features/inventory/PresentComponentForm.tsx
apps/web/src/features/inventory/OptionalDetails.tsx
apps/web/src/features/inventory/registration-enrichment.ts
apps/web/src/features/inventory/InventoryPage.tsx
apps/web/tests/unit/features/inventory/registration-enrichment.test.ts
apps/web/tests/component/inventory/InventoryPage.test.tsx
```

## 4. Cómo verificar

```bash
npm run test:unit -w @solocamiones/web
npm run test:component -w @solocamiones/web
```

Manual (preset `prototype`, login vendedor o admin): Inventario → Registrar. Alta mínima de una pieza: la primera pantalla no muestra serial/fotos. Producto por cantidad sigue siendo un flujo distinto. Ensamblaje Camión: Paso 1 de 2, Continuar, Paso 2 de 2; Atrás conserva IDs. Tras guardar, el mensaje lista pendientes y Ver artículo abre el detalle.

## 5. Fuera de alcance

- UX-4 en adelante (jerarquía visual de estados, tablas, POS, mecánico, responsive).
- Mínimos dinámicos por categoría (Tire/Rim) como validación de Release 4.
- Cambiar reglas de negocio o backend.

## 6. Referencias

- [`docs/plans_web/UX_FRONTEND_HARDENING_PLAN.md`](../../plans_web/UX_FRONTEND_HARDENING_PLAN.md) § UX-3
- [`docs/DEVELOPMENT_PLAN.md`](../../DEVELOPMENT_PLAN.md) Release 4 / 6
- [`docs/FEATURES/02_INVENTORY.md`](../../FEATURES/02_INVENTORY.md) INV-002
- [`docs/FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md`](../../FEATURES/07_SEARCH_LOCATION_AND_PHOTOS.md) LOC-001, PHOTO-001
- [`docs/done_web/UX_FRONTEND_HARDENING/ux-2.md`](./ux-2.md)
