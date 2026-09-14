# Release 2 — Registro de lo implementado

**Release:** Billing Core  
**Plan de referencia:** [`../plans_api/plan_release_2.md`](../plans_api/plan_release_2.md)  
**Estado:** **cerrado en local** (M1–M25; exit gate 2026-09-11)

El slice financiero de Release 3 se adelantó en el mismo árbol de código; el registro está en [`release_3.md`](release_3.md), no como milestones M26+ de este archivo.

Este archivo documenta **qué se entregó** en cada milestone de Release 2, a medida que se completan.  
No sustituye a `plan_release_2.md` (plan de ejecución) ni a los feature specs; es el registro histórico de implementación.

**Nota posterior (2026-09-10):** M8–M11 registraron history de líneas (`INVOICE_LINE_*`) y M7 `INVOICE_DRAFT_UPDATED`. El owner recortó la **actividad de factura** a eventos de documento: esos tipos ya no se escriben y se ocultan en `GET /api/sales/:id` / UI. Los bullets de milestone de abajo describen lo entregado entonces; el comportamiento vigente está en [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) y [`../FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md`](../FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md).

---

## Milestone 1 — Customers persistencia

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

Clientes, contactos y `Cliente contado` persisten en PostgreSQL sin rutas HTTP.

### Qué se entregó

- Modelos Prisma `Customer` y `CustomerContact`.
- Semilla de migración de `Cliente contado` (contactos vacíos, sin RNC).
- `CustomerRepository`: create, find, search (nombre/RNC), update.
- Validación Zod reutilizable (sin Express).

### Decisiones técnicas

- Teléfono/email viven en contactos; `isPrimary` con máximo uno (índice parcial).
- RNC/Cédula se guarda solo en dígitos (9 u 11) y es unique cuando existe.
- `Cliente contado` usa UUID (el `subjectId` de history es UUID); el mock web `C0` no se replica en API.
- Unique parcial de un solo `isDefault`.

### Validación

- Integration: `apps/api/tests/integration/customers/repository.test.ts`
- Unit: `apps/api/tests/unit/customers/validation.test.ts`

### Fuera de alcance (intencional)

HTTP de customers (M2). Snapshot CUST-003 (M12). Swap web (M19).

---

## Milestone 2 — Customers HTTP

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

Search/create/edit HTTP con autorización server-side e history en la misma transacción.

### Qué se entregó

- Módulo `customers`: routes → controller → service → repository.
- `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`.
- Seller/Administrator ALLOW; Mechanic 403; CSRF en escrituras.
- History `CUSTOMER_CREATED` / `CUSTOMER_UPDATED`.
- `satisfiesFiscalIdentity` para M7/M12.
- `Cliente contado` no se edita (409).

### Decisiones técnicas

- Paginación `page` / `pageSize` como users.
- Formato fiscal: RNC 9 dígitos o cédula 11, con o sin separadores.
- El service re-chequea rol; isolation Serializable.

### Validación

- Integration: `apps/api/tests/integration/customers/http.test.ts`
- Unit history: `apps/api/tests/unit/customers/history-validation.test.ts`

### Fuera de alcance (intencional)

Facturas. Swap `HttpCustomerRepository` (M19). Comando DELETE.

---

## Milestone 3 — Catálogo de servicios persistencia

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

Tipos de servicio mecánico en PostgreSQL, sin precio y sin HTTP.

### Qué se entregó

- Modelo Prisma `MechanicalService` (`name`, `description` opcional, `active`).
- `CatalogRepository`: create/update, `listAll`, `listActive`.

### Decisiones técnicas

- Módulo `features/catalogs/` (solo servicios; sin categorías de inventario).
- Precio sigue fuera del catálogo (línea M9).

### Validación

- Integration: `apps/api/tests/integration/catalogs/repository.test.ts`
- Unit: `apps/api/tests/unit/catalogs/validation.test.ts`

### Fuera de alcance (intencional)

HTTP del catálogo (M4). Swap web (M20).

---

## Milestone 4 — Catálogo de servicios HTTP

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

CRUD Administrator y lectura Seller de servicios activos, con history en la misma transacción.

### Qué se entregó

- Módulo `catalogs` HTTP: routes → controller → service → repository.
- `GET/POST /api/catalogs/services`, `GET/PATCH /api/catalogs/services/:id`.
- Admin escribe; Seller lista/lee activos; Mechanic 403; CSRF en escrituras.
- History `SERVICE_CREATED` / `SERVICE_UPDATED` (`subjectType: MECHANICAL_SERVICE`).

### Decisiones técnicas

- Seller GET de inactivo o inexistente → 404 (no filtra solo en UI).
- Desactivar es `PATCH { active: false }`; no hay DELETE.
- Precio sigue fuera del catálogo. Isolation Serializable + re-chequeo de rol.

### Validación

- Integration: `apps/api/tests/integration/catalogs/http.test.ts`
- Unit history: `apps/api/tests/unit/catalogs/history-validation.test.ts`

### Fuera de alcance (intencional)

Línea SERVICE en draft (M9). Swap `HttpServiceRepository` (M20). Categorías de inventario (R4).

---

## Milestone 5 — Motor de cálculo ITBIS y redondeo

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

Funciones puras decimal-safe para ITBIS 18 % incluido y redondeo por línea.

### Qué se entregó

- `apps/api/src/features/sales/money/`: `calculateLineMoney`, `sumInvoiceMoney`, `roundMoney`, helpers de costo UNKNOWN.
- Unit tests SALE-003 (fiscal/no fiscal, gravado/exento, multi-línea).

### Decisiones técnicas

