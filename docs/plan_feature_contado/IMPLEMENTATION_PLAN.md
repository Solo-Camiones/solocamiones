# Plan por milestones — Conduces comerciales

**Estado inicial:** Planificado  
**Prioridad:** Requerido antes del primer release productivo

## Reglas de seguimiento y documentación

- Este archivo registrará el estado de cada milestone: `Pendiente`, `En progreso`, `Completado localmente` o `Verificado`.
- Al comenzar un milestone se anotará la fecha, alcance y cualquier decisión nueva.
- Al terminarlo se documentarán:
  - archivos y módulos implementados;
  - migraciones aplicadas;
  - pruebas ejecutadas y resultado;
  - decisiones o desviaciones;
  - pendientes trasladados al siguiente milestone.
- Los requisitos canónicos vivirán en `docs/FEATURES/16_CONDUCES.md`; este plan solo define el orden técnico y registra el progreso.
- Cada milestone actualizará también los documentos relacionados que haya afectado: `DEVELOPMENT_PLAN`, `FEATURES/README`, Features 08/10/11/12/13/14, roles, arquitectura y flujos.
- No se marcará un criterio de aceptación `[x]` hasta que exista implementación y prueba correspondiente.

## Estado de milestones

| ID | Milestone | Estado |
|---|---|---|
| M1 | Formalizar reglas y criterios de aceptación | Completado localmente (2026-09-20) |
| M2 | Migración y modelo de dominio | Completado localmente (2026-09-20) |
| M3 | Motor de emisión y conversión | Completado localmente (2026-09-20) |
| M4 | Pagos, vencimiento, CxC y cancelación | Completado localmente (2026-09-20) |
| M5 | PDFs y fiscalidad manual | Pendiente |
| M6 | Reportes, rentabilidad e historial | Pendiente |
| M7 | Integración web y mocks | Pendiente |
| M8 | Estabilización y exit gate preproducción | Pendiente |

---

## Milestone 1 — Formalizar reglas y criterios de aceptación

**Objetivo:** Convertir todas las decisiones confirmadas en documentación canónica antes de modificar el dominio.

**Estado:** Completado localmente — 2026-09-20  
**Alcance:** Solo documentación. Sin código, migraciones ni cambios de API/UI.

### Implementación documental

- Crear `docs/FEATURES/16_CONDUCES.md` con requisitos estables:
  - `CON-001`: ciclo de vida y numeración;
  - `CON-002`: pagos, crédito, vencimiento y permisos;
  - `CON-003`: conversión a factura;
  - `CON-004`: fiscalidad y documentos PDF;
  - `CON-005`: cancelación, reembolso e inventario;
  - `CON-006`: CxC, rentabilidad, reportes e historial.
- Documentar la transición:

  `DRAFT / QUOTE_ISSUED → CONDUCE → COMPLETED (factura) → CANCELLED`

  y conservar el camino directo `DRAFT / QUOTE_ISSUED → COMPLETED` sin conduce.

- Registrar la matriz de permisos (versión canónica en Feature 16 / CON-002):

| Caso | Regla |
|---|---|
| Vendedor + `CASH` | Pago total obligatorio al emitir. |
| Vendedor + `CREDIT` DOP | Sin pago inicial; aplica límite y plazo. |
| Vendedor + USD | Pago total obligatorio. |
| Administrador + `CASH` nombrado DOP/USD | Pago cero, parcial o total; si queda saldo, `dueDate` ≥ día local de emisión. |
| Administrador + `Cliente contado` predeterminado | Pago total obligatorio (sin excepción). |
| Administrador + `CREDIT` DOP | Pago cero, parcial o total; aplica límite y plazo. |
| Administrador + `CREDIT` USD | Pago total obligatorio. |
| Confirmación directa a factura (sin `CON-`) | Conserva SALE-005 / PAY-001 (contado siempre liquida completo). |
| Abonos posteriores | Solo Administrador. |
| Facturar conduce | Administrador y Vendedor. |
| Cancelar/reembolsar | Solo Administrador; reembolso global `0…neto cobrado`. |

