# Milestone 4 — WM4: Clientes

| Campo          | Valor                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------- |
| **ID plan**    | WM4                                                                                          |
| **Estado**     | Completado                                                                                   |
| **Fecha**      | 2026-08-28                                                                                   |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM4                            |
| **Alcance**    | CRUD de clientes: búsqueda, listado con conteo de facturas, modal crear/editar, C0 protegido |
| **Siguiente**  | WM5 — Inventario: listado, búsqueda y detalle                                                |

---

## 1. Objetivo

Sustituir el placeholder de `/customers` por un directorio operable: Admin y Vendedor buscan, crean y editan clientes reutilizables. **Cliente Contado (C0)** queda marcado como predeterminado y no se edita (CUST-002).

---

## 2. Contexto previo

WM3 dejó `/customers` como `PlaceholderPage` y `MockCustomerRepository.save` sin persistir. El handoff pedía `features/customers/` sobre el repositorio existente.

---

## 3. Decisiones clave

### 3.1 Reglas en servicio puro, no en la UI

**Decisión:** `buildCustomerDirectory` y `prepareCustomerSave` concentran búsqueda, conteo de facturas, ids `C{n}`, validación y el bloqueo de C0. La página solo pinta filas y el modal.

**Por qué:** Mismo patrón que WM3. El selector POS (WM8) reutilizará `list`/`search` sin recalcular en React.

### 3.2 C0 no se muta en el servicio

**Decisión:** `prepareCustomerSave` rechaza `id === C0` o `isDefault`. El botón Editar de esa fila está deshabilitado, pero la fuente de verdad es el servicio.

**Por qué:** Endurecimiento vs Make: ocultar el botón no basta. Un `save` directo al mock también falla.

### 3.3 Conteos y persistencia

- **Facturas:** todas las del seed ligadas al `customerId` (borrador incluido). Tras reinicio: C0 = 1, C1 = 3, C2 = 1.
- **Orden:** predeterminado primero; resto por nombre (`es`).
- **Búsqueda:** nombre o RNC/Cédula. Teléfono y correo no entran en el filtro (criterio del plan).
- **Alta:** el mock asigna el siguiente id (`C3` tras el seed). `isDefault` no se acepta del cliente.
- **Campos:** nombre obligatorio; RNC, teléfono, correo, dirección y notas opcionales (CUST-001).

El cliente nuevo queda en `AppState` de la sesión mock; WM8 lo verá en el selector POS sin trabajo extra aquí.

---

## 4. Estructura añadida / modificada

```
apps/web/
├── src/
│   ├── api/contracts/customers.ts
│   ├── api/client/customers-api.ts
│   ├── mocks/
│   │   ├── services/customers.ts
│   │   └── repositories/MockCustomerRepository.ts
│   ├── shared/ui/SearchInput.tsx
│   └── features/customers/
│       ├── CustomersPage.tsx
│       ├── useCustomers.ts
│       ├── CustomerTable.tsx
│       └── CustomerFormModal.tsx
└── tests/
│   ├── unit/mocks/services/customers.test.ts
│   ├── integration/mocks/repositories/customers.repository.test.ts
│   └── component/customers/
```

**Modificados:** `entities.ts` (`address`, `notes`), `repositories.ts` (`SaveCustomerInput`, filas con `invoiceCount`), `contracts/index.ts`, `router.tsx`, `shared/ui/index.ts`.

---

## 5. Números esperados tras reinicio

| Cliente                    | Id  | Facturas                               | Editable                 |
| -------------------------- | --- | -------------------------------------- | ------------------------ |
| Cliente Contado            | C0  | 1 (FAC-000097)                         | No · chip Predeterminado |
| Logística Norte SA         | C2  | 1                                      | Sí                       |
| Transportes del Caribe SRL | C1  | 3 (borrador + FAC-000098 + FAC-000099) | Sí                       |

---

## 6. Criterios de aceptación

| Criterio                              | Estado                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| CRUD persiste en sesión mock          | ✅ `save` muta `getMockState().customers`; cubierto por tests |
| C0 no editable                        | ✅ servicio + UI                                              |
| Cliente nuevo aparece en selector POS | ⏳ WM8 — el registro ya vive en el mismo estado mock          |

---

## 7. Verificación

```bash
cd apps/web
npm test
npm run typecheck
npm run build
npm run dev
```

**Flujos manuales:**

1. Login `admin` o `laura` / `demo1234` → Clientes
2. Seed visible: C0 con chip Predeterminado y Editar deshabilitado; C1 con 3 facturas
3. Buscar `caribe` → solo Transportes del Caribe; buscar RNC `101-98765` → Logística Norte
4. Nuevo cliente → aparece en la tabla; recargar la ruta → sigue ahí
5. Editar C1 (notas) → se conserva; C0 no se puede guardar
6. Mecánico no tiene la ruta; `customers.manage` en repositorio es `FORBIDDEN`
7. Reiniciar datos demo → vuelven los 3 clientes seed

---

## 8. Fuera de alcance (WM4)

| Tema                                             | Milestone |
| ------------------------------------------------ | --------- |
| Selector de cliente en POS / default en borrador | WM8       |
| Validación fiscal RNC al confirmar               | WM8       |
| Snapshot inmutable en factura completada         | WM7       |
| Listado/detalle de inventario                    | WM5       |

---

## 9. Handoff a WM5

Listo para implementar `features/inventory/` (listado unificado, búsqueda, detalle). `SearchInput` ya está en `shared/ui`. Los clientes persisten en el mock para cuando WM8 arme el POS.

---

## 10. Referencias

- [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM4
- [`docs/done_web/plan-001/milestone-3.md`](./milestone-3.md)
- [`docs/FEATURES/08_CUSTOMERS.md`](../../FEATURES/08_CUSTOMERS.md) CUST-001, CUST-002