- `Prisma.Decimal` y HALF_UP a 2 decimales; no `number` flotante.
- ITBIS incluido solo si `fiscal === true` y la línea es gravable (GENERIC/EXTERNAL/ITEM/QTY).
- Totales = suma de líneas ya redondeadas; no extraer el 18 % del bruto combinado.
- UNKNOWN no se trata como 0. Entrega `0` es válida.

### Validación

- Unit: `apps/api/tests/unit/sales/money.test.ts`

### Fuera de alcance (intencional)

HTTP de draft (M7+). Persistencia de factura (M6). Profit (M13).

---

## Milestone 6 — Esquema Invoice, líneas y secuencia `FAC-`

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

Agregado Invoice / InvoiceLine y fila de secuencia `FAC-` en PostgreSQL, sin draft HTTP.

### Qué se entregó

- Migración `20260907180000_invoice_aggregate`.
- Enums `InvoiceStatus`, `InvoiceCurrency`, `InvoiceLineType`, `CostProvenance`.
- `SalesRepository`: `createDraft`, `findById`, `addLine`, `findSequence`, `lockSequenceForUpdate`.

### Decisiones técnicas

- Draft: `number` NULL. COMPLETED/CANCELLED exigen número (check SQL).
- Una moneda por factura (`DOP` | `USD`). `fiscal` en cabecera.
- Línea: descripción, cantidad, `unitPrice`, costo DOP + provenance, `serviceId` solo en SERVICE.
- ITEM/QTY existen en el discriminador para rechazarlos después; sin FKs de inventario.
- Secuencia singleton `FAC`, `nextValue` inicia en 1; lock `SELECT … FOR UPDATE` sin consumir.
- Checks: UNKNOWN ≠ 0; ACTUAL/ESTIMATED con monto; precio ≥ 0.

### Validación

- Integration: `apps/api/tests/integration/sales/repository.test.ts`

### Fuera de alcance (intencional)

HTTP de draft (M7). Confirmación / asignación `FAC-` (M12). Snapshot de cliente, pagos, PDF, FX.

---

## Milestone 7 — Draft HTTP cáscara

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

Crear, leer, listar, ajustar meta y descartar drafts HTTP, sin líneas ni `FAC-`.

### Qué se entregó

- Módulo `sales` HTTP: routes → controller → service → repository.
- `GET/POST /api/sales`, `GET/PATCH/DELETE /api/sales/:id`.
- POST con `currency` / `fiscal` / `customerId` opcionales; default `Cliente contado` + `DOP` + no fiscal.
- Listado de todas las facturas, filtro `status`, paginación `page` / `pageSize`.
- Descarte = borrado físico de `DRAFT`; COMPLETED/CANCELLED → 409.
- Seller/Administrator ALLOW; Mechanic 403; CSRF en escrituras.
- History `INVOICE_DRAFT_CREATED` / `INVOICE_DRAFT_UPDATED` / `INVOICE_DRAFT_DISCARDED`.
- `satisfiesFiscalIdentity`: fiscal + `Cliente contado` (u otro sin RNC/Cédula) → 409.

### Decisiones técnicas

- Totales de GET se derivan con el motor de M5 (draft vacío = `0.00`); no hay columnas de totales.
- Isolation Serializable + re-chequeo de rol, igual que customers.
- DELETE físico; history queda con `subjectId` del draft eliminado.

### Validación

- Integration: `apps/api/tests/integration/sales/http.test.ts`
- Unit: `apps/api/tests/unit/sales/validation.test.ts`, `apps/api/tests/unit/sales/history-validation.test.ts`

### Fuera de alcance (intencional)

`addLine` / líneas (M8–M11). Confirmación / `FAC-` (M12). Swap POS (M21).

---

## Milestone 8 — Draft línea GENERIC + rechazo ITEM/QTY

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

`addLine` / `removeLine` / `setLinePrice` HTTP para mercancía genérica gravada, con recálculo ITBIS y rechazo explícito de ITEM/QTY.

### Qué se entregó

- `POST /api/sales/:id/lines`, `PATCH /api/sales/:id/lines/:lineId`, `DELETE /api/sales/:id/lines/:lineId`.
- Línea GENERIC: descripción, cantidad opcional, precio final en string decimal, costo DOP ACTUAL/ESTIMATED/UNKNOWN.
- Recálculo con el motor de M5 en cada mutación; GET/POST/PATCH/DELETE devuelven el draft con totales.
- History `INVOICE_LINE_ADDED` / `INVOICE_LINE_UPDATED` / `INVOICE_LINE_REMOVED` en la misma transacción.
- ITEM/QTY → 409 de negocio; SERVICE/DELIVERY/EXTERNAL → 409 (M9–M11).

### Decisiones técnicas

- Dinero HTTP como `string`; se rechaza `number` flotante y placeholders (`N/A`).
- UNKNOWN no acepta monto; el check SQL sigue impidiendo UNKNOWN=0.
- Isolation Serializable + re-chequeo de rol, igual que la cáscara M7.
- Totales siguen derivados; no hay columnas de totales.

### Validación

- Integration: `apps/api/tests/integration/sales/http.test.ts` (bloque M8)
- Unit: `apps/api/tests/unit/sales/validation.test.ts`, `history-validation.test.ts`, `money.test.ts` (`parsePositiveDecimal`)

### Fuera de alcance (intencional)

SERVICE/DELIVERY/EXTERNAL (M9–M11). Confirmación / `FAC-` (M12). Swap POS (M21).

---

## Milestone 9 — Draft línea SERVICE

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

`addLine` HTTP acepta servicio de catálogo activo con precio negociado no gravado.

### Qué se entregó