- Actualizar el release activo y el gate preproducción en `DEVELOPMENT_PLAN.md`.
- Actualizar `FEATURES/README.md`, roles, arquitectura y casos de uso.
- Enmendar las features de clientes, ventas, pagos, rentabilidad, cancelación e historial.

### Verificación

- Ninguna regla del feature debe existir únicamente en este plan. **Verificado:** IDs canónicos en Feature 16; enmiendas cruzadas en Features 08/10/11/12/13/14, roles, arquitectura, flujos y `DEVELOPMENT_PLAN`.
- Revisar que no se contradigan las reglas actuales de factura, cotización, CxC o USD. **Verificado con desviaciones owner explícitas (abajo).**

### Documentación al cerrar

- Actualizar el estado y fecha de M1 en este archivo. **Hecho.**
- Enumerar los documentos actualizados y las decisiones trasladadas a cada uno:

  | Documento | Decisiones / cambios |
  |---|---|
  | `FEATURES/16_CONDUCES.md` | CREATE — `CON-001`…`CON-006`, matriz, checklists `[ ]` |
  | `FEATURES/README.md` | Índice Feature 16 |
  | `FEATURES/08_CUSTOMERS.md` | CUST-002: pago completo del default también en conduce; excepción Admin solo `CASH` nombrado |
  | `FEATURES/10_SALES_AND_INVOICES.md` | SALE-005 / QUOTE-001 / DOC-001: camino directo vs conduce; convert-to-conduce planificado |
  | `FEATURES/11_COST_AND_PROFITABILITY.md` | KPIs reconocen conduce una vez (CON-006) |
  | `FEATURES/12_PAYMENTS_AND_ACCOUNTS_RECEIVABLE.md` | PAY-001 / AR: conduces y filtros `CON-` planificados |
  | `FEATURES/13_CANCELLATION_AND_REFUNDS.md` | CANCEL-002 global `0…neto`; checklist runtime pendiente |
  | `FEATURES/14_HISTORY_ADMIN_AND_RECOVERY.md` | Eventos `CONDUCE_*` planificados |
  | `ROLES_AND_PERMISSIONS.md` | Filas emitir/facturar conduce; Admin saldo `CASH` nombrado; refund 0…neto |
  | `ARCHITECTURE_PLAN.md` | Aggregate único; `CON-`; refund 0…neto |
  | `USE_CASE_FLOWS.md` | Flujo conduce; quote→conduce; cancel/refund |
  | `DEVELOPMENT_PLAN.md` | Snapshot + gate preproducción incluye Feature 16 |

- Registrar cualquier conflicto encontrado con reglas existentes:

  | Conflicto previo | Resolución owner (2026-09-20) |
  |---|---|
  | Plan decía excepción Admin a cualquier `CASH` incl. `Cliente contado` | **No:** solo `CASH` nombrados; default siempre pago completo |
  | Ambiguo si la excepción aplicaba a factura directa | **No:** solo emisión de conduce |
  | CANCEL exigía reembolso neto completo | **Sí cambia:** regla global `0…neto cobrado` (runtime en M4) |
  | SALE-005 / PAY-001 “CASH must settle in full” | Se mantiene para confirmación directa; CON-002 gobierna conduce |

**Gate:** Documentación aprobada, IDs canónicos creados y matriz de permisos sin ambigüedades. **Cumplido en documentación local (2026-09-20).** Pendiente de aprobación explícita del owner si se requiere estado `Verificado`.

---

## Milestone 2 — Migración y modelo de dominio

**Objetivo:** Preparar el agregado de ventas para conservar conduce y factura dentro de una sola operación.

**Estado:** Completado localmente — 2026-09-20  
**Alcance:** Schema Prisma, migraciones SQL, secuencia `CON-`, helpers de numeración y `completeInvoice` escribe `invoiceIssuedAt`. Sin API de emisión/conversión (M3).

