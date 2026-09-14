# Milestone 6 — WM6: Registro de inventario

| Campo          | Valor                                                                |
| -------------- | -------------------------------------------------------------------- |
| **ID plan**    | WM6                                                                  |
| **Estado**     | Completado                                                           |
| **Fecha**      | 2026-08-28                                                           |
| **Referencia** | [`docs/plans_web/plan-001.md`](../../plans_web/plan-001.md) § WM6       |
| **Alcance**    | Registro individual, por cantidad y ensamblajes con baseline inicial |
| **Siguiente**  | WM7 — Ventas: listado, detalle, pagos, cancelación y PDF             |

---

## 1. Objetivo

Añadir el modal `Registrar inventario` desde `/inventory` y persistir altas en el estado mock mediante el repositorio, sin introducir lógica de negocio en los componentes.

## 2. Implementación

- `RegisterItemWizard` ofrece los modos Individual y Por cantidad.
- El formulario individual admite ID, nombre, categoría, marca, modelo, serial, número de parte, condición, costo DOP opcional, procedencia del costo, ubicación, atributos, notas y nombres de fotos simuladas.
- El modo por cantidad registra existencia inicial, costo unitario y reserva inicial cero.
- Una categoría de ensamblaje abre el segundo paso `BaselineChecklist`.
- Cada componente esperado queda como `PRESENT`, `MISSING` o `NOT_APPLICABLE`, recursivamente cuando un componente presente también es un ensamblaje.
- `PRESENT` registra una identidad real instalada bajo el padre.
- `MISSING` crea un `KnownMissingComponent` con origen `MISSING_AT_RECEIPT`.
- `NOT_APPLICABLE` no crea una identidad ni un faltante.
- La completitud de cada ensamblaje se deriva únicamente de sus faltantes directos, sin propagarse a sus ancestros.

## 3. Reglas y validaciones

- `inventory.register` se valida en `MockInventoryRepository`; Administrador y Vendedor pueden registrar, Mecánico no.
- Los IDs se comparan sin distinguir mayúsculas y son únicos entre piezas individuales y productos por cantidad.
- El servicio valida toda la operación antes de escribir, por lo que un checklist inválido no deja padres, hijos, faltantes ni eventos parciales.
- Los ensamblajes requieren exactamente una respuesta por componente esperado.
- Un ensamblaje presente requiere su propio checklist completo dentro de la misma operación de recepción.
- Un componente presente requiere datos de ítem y una categoría que corresponda al componente esperado.
- Costos no finitos o negativos y cantidades iniciales no enteras o negativas se rechazan mediante `Result`.
- Un costo individual vacío se conserva como desconocido; no se convierte silenciosamente en cero.

## 4. Archivos principales

```text
apps/web/src/
├── api/contracts/inventory.ts
├── api/contracts/repositories.ts
├── mocks/services/inventory-commands.ts
├── mocks/repositories/MockInventoryRepository.ts
└── features/inventory/
    ├── RegisterItemWizard.tsx
    ├── PhotoEditor.tsx
    ├── BaselineChecklist.tsx
    └── PresentComponentForm.tsx
```

## 5. Criterios de aceptación

| Criterio                                                                  | Estado |
| ------------------------------------------------------------------------- | ------ |
| Pieza simple aparece en el listado tras registrar                         | ✅     |
| Ensamblaje crea padre e hijos presentes                                   | ✅     |
| Faltantes crean `MISSING_AT_RECEIPT`                                      | ✅     |
| No aplica no crea inventario ficticio                                     | ✅     |
| Producto se registra con modo Por cantidad                                | ✅     |
| ID duplicado se rechaza                                                   | ✅     |
| Checklist incompleto o error profundo se rechaza sin escrituras parciales | ✅     |
| Jerarquía Camión → Motor → pieza se registra en una operación             | ✅     |
| Errores de servicio llegan a la UI mediante `Result`                      | ✅     |

## 6. Verificación

```bash
npm run typecheck -w @solocamiones/web
npm run typecheck:test -w @solocamiones/web
npm run test -w @solocamiones/web
npm run lint -- --quiet
```

Resultado: 20 archivos de prueba y 128 pruebas aprobadas.

## 7. Fuera de alcance

- Registro o edición de categorías y sus componentes esperados (WM11).
- Fotos reales y almacenamiento de objetos.
- POS, ventas y reservas adicionales (WM7–WM8).
- Órdenes de trabajo o cambios físicos posteriores al baseline (WM9–WM10).