- `POST /api/sales/:id/lines` con `type: SERVICE`, `serviceId` y `unitPrice` (string decimal).
- Descripción opcional: si falta, se copia el `name` del catálogo.
- Recálculo M5: la línea SERVICE suma al bruto y no extrae ITBIS, incluso en factura fiscal.
- `PATCH` de precio y `DELETE` de línea reutilizan M8.
- History `INVOICE_LINE_ADDED` / `INVOICE_LINE_UPDATED` en la misma transacción, preservando `serviceId`.

### Decisiones técnicas

- Contrato acordado: `serviceId` + `unitPrice` obligatorios; `description` opcional; `quantity` y costo rechazados (400).
- Inactivo → 409; `serviceId` inexistente → 404; `unitPrice` `0.00` permitido.
- `CatalogRepository.findById` corre en la misma transacción Serializable que el `addLine`.
- PostgreSQL exige `serviceId` no nulo para toda línea `SERVICE`, además de impedirlo en otros tipos.
- Seller escribe la línea; no escribe el catálogo (403 en `POST /api/catalogs/services`).
- DELIVERY/EXTERNAL siguen 409.

### Validación

- Integration: `apps/api/tests/integration/sales/http.test.ts` (bloque M9)
- Integration: `apps/api/tests/integration/sales/repository.test.ts` (constraint de `serviceId` requerido)
- Unit: `apps/api/tests/unit/sales/validation.test.ts` (schema SERVICE)
- Unit: `apps/api/tests/unit/sales/history-validation.test.ts` (snapshot con `serviceId`)

### Fuera de alcance (intencional)

DELIVERY/EXTERNAL (M10–M11). Confirmación / `FAC-` (M12). Swap POS (M21).

---

## Milestone 10 — Draft línea DELIVERY

**Estado:** completado  
**Fecha:** 2026-09-07

### Objetivo cumplido

`addLine` HTTP acepta una línea DELIVERY no gravada: omitida (sin fila), gratis (`0`) o cobrada (positivo).

### Qué se entregó

- `POST /api/sales/:id/lines` con `type: DELIVERY`, `description` y `unitPrice` (string decimal, incluye `0.00`).
- Descripción obligatoria y no vacía, conforme a `LINE-006`.
- Recálculo M5: la línea no extrae ITBIS, incluso en factura fiscal.
- `PATCH` de precio y `DELETE` reutilizan M8; tras borrar se puede volver a agregar.
- History `INVOICE_LINE_ADDED` / `INVOICE_LINE_UPDATED` / `INVOICE_LINE_REMOVED` en la misma transacción.

### Decisiones técnicas

- Contrato: `unitPrice` y `description` obligatorios; `quantity` y costo rechazados (400).
- Máximo una DELIVERY por factura: segundo POST → 409; unique parcial SQL `InvoiceLine_one_delivery_per_invoice`.
- Prisma identifica ese unique como `target: ["invoiceId"]` y puede reportar `modelName: "Invoice"` en escrituras anidadas; ambos caminos se traducen al mismo 409 de negocio.
- El CHECK existente mantiene la descripción no vacía para todos los tipos de línea.
- Seller escribe la línea. EXTERNAL sigue 409.

### Validación

- Integration: `apps/api/tests/integration/sales/http.test.ts` (bloque M10)
- Integration: `apps/api/tests/integration/sales/repository.test.ts` (CHECK de descripción + unique traducido a conflicto)
- Unit: `apps/api/tests/unit/sales/validation.test.ts` (schema DELIVERY)

### Fuera de alcance (intencional)

EXTERNAL (M11). Confirmación / `FAC-` (M12). Swap POS (M21).

---

## Milestone 11 — Draft línea EXTERNAL + costo

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

`addLine` HTTP acepta reventa externa gravada con costo DOP (actual/estimado/desconocido), sin fingir stock local.

### Qué se entregó

- `POST /api/sales/:id/lines` con `type: EXTERNAL`, descripción, `unitPrice`, `costProvenance` y costo DOP.
- `quantity` opcional (si falta, `1`), igual que GENERIC.
- Recálculo M5: la línea extrae ITBIS incluido cuando la factura es fiscal.
- `PATCH` de precio y `DELETE` reutilizan M8.
- History `INVOICE_LINE_ADDED` / `INVOICE_LINE_UPDATED` / `INVOICE_LINE_REMOVED` en la misma transacción.
- ITEM/QTY siguen 409; no hay tablas de inventario que mutar.

### Decisiones técnicas

- Contrato: mismas reglas de costo que GENERIC (COST-001). `UNKNOWN` no acepta monto; el check SQL sigue impidiendo UNKNOWN=0.
- Schema Zod compartido GENERIC/EXTERNAL para no divergir las reglas de provenance.
- Seller escribe la línea. Confirmación y profit quedan en M12/M13.

### Validación

- Integration: `apps/api/tests/integration/sales/http.test.ts` (bloque M11)
- Integration: `apps/api/tests/integration/sales/repository.test.ts` (persistencia EXTERNAL UNKNOWN)
- Unit: `apps/api/tests/unit/sales/validation.test.ts` (schema EXTERNAL)
- Unit: `apps/api/tests/unit/sales/history-validation.test.ts` (snapshot `type: EXTERNAL`)

### Fuera de alcance (intencional)

Confirmación / `FAC-` (M12). Profit Administrator (M13). Swap POS (M21).

---

## Milestone 12 — Confirmación + `FAC-` + snapshot de cliente

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Confirmar un draft válido en una transacción: número `FAC-` único, snapshot inmutable de cliente y dinero, estado `Completed`.

### Qué se entregó

- `POST /api/sales/:id/confirm` (body vacío `{}`; CSRF; Seller/Administrator).
- Asignación `FAC-000001` (secuencia compartida DOP/USD; lock `FOR UPDATE`).
- Snapshot de cliente `name` + `rnc` y columnas de dinero `gross`/`base`/`itbis` en cabecera y líneas.
- History `INVOICE_CONFIRMED` en la misma transacción.
- Idempotencia: un segundo POST al completed devuelve 200 y el mismo `FAC-`.