### Cambios principales

- Agregar `CONDUCE` a `InvoiceStatus`.
- Incorporar:
  - `conduceNumber`;
  - `conduceIssuedAt`;
  - `invoiceIssuedAt`.
- Mantener `confirmedAt` como fecha del reconocimiento comercial:
  - emisión del conduce; o
  - confirmación directa de una factura.
- Crear secuencia independiente `CON-000001`, sin reutilización después de cancelación.
- Mantener `number` como número `FAC-`.
- Permitir en constraints:
  - conduce activo sin `FAC-`;
  - conduce convertido con `CON-` y `FAC-`;
  - conduce cancelado sin factura;
  - factura cancelada con ambos números;
  - facturas históricas sin conduce.
- Preservar registros actuales sin reescribir importes, fechas o snapshots.
- Añadir índices para búsqueda por `CON-`, estado, cliente, CxC y reportes.

### Implementación

| Artefacto | Detalle |
|---|---|
| `20260920000000_conduce_status_enum` | `ALTER TYPE … ADD VALUE 'CONDUCE'` (commit separado antes del CHECK) |
| `20260920000001_conduce_domain` | Columnas, backfill `invoiceIssuedAt = confirmedAt` donde hay `FAC-`, format/pair CHECKs, `Invoice_number_status_check` ampliado, unique `conduceNumber`, índices `status+confirmedAt` y `recognized_customer_currency` (`COMPLETED`/`CONDUCE`), seed `InvoiceSequence` `CON` |
| Domain | `formatConduceNumber`, `allocateNextConduceNumber`; confirmación directa setea `invoiceIssuedAt = confirmedAt` |

### Verificación

- Tests unitarios: `tests/unit/sales/validation.test.ts` — **38 passed** (incluye `formatConduceNumber`).
- Smoke en `solocamiones_dev` tras `db:migrate:deploy`: secuencia `CON` seed; 0 filas `FAC-` sin `invoiceIssuedAt`; insert `CONDUCE` OK; `COMPLETED` sin `invoiceIssuedAt` rechazado (`23514`); allocate concurrente `CON-000001`/`CON-000002`.
- Tests de integración (reset autorizado en `solocamiones_test`): `conduce-domain-migration` + `domain-migration` + `repository` — **19 passed**.

### Rollback operativo

1. No revertir datos de negocio: las columnas nuevas son aditivas y el backfill solo copia `confirmedAt` → `invoiceIssuedAt`.
2. Rollback de código: desplegar revisión anterior **antes** de dropear columnas solo si ninguna fila `CONDUCE` existe aún (M3 no emitió).
3. Rollback de schema (solo entornos no productivos o con aprobación): migraciones inversas manuales — dropear CHECKs/índices/columnas, borrar fila secuencia `CON`; el valor de enum `CONDUCE` en PostgreSQL no se elimina fácilmente (dejarlo inofensivo).
4. Nunca `prisma migrate reset` en datos reales.

### Documentación al cerrar

- Actualizar el estado y fecha de M2 en este archivo. **Hecho.**
- Registrar la migración y sus constraints en Feature 16 y arquitectura. **Hecho.**
- Documentar comandos ejecutados, resultados y estrategia de rollback operativo. **Hecho (arriba).**
- Enumerar cualquier desviación frente al diseño original:
  - Ninguna de negocio. Detalle técnico: dos migraciones (enum + dominio) por limitación de PostgreSQL al referenciar un enum nuevo en el mismo transaction que el CHECK; índice CxC renombrado a `Invoice_recognized_customer_currency_idx` incluyendo `CONDUCE` (queries de crédito siguen en `COMPLETED` hasta M4).

**Gate:** Migración reproducible y compatible con todos los datos existentes. **Cumplido localmente (2026-09-20)** pendiente de `Verificado` owner si se requiere.

---

## Milestone 3 — Motor de emisión y conversión