### Decisiones técnicas

- Draft vacío → 409. Payload de pago u otros campos → 400.
- GET de completed proyecta el snapshot, no el cliente vivo.
- PDF y FX quedan fuera de la transacción. Isolation Serializable, igual que el draft.
- Los conflictos PostgreSQL `40001` del lock raw de la secuencia se reintentan igual que `P2034`.
- La migración materializa snapshot y dinero para facturas finalizadas antes de M12 antes de exigir las nuevas restricciones; usa los datos actuales del cliente y `updatedAt` porque el snapshot histórico todavía no existía.

### Validación

- Integration: `apps/api/tests/integration/sales/http.test.ts` (bloque M12)
- Integration: `apps/api/tests/integration/sales/repository.test.ts` (allocate + complete)
- Unit: `apps/api/tests/unit/sales/validation.test.ts`, `history-validation.test.ts`

### Fuera de alcance (intencional)

Profit (M13). PDF (M17). Swap web de confirmación (M22).

---

## Milestone 13 — Rentabilidad DOP + frontera Administrator

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Calcular profit DOP sobre el snapshot completed y proyectarlo solo a Administrator, omitiendo esos campos para Seller.

### Qué se entregó

- Motor `calculateLineProfitDop` / `sumCalculatedProfit`: precio de venta (gross) − costo ACTUAL/ESTIMATED; UNKNOWN → `UNAVAILABLE` / `UNKNOWN_COST` (nunca 0).
- SERVICE/DELIVERY: el precio de venta cuenta entero como profit (sin COGS).
- Total de factura: si cualquier línea aplicable tiene costo `UNKNOWN`, queda `UNAVAILABLE / UNKNOWN_COST`; las líneas conocidas conservan su cálculo individual y nunca se presenta un subtotal parcial como profit total.
- GET, confirm y list: Administrator recibe `profitability` (`profitDop` + `margin` % sobre el precio de venta) en completed DOP.
- Seller sigue viendo `acquisitionCostDop`; no recibe claves de profit.
- Completed USD: `UNAVAILABLE` / `PENDING_FX_RATE` (sin restar monedas). Drafts no proyectan profit.
- Mechanic 403 en `/api/sales`.

### Decisiones técnicas

- Derivado al leer, sin columnas nuevas. M14/M15 persistirán status cuando lo necesiten.
- La omisión de profit es en `toPublicInvoice` según `role`, no en la UI.
- `margin` es porcentaje a dos decimales del precio de venta (gross). Precio 0 → `margin` null.
- History de confirmación no incluye profit (no hay hecho persistido).

### Validación

- Unit: `apps/api/tests/unit/sales/money.test.ts` (profit DOP)
- Integration: `apps/api/tests/integration/sales/http.test.ts` (bloque M13)

### Fuera de alcance (intencional)

COST-005 (M14). FX/retry (M15–M16). PDF (M17). Swap web de rentabilidad (M24).

---

## Milestone 14 — COST-005 profit juzgado

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Administrator registra un importe DOP de ganancia bruta cuando el profit calculado no existe por costo desconocido.

### Qué se entregó

- Columnas `Invoice.manualGrossProfitDop` / `manualGrossProfitAt` (CHECK: ambas nulas o ambas en `COMPLETED`).
- `POST /api/profitability/:invoiceId/manual-gross-profit` (CSRF; solo Administrator).
- Proyección Admin: `status: MANUAL`, `reason: null`, `profitDop` + `margin` a nivel factura; las líneas UNKNOWN siguen `UNAVAILABLE`.
- History `INVOICE_GROSS_PROFIT_RECORDED` con before/after en la misma transacción.
- Totales de list/GET completed incluyen el monto MANUAL.

### Decisiones técnicas

- El cálculo COST-003 tiene precedencia: ACTUAL/ESTIMATED no se pisan. USD `PENDING_FX_RATE` se rechaza (M15/M16).
- Cero y negativo permitidos; razón no obligatoria; el costo de adquisición no cambia.
- El comando vive en el módulo `profitability` y persiste en el agregado `sales` (snapshot de factura).
- Seller/Mechanic 403 en el comando; Seller sigue sin recibir `profitability` en GET.

### Validación

- Unit: `apps/api/tests/unit/sales/money.test.ts` (overlay MANUAL)
- Unit: `apps/api/tests/unit/profitability/validation.test.ts`
- Unit: `apps/api/tests/unit/sales/history-validation.test.ts`
- Integration: `apps/api/tests/integration/profitability/http.test.ts`

### Fuera de alcance (intencional)

FX/retry (M15–M16). Snapshot HTTP de rentabilidad (M24). Swap web (M24).

---

## Milestone 15 — Adaptador FX + pending

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Enriquecer facturas USD con la tasa USD→DOP de ExchangeRate-API sin bloquear ni revertir la confirmación. Si no hay tasa, la venta queda `COMPLETED` y el profit Admin es `UNAVAILABLE / PENDING_FX_RATE`.

### Qué se entregó

- Adaptador en `infrastructure/fx`: interfaz `FxRateProvider`, cliente Pair `USD/DOP`, double de tests que no llama a la red.
- Persistencia de provenance en `Invoice` (`exchangeRateDopPerUsd`, fuente, `time_last_update_*`, obtención local).
- Confirmación USD intenta FX **después** de commitear M12. Fallo/timeout/`quota-reached`/clave ausente → pending, `FAC-` intacto.
- Cálculo COST-003: `costUsd = storedCostDop / rate`, `profitUsd = priceUsd - costUsd`, `profitDop = profitUsd * rate`; los valores USD intermedios conservan precisión decimal completa y solo se redondea la salida final.
- Margen COST-005 de facturas USD: tanto el profit manual como el total de venta usado como denominador se expresan en DOP mediante la tasa preservada.
- Seller no recibe pending, profit ni tasas. DOP no llama FX. COST-005 sigue sin cerrar pending FX.

### Decisiones técnicas

- Timeout acotado a 3 s (`EXCHANGE_RATE_API_TIMEOUT_MS`). No se invierte `conversion_rate`.
- Pending se deriva (USD completed sin tasa). La tasa se persiste para que el resultado no cambie con tasas live posteriores.
- En `NODE_ENV=test` el proveedor por defecto es unavailable; los tests inyectan un double.
- Retry Admin es M16; el segundo confirm idempotente no vuelve a pedir tasa.

### Validación

- Unit: `apps/api/tests/unit/sales/money.test.ts` (división USD/DOP)
- Unit: `apps/api/tests/unit/infrastructure/fx.test.ts`
- Integration: `apps/api/tests/integration/sales/fx-http.test.ts`
- Integration: `apps/api/tests/integration/sales/http.test.ts` (USD pending por defecto)

### Fuera de alcance (intencional)

Retry FX (M16). PDF (M17). Swap web de rentabilidad (M24).

---

## Milestone 16 — Retry FX Administrator

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Completar el cálculo USD (COST-003) sin reejecutar la venta, pidiendo a ExchangeRate-API la tasa histórica del día UTC de `confirmedAt`. Si esa tasa no existe (plan Free, timeout, error), la factura sigue `COMPLETED` con `PENDING_FX_RATE`.

### Qué se entregó

- `POST /api/profitability/:invoiceId/retry` (CSRF; solo Administrator).
- Lookup histórico `history/USD/{year}/{month}/{day}` (`conversion_rates.DOP`). Confirmación M15 sigue usando Pair live.
- History `INVOICE_USD_FX_RETRIED` en cada intento que consulta FX (RECORDED o UNAVAILABLE).
- 409 si el proveedor no da histórica, si ya hay tasa, o si la factura no es USD completed. COST-005 sigue sin cerrar pending FX.

### Decisiones técnicas

- Día UTC de `confirmedAt`; no se persiste Pair live como si fuera la tasa de la venta.
- El FX se consulta fuera de la transacción comercial; solo se escriben columnas FX + history.
- Seller/Mechanic 403. Swap web de rentabilidad es M24.

### Validación

- Unit: `apps/api/tests/unit/infrastructure/fx.test.ts` (histórico)
- Unit: `apps/api/tests/unit/sales/history-validation.test.ts`
- Integration: `apps/api/tests/integration/profitability/fx-retry-http.test.ts`

### Fuera de alcance (intencional)

PDF (M17). Swap web de rentabilidad (M24). Endpoint de recovery HTTP.

---

## Milestone 17 — PDF generar + estado de fallo

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Emitir el PDF interno desde el snapshot completed, fuera de la transacción de venta. Un fallo deja la factura `COMPLETED` con `FAC-` y estado operativo `FAILED` + `errorId`.

### Qué se entregó

- Columnas `Invoice.pdfStatus` / `pdfErrorId` / `pdfGeneratedAt` / `pdfTemplateVersion` (sin bytes).
- Tras el primer `confirm`, render pdfkit; `GET /api/sales/:id/pdf` vuelve a renderizar si `READY` y responde 409 si `FAILED`.
- Proyección `document: { status, errorId? }` en GET/confirm completed.
- History `INVOICE_PDF_GENERATED` / `INVOICE_PDF_FAILED` en la transacción del estado PDF.
- Mechanic 403; Seller descarga una factura que puede ver.
- La metadata PDF `READY`/`FAILED` sigue siendo válida si una factura pasa posteriormente a `CANCELLED`.

### Decisiones técnicas

- Opción A de infraestructura: el snapshot es la fuente de verdad; no hay S3 ni `BYTEA`.
- El segundo confirm idempotente no reintenta el PDF (regenerar es M18).
- Renderer inyectable (`InvoicePdfRenderer`), igual que `FxRateProvider`.
- Plantilla `internal-v1` versionada: la descarga usa `pdfTemplateVersion`, conserva writers anteriores y rechaza una versión desconocida en vez de emitir otro documento.
- El layout no es el diseño legal final; una futura plantilla debe registrarse como una versión nueva sin modificar el writer anterior.

### Validación

- Unit: `apps/api/tests/unit/infrastructure/invoice-pdf.test.ts`
- Unit: `apps/api/tests/unit/sales/history-validation.test.ts`
- Integration: `apps/api/tests/integration/sales/pdf-http.test.ts`
- Regresión: metadata preservada al cancelar, versión persistida entregada al renderer y rechazo de versiones desconocidas.

### Fuera de alcance (intencional)

Regeneración Administrator (M18). Swap web (M23). S3 / DGII / NCF real.

---

## Milestone 18 — PDF regenerar Administrator

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Regenerar un PDF `FAILED` desde el snapshot completed, sin reabrir la venta ni asignar otro `FAC-`. Solo Administrator (ADMIN-002 slice).

### Qué se entregó

- `POST /api/sales/:id/pdf/regenerate` (CSRF; solo Administrator).
- Elegible únicamente con factura `COMPLETED` y `pdfStatus FAILED`.
- Render pdfkit (o double) fuera de la transacción comercial; persistencia de `pdfStatus` + history en una transacción corta.
- Si el render vuelve a fallar: HTTP 200, factura `COMPLETED`, `document.status FAILED` y nuevo `errorId`.
- Seller reimprime `READY` con `GET /pdf`; no regenera `FAILED` (403).

### Decisiones técnicas