**Objetivo:** Implementar las transiciones comerciales sin duplicar el agregado.

**Estado:** Completado localmente — 2026-09-20  
**Alcance:** API de emisión/conversión, historial, proyección pública, exposición de crédito incluye `CONDUCE`. Pago inicial reutiliza SALE-005 (`confirmInvoiceSchema`); excepción Admin+`CASH` nombrado queda en M4. Sin PDF de conduce (M5) ni FX/rentabilidad al emitir (M6).

### Contratos HTTP

| Método | Ruta | Body | Transición |
|---|---|---|---|
| `POST` | `/api/sales/:id/issue-conduce` | `confirmInvoiceSchema` (pago opcional; SALE-005) | `DRAFT` → `CONDUCE` |
| `POST` | `/api/sales/:id/convert-quote-to-conduce` | `confirmInvoiceSchema` | `QUOTE_ISSUED` → `CONDUCE` |
| `POST` | `/api/sales/:id/convert-conduce-to-invoice` | `{ fiscal: boolean }` | `CONDUCE` → `COMPLETED` |

Respuesta pública incluye `conduceNumber`, `conduceIssuedAt`, `invoiceIssuedAt`. Emisión fuerza `fiscal: false`. Reintentos idempotentes; retry de facturación con `fiscal` distinto → conflicto.

### Implementación

| Artefacto | Detalle |
|---|---|
| Repository | `issueConduce`, `convertConduceToInvoice`; list search incluye `CON-` |
| Service | `issueConduce` / `convertQuoteToConduce` / `convertConduceToInvoice` |
| History | `CONDUCE_ISSUED`, `QUOTE_CONVERTED_TO_CONDUCE`, `CONDUCE_INVOICED` + timeline |
| Customers | `findCompletedInvoicesWithPayments` incluye status `CONDUCE` (exposición crédito) |
| Tests | `conduce-http.test.ts` (6); unit schema `convertConduceToInvoiceSchema` |

### Verificación

- Unitarios: `tests/unit/sales/validation.test.ts` — **40 passed** (incluye `CONDUCE` status + convert schema).
- Integración (reset autorizado en `solocamiones_test`): `conduce-http.test.ts` — **6 passed**.
- Typecheck API: OK.

### Desviaciones / diferidos a M4–M6

- Matriz CON-002 Admin+named-`CASH` (pago parcial + `dueDate` actor) → **M4**.
- CxC listados/filtros `CON-` → **M4** (exposición de límite ya cuenta conduces).
- PDF conduce / origen `CON-` en plantilla factura → **M5**.
- FX/rentabilidad al emitir → **M6**.

### Documentación al cerrar

- Checklists CON-001 / CON-003 en Feature 16 — **Hecho**.
- Feature 14 eventos runtime — **Hecho**.
- USE_CASE_FLOWS camino conduce — **Hecho** (matriz Admin CASH sigue planificada M4).

**Gate:** Cada operación conserva una sola identidad y los reintentos no duplican documentos. **Cumplido localmente (2026-09-20)** pendiente de `Verificado` owner si se requiere.

---

## Milestone 4 — Pagos, vencimiento, CxC y cancelación

**Objetivo:** Aplicar la matriz financiera completa del conduce.

**Estado:** Completado localmente — 2026-09-20  
**Alcance:** Matriz CON-002 en emisión, `dueDate` Admin named-`CASH`, abonos en `CONDUCE`, CxC/`CON-`, cancelación `0…neto` (CANCEL-002) en `CONDUCE` y `COMPLETED`. Sin PDF conduce (M5), FX/rentabilidad (M6) ni UI web (M7).

### Reglas financieras

- Administrador + `CASH` puede confirmar con pago cero, parcial o total.
- Si queda saldo `CASH`, exigir `dueDate` igual o posterior al día local de emisión.
- `CREDIT` DOP deriva automáticamente el vencimiento desde el plazo congelado.
- El saldo de un conduce `CREDIT` cuenta para su límite.
- El Administrador puede aplicar la excepción a **clientes `CASH` nombrados** al emitir conduce; no al `Cliente contado` predeterminado; no se agrega bandera de confianza.
- Los abonos posteriores reutilizan `POST /api/sales/:id/payments` y son Administrador-only.
- Extender CxC, estados de pago y estado de cuenta para incluir conduces.
- Los filtros por documento aceptan `CON-` y `FAC-`.
- Facturar conserva pagos, saldo, estado y vencimiento.

### Cancelación

- Extender `POST /api/sales/:id/cancel` a conduces.
- Permitir reembolso real indicado entre cero y el neto cobrado (`refundAmount`).
- Rechazar reembolso superior al neto cobrado.
- Extinguir el saldo pendiente al cancelar.
- Si ya existe `FAC-`, cancelar toda la operación `CON-/FAC-`.
- Cuando inventario esté habilitado:
  - emitir consume reserva y marca vendido;
  - cancelar restaura exactamente una vez;
  - facturar no toca inventario.
- No adelantar en este milestone los módulos completos `ITEM/QTY` que todavía pertenecen a releases posteriores; dejar la regla documentada y conectar el mismo límite transaccional cuando se habiliten.

### Implementación

| Artefacto | Detalle |
|---|---|
| Policy | `assertConduceInitialPaymentPolicy`, `resolveConduceDueDate` (CON-002) |
| Validation | `issueConduceSchema` (+`dueDate`); `cancelInvoiceSchema` (+`refundAmount`); receivables `FAC-`/`CON-` |
| Service | Emisión conduce usa matriz CON-002; `addPayment`/`cancel` aceptan `CONDUCE`; cancel refund 0…neto |
| CxC | `receivableBalances` incluye `CONDUCE`; statement PDF usa `number ?? conduceNumber` |
| Tests | Unit policy/validation; integration `conduce-payments-cancellation-http` + regresión payments/cancel/conduce |

### Verificación

- Unitarios: `credit-confirmation.test.ts` + `validation.test.ts` — **passed** (matriz CON-002, dueDate, refundAmount, filtro CON-).
- Integración (reset autorizado en `solocamiones_test`): `conduce-payments-cancellation-http` + `payments-cancellation-http` + `conduce-http` — **42 passed**.
- Typecheck API: OK.

### Inventario diferido (CON-005)

Cuando ITEM/QTY exista: emitir consume/reserva→vendido; cancelar restaura una vez; facturar no toca inventario. Hoy las líneas ITEM/QTY siguen rechazadas en borrador; la frontera transaccional se compartirá con el release de inventario.

### Documentación al cerrar

- Actualizar `CON-002`, `CON-005`, Features 08/12/13 y el estado de M4. **Hecho** (Features 12/13/16, USE_CASE_FLOWS, este plan).
- Registrar casos de prueba y decisiones de vencimiento/reembolso. **Hecho** (arriba).
- Marcar criterios únicamente después de pruebas de integración. **Hecho**.
- Documentar los efectos de inventario diferidos y su futura frontera transaccional. **Hecho** (arriba).

**Gate:** CxC, pagos, saldos, vencimientos y cancelación coinciden en dominio, API y base de datos. **Cumplido localmente (2026-09-20)** pendiente de `Verificado` owner si se requiere.

---

## Milestone 5 — PDFs y fiscalidad manual

**Objetivo:** Generar documentos reproducibles y mantener conduce y factura disponibles simultáneamente.

### Cambios

- Crear renderer específico de conduce.
- El PDF del conduce mostrará:
  - `CON-`;
  - fecha de emisión;
  - origen `COT-` cuando exista;
  - cliente y vendedor;
  - líneas, precios, descuento, ITBIS y total.
- No mostrará NCF, historial de pagos ni saldo.
- La factura convertida mostrará:
  - `FAC-`;
  - origen `CON-`;
  - origen `COT-` cuando aplique;
  - fecha de factura correspondiente a la conversión;
  - vendedor original.