- No hay `reason` en el body (igual que el retry FX de M16).
- `GET` de un PDF `READY` ya vuelve a pintar el snapshot; no se regenera `READY` por POST.
- `recordPdfStatus` solo actualiza filas con el `pdfStatus` esperado (`null` en M17, `FAILED` en M18).
- La autorización Administrator se revalida después del render, dentro de la misma transacción que persiste `pdfStatus` y history, para que una revocación concurrente no complete la recuperación.
- El manejo del fallo de render termina antes de persistir; los errores de autorización o persistencia no se reclasifican como fallos del renderer.

### Validación

- `npm run typecheck -w @truck-parts/api` — aprobado.
- `npm exec -w @truck-parts/api -- vitest run tests/unit/infrastructure/invoice-pdf.test.ts tests/unit/sales/history-validation.test.ts` — 2 archivos, 8 pruebas aprobadas.
- `npm run test:integration -w @truck-parts/api -- tests/integration/sales/pdf-http.test.ts` — 1 archivo, 9 pruebas aprobadas.
- `npm run test:integration -w @truck-parts/api -- tests/integration/sales` — 4 archivos, 47 pruebas aprobadas.
- La integración cubre éxito, nuevo fallo, autorización/CSRF/estados no elegibles y revocación concurrente del rol durante el render.

### Fuera de alcance (intencional)

Swap web (M23). S3 / DGII / NCF real. Resto de ADMIN-002 (reservas, OT, evidencia, diagnósticos).

---

## Milestone 19 — Web: customers HTTP

**Estado:** completado  
**Fecha:** 2026-09-08

### Objetivo cumplido

Sustituir el mock de `CustomerRepository` por la API de M2. CUST-001/002 funcionan en `/customers` con `VITE_USE_MOCK_API=false`.

### Qué se entregó

- `customers-api.ts` y `HttpCustomerRepository`: list, search, getById, save.
- Cookie same-origin y CSRF `X-Requested-With` en POST/PATCH, igual que usuarios (R1 M11).
- Paginación completa (`page` / `pageSize` 100) para conservar el directorio de una sola lista.
- `VITE_USE_MOCK_API=false` activa capability `customers` además de `users`. POS, PDF y profit siguen apagados.
- Columna Facturas eliminada del directorio (el conteo era mock; CxC/deuda no es alcance de R2).
- Errores conocidos de validación se presentan en español y se asocian al campo correspondiente sin exponer mensajes internos del API.

### Decisiones técnicas

- Alta = `POST /api/customers`; edición = `PATCH /api/customers/:id`. El mapa HTTP del prototipo decía PUT y se alineó a M2.
- `Cliente contado` se reconoce por `isDefault` (UUID de API), no por el id mock `C0`.
- `invoiceCount` se retiró del contrato de filas. Un módulo de saldo y facturas pendientes queda para CxC (Release 3), no se aproxima aquí.
- Mechanic: sin nav; `/customers` es acceso no autorizado y no llama a la API.
- Al eliminar un contacto después de una validación fallida se descartan los errores indexados `contacts.*`; así no se reasignan a otra fila cuando cambian los índices del formulario.

### Validación

- Unit: `apps/web/tests/unit/api/http-customers.test.ts`
- Unit: `apps/web/tests/unit/shared/errors/present-app-error.test.ts`
- Unit: `apps/web/tests/unit/shared/config/capabilities.test.ts` (modo HTTP)
- Component: `apps/web/tests/component/customers/HttpCustomersFlow.test.tsx`
- Component: `apps/web/tests/component/customers/CustomerFormModal.test.tsx` (errores indexados al quitar contactos)
- Component: `apps/web/tests/component/customers/CustomersPage.test.tsx` (sin columna Facturas)
- Verificación frontend: typecheck de aplicación y pruebas, lint, 301 unitarias, 68 integraciones y 148 pruebas de componentes.

### Fuera de alcance (intencional)

POS/pagos/OT (siguen stub). Snapshot CUST-003 en UI (M22). Swap de servicios (M20). CxC: total adeudado y facturas pendientes por cliente.

---

## Milestone 20 — Web: catálogo de servicios HTTP

**Estado:** completado  
**Fecha:** 2026-09-09

### Objetivo cumplido

Sustituir el mock de `ServiceRepository` por la API de M4. El Administrator mantiene servicios en `/catalogs` con `VITE_USE_MOCK_API=false`, sin abrir categorías de inventario ni el POS.

### Qué se entregó

- `catalogs-api.ts` y `HttpServiceRepository`: list/save.
- Cookie same-origin y CSRF `X-Requested-With` en POST/PATCH, igual que clientes (M19).
- `VITE_USE_MOCK_API=false` activa capability `catalogs` además de `users` y `customers`. Inventario, POS, PDF y profit siguen apagados.
- En HTTP, `/catalogs` muestra solo servicios (sin pestaña ni llamadas de categorías).
- Seller y Mechanic no entran a `/catalogs` (sin nav; pantalla de acceso no autorizado; no llaman a la API). El Seller usará el catálogo en el POS (M21).

### Decisiones técnicas

- Alta = `POST /api/catalogs/services`; edición/activar-desactivar = `PATCH /api/catalogs/services/:id`. El mapa HTTP del prototipo decía PUT y se alineó a M4.
- Los PATCH son parciales: editar el nombre no reescribe `active` y activar/desactivar no reenvía un nombre potencialmente obsoleto.
- No se envía ni se muestra `description` del catálogo. La nota opcional de una línea SERVICE en factura queda para M21.
- Las categorías de inventario siguen en `HttpCategoryRepository` stub. La pestaña Categorías solo aparece cuando `inventory` está activo (mock R4/prototipo).
- Precio sigue fuera del catálogo.

### Validación