- Mantener `NCF: ______________________` en la factura para completarlo manualmente fuera del sistema.
- Añadir `GET /api/sales/:id/conduce.pdf`.
- Mantener `GET /api/sales/:id/pdf` compatible como documento principal.
- Conservar descargables ambos PDFs después de facturar.
- Regenerar documentos desde snapshots sin reabrir ni repetir la venta.

### Pruebas

- Conduce nunca imprime NCF.
- Factura conserva NCF en blanco.
- PDFs muestran números y orígenes correctos.
- Documentos históricos continúan generándose.
- Muchas líneas, paginación, encabezado, pie y totales.
- Fallo de PDF no revierte emisión o conversión.

### Documentación al cerrar

- Actualizar `CON-004`, especificación de documentos y estado de M5.
- Registrar versión de plantilla y muestras verificadas.
- Anotar la aprobación empresarial de los PDFs cuando ocurra.
- Documentar cualquier diferencia entre regeneración de factura y conduce.

**Gate:** Conduce y factura se regeneran independientemente y reproducen los datos congelados.

---

## Milestone 6 — Reportes, rentabilidad e historial

**Objetivo:** Reconocer el conduce como venta completa sin duplicar métricas al facturarlo.

### Cambios

- Incluir conduces desde su emisión en:
  - rentabilidad;
  - CxC;
  - KPIs de ventas y cobros;
  - reporte por vendedor;
  - historial de la operación.
- Ejecutar FX/rentabilidad USD al emitir el conduce.
- La conversión no solicita otra tasa ni recalcula la rentabilidad.
- Mientras no exista factura, mostrar `CON-` como documento principal.
- Después de facturar, mostrar `FAC-` como documento principal y conservar `CON-` como origen.
- Mantener como fecha comercial `confirmedAt`; usar `invoiceIssuedAt` solo como fecha documental de factura.
- Atribuir la venta al emisor del conduce, no al actor que factura.
- Evitar que `CON-` y `FAC-` produzcan dos filas o dupliquen totales.
- Proyectar eventos financieros únicamente a los roles autorizados.

### Pruebas

- Una sola venta antes y después de facturar.
- Totales de reportes sin duplicación.
- Atribución correcta del vendedor.
- USD conserva tasa y rentabilidad originales.
- Historial ordenado de cotización, conduce, pagos, factura y cancelación.

### Documentación al cerrar

- Actualizar `CON-006`, Features 11/14 y el estado de M6.
- Registrar qué fecha usa cada reporte y documento.
- Documentar cualquier cambio de etiqueta de “Facturado” a “Ventas” necesario para incluir conduces correctamente.
- Enumerar consultas, proyecciones y pruebas de regresión modificadas.

**Gate:** Reportes, rentabilidad e historial reflejan una sola operación comercial.

---

## Milestone 7 — Integración web y mocks

**Objetivo:** Exponer el flujo completo en la aplicación sin mover reglas de negocio al frontend.

### Cambios web

- Extender contratos con:
  - estado `CONDUCE`;
  - `conduceNumber`;
  - `conduceIssuedAt`;
  - `invoiceIssuedAt`.
- Borrador:
  - `Confirmar factura`;
  - `Emitir conduce`.
- Cotización emitida:
  - `Convertir en factura`;
  - `Convertir en conduce`.
- Conduce:
  - descargar PDF;
  - facturar;
  - registrar pago si el actor es Administrador;
  - cancelar si el actor es Administrador.
- Formularios de emisión:
  - pago inicial según matriz;
  - vencimiento obligatorio para Administrador + `CASH` con saldo;
  - mensajes explícitos sobre documento no fiscal.
- Añadir filtro y etiquetas de conduce en listados.
- Mostrar orígenes `COT-` y `CON-` en detalle y factura.
- Mantener el detalle comercial inmutable después de emitir.
- Actualizar mocks con las mismas reglas y contratos HTTP.

### Pruebas

- Componentes por rol.
- Formularios de pago y vencimiento.
- Flujos borrador/cotización/conduce/factura.
- Acceso negativo a pagos y cancelación.
- Listados, filtros, toasts y estados de carga/error.
- Paridad básica entre mock y HTTP.

### Documentación al cerrar

- Actualizar el estado de M7 y los criterios UI de Feature 16.
- Registrar pantallas, contratos y recorridos verificados.
- Documentar diferencias intencionales entre mocks y capacidades productivas futuras.
- Anotar evidencia del walkthrough HTTP por cada rol.

**Gate:** Administrador y Vendedor completan sus recorridos autorizados usando HTTP real.

---

## Milestone 8 — Estabilización y exit gate preproducción

**Objetivo:** Verificar el feature completo antes del primer release.

### Verificación técnica

- Ejecutar migraciones sobre una copia realista.
- Ejecutar:
  - `npm run lint`;
  - `npm run typecheck`;
  - `npm run test`;
  - `npm run build`.
- Ejecutar pruebas específicas de concurrencia para `CON-`, límite de crédito e idempotencia.
- Ejecutar regresión de facturas, cotizaciones, pagos, CxC, PDFs, reportes y cancelaciones existentes.
- Confirmar que no se modificaron contratos públicos existentes de forma incompatible.
- Realizar walkthrough como Administrador y Vendedor.
- Revisar PDFs de:
  - conduce contado pagado;
  - conduce `CASH` pendiente;
  - conduce `CREDIT`;
  - conduce originado en cotización;
  - factura originada en conduce;
  - operación cancelada.

### Cierre documental

- Actualizar cada milestone con fecha, estado y evidencia.
- Marcar criterios completos en Feature 16 únicamente si implementación y pruebas existen.
- Actualizar el snapshot de `DEVELOPMENT_PLAN.md`.
- Registrar comandos ejecutados y resultados.
- Documentar pendientes reales sin marcarlos como completados.
- Añadir una sección final de decisiones, migración, rollback y aprobación empresarial.

**Gate final:** Cero fallos conocidos en los flujos aprobados y autorización para incluir conduces en el primer release.

---

## Decisiones confirmadas

- El conduce y la factura pertenecen a la misma operación; no se copian líneas ni pagos.
- El conduce se reconoce como venta y CxC desde su emisión.
- La factura usa la fecha de conversión y conserva el vencimiento del conduce.
- El PDF original del conduce continúa disponible después de facturar.
- El conduce nunca es fiscal; `Aplicar ITBIS` continúa siendo independiente.
- La factura puede ser fiscal o no fiscal y mantiene el NCF en blanco para completarlo manualmente.
- La factura usa el snapshot del cliente congelado al emitir el conduce.
- Administrador y Vendedor pueden facturar; la venta permanece atribuida al emisor del conduce.
- El conduce emitido es inmutable.
- Cancelar una factura originada en conduce cancela toda la operación.
- El Administrador puede dejar saldo **solo al emitir conduce** y **solo a clientes `CASH` nombrados** (no al `Cliente contado` predeterminado); no se agrega bandera de confianza. La confirmación directa a factura conserva SALE-005 (contado liquida completo). _(Aclarado M1, 2026-09-20; sustituye la redacción previa “cualquier CASH, incluido Cliente contado”.)_
- El Administrador puede dejar saldo USD únicamente a clientes `CASH` nombrados en emisión de conduce.
- El Vendedor conserva los mismos límites actuales de factura (también al emitir conduce).
- Los pagos posteriores son Administrador-only.
- El PDF del conduce muestra precios y totales, pero no pagos ni saldo.
- El reembolso de cancelación es **global**: Administrador indica monto real de `0` hasta el neto cobrado (CANCEL-002 / CON-005). _(Aclarado M1, 2026-09-20.)_
- Se conserva el camino directo `DRAFT` / `QUOTE_ISSUED` → `COMPLETED` sin conduce.