- Unit: `apps/web/tests/unit/api/http-services.test.ts`
- Unit: `apps/web/tests/unit/shared/config/capabilities.test.ts` (modo HTTP)
- Component: `apps/web/tests/component/catalogs/HttpCatalogsFlow.test.tsx`
- Component: `apps/web/tests/component/catalogs/CatalogsPage.test.tsx` (mock con categorías intacto)

### Fuera de alcance (intencional)

POS/líneas SERVICE HTTP (M21). Categorías de inventario (R4). Campo description del catálogo en UI. Nota de línea en factura.

---

## Milestone 21 — Web: POS draft + líneas soportadas

**Estado:** completado  
**Fecha:** 2026-09-09

### Objetivo cumplido

Cablear el subset draft de sales a HTTP con las cuatro líneas R2. POS usable con `VITE_USE_MOCK_API=false`. Confirmación, PDF y profit siguen stub.

### Qué se entregó

- `sales-api.ts` y `HttpSalesRepository`: `createDraft`, `getDraft`, `addLine`, `removeLine`, `setLinePrice`, `setDraftMeta`, `discardDraft` y listado de drafts.
- Cookie same-origin y CSRF `X-Requested-With` en POST/PATCH/DELETE.
- `VITE_USE_MOCK_API=false` activa capability `sales` además de `users`, `customers` y `catalogs`. Payments, cancelación, inventario, PDF y profit siguen apagados.
- POS solo GENERIC / SERVICE / DELIVERY / EXTERNAL. ITEM/QTY no aparecen.
- Listado HTTP: solo drafts (`ALL`/`DRAFT`). Tabs COMPLETED/CANCELLED vacíos sin llamar completed.
- GENERIC y EXTERNAL envían `costProvenance` (`UNKNOWN` sin monto; `ACTUAL` con monto). El POS pide costo opcional también en GENERIC.
- Botón Confirmar visible; en HTTP no abre el modal ni llama `confirmInvoice`.

### Decisiones técnicas

- Descarte = `DELETE /api/sales/:id` (el mapa del prototipo decía POST `/discard`).
- `PosDraftView` se compone: factura HTTP + listado de clientes (M19) + servicios activos (M20). `items`/`qtyProducts` vacíos.
- Dinero HTTP en string decimal; la UI sigue usando `number` en el borde.
- Inicio/`/dashboard` no entra en HTTP: el snapshot de dashboard no está swapado. Admin/Seller aterrizan en `/sales`.
- Mechanic: sin nav de ventas; `/sales` es acceso no autorizado y no llama a la API.
- Fiscal con `Cliente contado` queda bloqueado en el checkbox (sin RNC) y el API sigue respondiendo 409 si se intenta.

### Validación

- Unit: `apps/web/tests/unit/api/http-sales.test.ts`
- Unit: `apps/web/tests/unit/shared/config/capabilities.test.ts` (modo HTTP)
- Unit: `apps/web/tests/unit/shared/errors/present-app-error.test.ts` (fiscal de factura)
- Component: `apps/web/tests/component/sales/HttpSalesFlow.test.tsx`

### Fuera de alcance (intencional)

Confirmación / `FAC-` (M22). PDF (M23). Rentabilidad (M24). Pagos, cancelar, corregir moneda. Líneas ITEM/QTY.

---

## Milestone 22 — Web: confirmación HTTP

**Estado:** completado  
**Fecha:** 2026-09-09

### Objetivo cumplido

Confirmar drafts HTTP reales sin cobro. El POS emite `FAC-`, el listado/detalle completed muestran snapshot, líneas, totales e ITBIS. PDF y profit siguen stub.

### Qué se entregó

- `confirmInvoiceWithHttp`: `POST /api/sales/:id/confirm` con body `{}` y CSRF. Un payload de pago de la UI no se envía.
- Listado HTTP: `DRAFT` y `COMPLETED` (ALL combina ambos). `CANCELLED` sigue vacío sin llamar al API.
- `getInvoiceWithHttp` para el detalle completed. Acciones PDF/pago/cancelar/profit apagadas.
- El botón Confirmar abre el modal en HTTP. Capability `payments` off: no hay pago inicial.

### Decisiones técnicas

- Confirmación mock y drafts HTTP no se mezclan: el mismo `HttpSalesRepository` confirma y lista completed.
- Filas completed navegan a `/sales/:id`. El GET de completed proyecta el snapshot de cliente, no el cliente vivo.
- `payments`, `profitability` y PDF siguen off en HTTP.

### Validación

- Unit: `apps/web/tests/unit/api/http-sales.test.ts`
- Component: `apps/web/tests/component/sales/HttpSalesFlow.test.tsx`

### Fuera de alcance (intencional)

PDF (M23). Rentabilidad (M24). Pagos, cancelar, corregir moneda. Inventario.

---

## Milestone 23 — Web: PDF HTTP

**Estado:** completado  
**Fecha:** 2026-09-10

### Objetivo cumplido

Imprimir/descargar el PDF interno desde facturas completed HTTP y regenerarlo cuando el estado es `FAILED`. SALE-004 queda en la UI local.

### Qué se entregó

- `document` en el detalle HTTP: `READY` habilita preview/download; `FAILED` muestra el error y `errorId`.
- `GET /api/sales/:id/pdf` como blob (cookies same-origin). `POST /api/sales/:id/pdf/regenerate` con CSRF, solo Administrator.
- Vista previa HTTP usa los bytes pdfkit, no el HTML del prototipo mock. El NCF en blanco sigue visible en el marco de la vista previa.
- Profit HTTP sigue apagado (M24). Pagos y cancelación **sí** se cablearon después en HTTP (ver `release_3.md`); esta nota de M23 quedó histórica.

### Decisiones técnicas

- No hay capability `pdf`: el PDF es una acción del detalle, no un módulo de navegación.
- `httpClientBlob` distingue `application/pdf` de un envelope JSON de error (409 `FAILED`).
- Regeneración oculta al Seller en UI; el API sigue siendo la autoridad (`requireAdministrator`).
- El mock conserva la vista previa HTML y no modela `FAILED`.

### Validación

- Unit: `apps/web/tests/unit/api/http-sales.test.ts`
- Unit: `apps/web/tests/unit/shared/errors/present-app-error.test.ts`
- Component: `apps/web/tests/component/sales/HttpSalesFlow.test.tsx`
- Component: `apps/web/tests/component/sales/InvoiceDetailPage.test.tsx` (mock HTML intacto)

### Fuera de alcance (intencional)

Rentabilidad (M24). Harness de fallo PDF en UI de demo. S3 / DGII / NCF real.

---

## Milestone 24 — Web: rentabilidad HTTP

**Estado:** completado  
**Fecha:** 2026-09-11

### Objetivo cumplido

Superficie Administrator de profit DOP, COST-005 y retry FX contra la API, con `VITE_USE_MOCK_API=false`. Seller no ve profit.

### Qué se entregó

- `profitability-api.ts` y `HttpProfitabilityRepository`: snapshot compuesto de `GET /api/sales?status=COMPLETED` (paginado), `POST /api/profitability/:invoiceId/retry`, `POST /api/profitability/:invoiceId/manual-gross-profit`.
- Cookie same-origin y CSRF `X-Requested-With` en los POST.
- `VITE_USE_MOCK_API=false` activa capability `profitability`. El detalle HTTP mapea `profitability` del GET de sales al panel Admin.
- El botón/KPI de tasa de cambio de demostración no existe en HTTP (`setFxAvailable` sigue stub). El mock lo conserva.

### Decisiones técnicas

- No hay `GET /api/profitability`: el snapshot se arma en el cliente a partir del listado completed (decisión del owner).
- El mapeo `CALCULATED`/`UNAVAILABLE`/`MANUAL` → vista web ocurre en el adaptador; no se recalcula profit en el browser.
- Seller/Mechanic: `/profitability` es acceso no autorizado y no llama al listado. El API sigue omitiendo profit para Seller en GET/list.
- Dashboard KPIs de ganancia y recovery retry permanecen sin swap.

### Validación

- Unit: `apps/web/tests/unit/api/http-profitability.test.ts`
- Unit: `apps/web/tests/unit/api/http-sales.test.ts` (mapeo de profit en detalle)
- Unit: `apps/web/tests/unit/shared/config/capabilities.test.ts` (modo HTTP)
- Unit: `apps/web/tests/unit/shared/errors/present-app-error.test.ts`
- Component: `apps/web/tests/component/profitability/HttpProfitabilityFlow.test.tsx`
- Component: `apps/web/tests/component/sales/HttpSalesFlow.test.tsx` (panel Admin; Seller sin profit)

### Fuera de alcance (intencional)

Exit gate (M25). Dashboard. `setFxAvailable`. Corrección de costo INV-006. Recovery HTTP.

---

## Milestone 25 — Exit gate Release 2

**Estado:** completado  
**Fecha:** 2026-09-11

### Objetivo cumplido

El Seller puede, en local, seleccionar/crear cliente o `Cliente contado`, crear un Draft, agregar líneas no-inventario, confirmar DOP/USD, recibir `FAC-` único e imprimir/regenerar el PDF interno, sin efectos falsos de inventario. El owner confirmó el recorrido en navegador. La suite automatizada del testing focus R2 quedó verde.

### Qué se entregó

Cierre documental del exit gate, más endurecimiento local **aún en alcance R2** (no un milestone de producto nuevo):

- [`docs/TESTING.md`](../TESTING.md) inventario actualizado (web 602 / API unit 223; integración API 181 en inventario).
- Feature 14: retry FX HTTP ya no se describe como stub.
- [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) y este plan: Release 2 COMPLETED en local.
- COST-001: PATCH de línea draft conserva `costProvenance` si el body no lo envía; UNKNOWN explícito no es cero.
- UX: `SelectMenu` (listbox en portal), `NavDrawer`, `login-return-path` (logout no reusa la URL previa), preset de rentabilidad `Hoy`.
- Compose: `EXCHANGE_RATE_API_KEY` hacia el servicio `api`.

### Decisiones técnicas

- No se bajaron aserciones. Un PATCH de precio no debe clobber COST-001.
- Checklists 08/10/11 del slice R2 ya estaban cubiertos; no se marcaron ítems de inventario/recovery.
- Hosting / HTTPS / filtros CxC Feature 12 / dashboard KPIs siguen fuera.
- SelectMenu no es un feature de negocio; es el control compartido que el POS/catálogos/rentabilidad ya necesitaban tras el rediseño de `<select>`.

### Validación

| Verificación | Resultado |
|---|---|
| Exit gate en navegador (owner) | Confirmado 2026-09-11 |
| Unitarias API | **223 aprobadas** (35 archivos) |
| Unitarias web | **349 aprobadas** (42 archivos) |
| Integración web (mock) | **69 aprobadas** (10 archivos) |
| Componentes web | **184 aprobadas** (39 archivos) |
| Typecheck app + tests web | OK en el cierre M25; no reejecutado en la pasada de inventario posterior |
| Integración API / PostgreSQL | **181** en inventario (22 archivos, incluye `cost-provenance-http`). Reejecución completa bloqueada aquí por `prisma migrate reset` |

Total inventario: **148 archivos, 1006 pruebas**.

### Fuera de alcance (intencional)

Filtros CxC (R3 restante). Inventario, recovery, DGII. Primer despliegue productivo. Aging.
