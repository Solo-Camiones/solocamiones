# Plan de cambios de negocio antes de producción

## Estado del documento

- **Tipo:** plan de implementación y registro de decisiones confirmadas.
- **Fecha de análisis:** 2026-09-15.
- **Alcance:** clientes, crédito, facturación, ITBIS, permisos de Vendedor, pagos, cuentas por cobrar, estados de cuenta y PDF de factura.
- **Estado de definición:** reglas de negocio confirmadas y **trasladadas a las features** (Paso 1 cerrado 2026-09-15). Este archivo queda como secuencia técnica, diseño de migración y registro histórico. Los datos bancarios definitivos siguen como configuración operativa posterior.
- **Objetivo de secuencia:** completar estos cambios y su estabilización antes de iniciar las configuraciones separadas de ambientes.

## Orden recomendado de implementación

Este es el orden que debe seguirse. Cada paso depende de las garantías establecidas por los anteriores; no conviene comenzar por las pantallas o el PDF antes de estabilizar el dominio y la autorización.

### Paso 1 — Formalizar documentación y aceptación

**Estado:** **Cerrado 2026-09-15.** Las reglas viven en las features. No implementar comportamiento desde este archivo cuando exista un ID canónico.

**Requisitos cubiertos:** todos (`H-01` a `H-07`, `M-01` a `M-03`, `L-01` a `L-03`).

**Tareas:**

- [x] Actualizar `DEVELOPMENT_PLAN`, Features 08/10/11/12, roles, flujos, prototipo y roadmap.
- [x] Crear IDs estables para tipo/condición de crédito, límite, cotización y estado de cuenta.
- [x] Registrar la nueva matriz de permisos de Administrador y Vendedor.
- [x] Convertir los ejemplos aprobados de ITBIS, crédito, cotización y CxC en criterios de aceptación.
- [x] Documentar expresamente qué datos históricos son inmutables y cuáles usan presentación corporativa vigente (`DOC-001`).

**Gate:** no queda ninguna regla de este plan solamente en este archivo; todas están reflejadas en su feature fuente de verdad.

#### Trazabilidad H/M/L → IDs canónicos

| ID de impacto | Feature | IDs canónicos |
|---|---|---|
| H-01 | 10 | `SALE-010` (cálculo); `SALE-003` enmendado (ya no es ITBIS incluido) |
| H-02 | 08 | `CUST-004` |
| H-03 | 08 | `CUST-005`, `CUST-006` |
| H-04 | 08, 12, roles | `CUST-004`, `PAY-007`, matriz Admin/Vendedor |
| H-05 | 08, 10 | `CUST-007`, `SALE-009` |
| H-06 | 11 | `COST-006`; `COST-001`/`COST-004` enmendados |
| H-07 | 10 | `QUOTE-001`, `QUOTE-002` |
| M-01 | 12 | `PAY-006` |
| M-02 | 12 | `PAY-007` |
| M-03 | 12 | `STMT-001` |
| L-01, L-02, L-03 | 10 | `DOC-001` |

#### Decisión de implementación aún abierta (no bloquea Paso 1)

Cómo persistir `dueDate` en una venta **contado ya pagada** (`confirmedAt`, `null`, u otro valor) se decide en el hito de confirmación. La regla de negocio ya es: el contado no debe aparecer como CxC abierta.

### Paso 2 — Crear la migración de dominio

**Estado:** **Cerrado 2026-09-15** en código local (migración Prisma + test de dominio). Los comandos de negocio siguen en Pasos 3–6.

**Requisitos cubiertos:** `H-01`, `H-02`, `H-03`, `H-05`, `H-07` y soporte estructural para `M-01/M-03`.

**Tareas:**

- [x] Agregar `customerType`, `creditLimitDop` y `creditTermDays` con constraints.
- [x] Agregar estado/fechas/número de cotización y secuencia `COT-`.
- [x] Separar `applyItbis` de `fiscal` y preparar snapshots inmutables de confirmación.
- [x] Guardar referencia `COT-` en la factura resultante.
- [x] Añadir índices necesarios para exposición de crédito y CxC por cliente.
- [x] Clasificar clientes existentes como `CASH` sin cambiar sus nombres.
- [x] Preservar facturas completadas y preparar recálculo controlado de borradores.
- [x] Probar migración hacia adelante sobre base limpia (test de integración Prisma).
- [ ] Ensayar la misma migración sobre una copia realista (queda en Paso 10).

**Gate:** migración reproducible, reversible mediante rollback operativo documentado y sin reescribir facturas completadas.

### Paso 3 — Implementar clientes y permisos base

**Estado:** **Cerrado 2026-09-15** en código local (API write + UI/mock). El motor de confirmación de crédito sigue en Paso 5.

**Requisitos cubiertos:** `H-02`, parte de `H-03`, `H-04` y `H-05`.

**Tareas:**

- [x] Extender validación, repository, service, controller y contratos de clientes.
- [x] Permitir al Administrador crear/editar `CASH` y `CREDIT`.
- [x] Permitir al Vendedor crear únicamente `CASH`.
- [x] Exigir RNC/cédula, límite DOP y plazo a clientes `CREDIT`.
- [x] Permitir comprobante a cliente contado nombrado solo con identificación válida.
- [x] Bloquear cambio `CREDIT -> CASH` mientras exista saldo.
- [x] Registrar historial `before/after` de clasificación, límite y plazo.
- [x] Actualizar formulario, tabla y filtros de clientes sin añadir prefijos al nombre.
- [x] Añadir pruebas HTTP negativas para cambios de crédito por Vendedor.

**Gate:** ninguna llamada directa permite al Vendedor crear o modificar condiciones de crédito.

### Paso 4 — Cambiar ITBIS y retirar costo de facturación

**Estado:** **Cerrado 2026-09-15** en código local (dominio tax-exclusive, API, POS/detalle/preview, COST-006). Plantilla PDF corporativa v4 sigue en Paso 9.

**Requisitos cubiertos:** `H-01`, `H-05` y `H-06`.

**Tareas:**

- [x] Implementar `base + 18 %` por línea gravada con `Prisma.Decimal` y redondeo por línea.
- [x] Mantener servicio y entrega sin ITBIS.
- [x] Agregar `Aplicar ITBIS`, separado de comprobante y desmarcado por defecto.
- [x] Recalcular borradores existentes y preservar importes de facturas completadas.
- [x] Actualizar totales y textos en API, POS, detalle y vista previa (etiqueta **Subtotal**).
- [x] Eliminar costo/procedencia de alta y edición de líneas para ambos roles.
- [x] Rechazar esos campos en payloads ordinarios y omitirlos en proyecciones.
- [x] Dejar costo `UNKNOWN` y reutilizar la captura posterior de ganancia manual Administrador-only.
- [x] Añadir regresión de redondeo, impuesto sin comprobante y comprobante sin identificación.

**Gate:** los mismos ejemplos producen exactamente base, ITBIS y total en dominio, API y UI; ninguna factura completada cambia.

### Paso 5 — Implementar motor de crédito y confirmación

**Requisitos cubiertos:** `H-02`, `H-03`, `H-04`, `H-05` y reglas de pago relacionadas.

**Tareas:**

- Restringir crédito a DOP; una factura USD debe quedar pagada completamente.
- Aplicar el plazo fijo del cliente para calcular `dueDate`.
- Calcular exposición como saldo abierto más saldo nuevo después del pago inicial autorizado.
- Validar el límite dentro de la transacción serializable de confirmación.
- Impedir sobrepaso incluso al Administrador.
- Permitir pago parcial inicial de crédito al Administrador.
- Exigir al Vendedor confirmar crédito sin pago inicial y bloquear cobros posteriores.
- Mantener contado completamente pagado al confirmar.
- Crear snapshots de tipo/plazo/condición aplicados.
- Separar policies de venta, pago y CxC; no depender del ocultamiento de botones.
- Probar dos confirmaciones concurrentes contra el mismo límite.

**Gate:** no se excede crédito bajo concurrencia y cada rol recibe exactamente las operaciones autorizadas.

### Paso 6 — Implementar cotizaciones convertibles

**Requisitos cubiertos:** `H-07`, con dependencias de `H-01` a `H-05`.

**Tareas:**

- Implementar `QUOTE_DRAFT -> QUOTE_ISSUED -> COMPLETED` sobre el mismo agregado.
- Asignar `COT-000001` al emitir, sin reutilización.
- Calcular expiración al final del día 30 en `America/Santo_Domingo`.
- Hacer inmutable la cotización emitida y bloquear conversión al vencer.
- Duplicar cliente, moneda, fiscalidad, ITBIS, líneas, precios y notas hacia una cotización nueva editable.
- No reservar inventario; validar disponibilidad únicamente al convertir.
- Convertir directamente mediante el flujo normal de confirmación y asignar `FAC-`.
- Preservar `COT-` en la factura.
- Hacer conversión idempotente y registrar historial.
- Añadir lista/filtros/acciones de emitir, duplicar y convertir.

**Gate:** reintentos no duplican factura/líneas/números y una cotización vencida o modificada indebidamente es rechazada.

### Paso 7 — Completar estados de pago y CxC

**Requisitos cubiertos:** `H-04`, `M-01`, `M-02` y pendientes existentes de Feature 12.

**Tareas:**

- Derivar `PENDING`, `PARTIALLY_PAID`, `OVERDUE` y `PARTIALLY_PAID_OVERDUE`.
- Mostrar `PENDIENTE`, `ABONADO`, `VENCIDA` y `ABONADA VENCIDA`.
- Añadir `confirmedAt` como fecha emitida en CxC.
- Restringir pantalla y endpoint CxC al Administrador.
- Permitir al Vendedor ver saldo/estado en factura, omitiendo movimientos de pago.
- Completar filtros pendientes por cliente, factura, estado, fecha y moneda donde sigan aplicando.
- Actualizar chips, contratos, mocks y pruebas de transición/vencimiento.

**Gate:** estado, saldo y permisos coinciden entre detalle, CxC, API y acceso directo.

### Paso 8 — Generar el estado de cuenta PDF

**Requisitos cubiertos:** `M-03`.

**Tareas:**

- Reemplazar búsqueda libre de CxC por selector buscable de clientes con saldo.
- Añadir botón `Generar estado de cuenta` habilitado con selección válida.
- Crear read model Administrador-only para todas las facturas DOP con saldo del cliente.
- Incluir número, fecha emitida, vencimiento, estado, total, abonado acumulado y saldo.
- Excluir canceladas, reembolsos y detalle de movimientos individuales.
- Crear renderer PDF propio, encabezado corporativo y fecha de generación.
- Probar cliente sin saldo, muchas facturas y totales acumulados.

**Gate:** el PDF permite explicar y reconciliar el saldo total del cliente con las facturas abiertas subyacentes.

### Paso 9 — Actualizar PDFs y datos corporativos

**Requisitos cubiertos:** `H-01`, `H-05`, `H-07`, `M-01`, `L-01`, `L-02` y `L-03`.

**Tareas:**

- Crear/ajustar plantilla de cotización y `internal-v4` de factura.
- Mostrar base, ITBIS, total, estado de pago y `COT-` de origen.
- Agregar aclaración editable de transferencia y cheque a nombre de `Solo Camiones`.
- Cambiar WhatsApp derecho a `829-627-3168` y correo a `solocamionessrl@gmail.com`.
- Corregir `Pte.` a `Pdte.` y agregar TikTok `solo.camiones.srl`.
- Aplicar perfil corporativo vigente al volver a descargar facturas históricas.
- Preservar importes, cliente, líneas, fechas y demás hechos históricos.
- Verificar paginación, firmas, pies y documentos con muchas líneas.

**Gate:** empresa aprueba muestras de cotización, factura nueva, factura histórica y estado de cuenta.

### Paso 10 — Ejecutar estabilización preambientes

**Requisitos cubiertos:** todos; gate técnico y operativo.

**Tareas:**

- Ejecutar migraciones sobre una copia realista y documentar rollback.
- Ejecutar unitarias, integración PostgreSQL y componentes web.
- Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`.
- Probar concurrencia de límite, `FAC-`, `COT-`, pagos e idempotencia.
- Ejecutar regresión de facturas históricas, cotizaciones y estados de cuenta.
- Realizar walkthrough completo como Administrador y Vendedor.
- Confirmar que no se modificaron APIs o flujos fuera del alcance.
- Iniciar configuración de development/staging/production solo después de cerrar este gate.

**Gate:** cero fallos conocidos en los flujos aprobados y autorización del cambio preproducción para pasar a configuración de ambientes.

### Regla de avance

No avanzar al siguiente bloque si falla su gate principal:

```text
Documentación
  -> Migración reproducible
  -> Autorización de clientes
  -> Cálculos monetarios
  -> Confirmación y crédito
  -> Cotizaciones
  -> CxC y estado de cuenta
  -> PDFs
  -> Gate preambientes
```

Los hitos de la sección 6 desarrollan este mismo orden con mayor detalle.

### Decisiones confirmadas — 2026-09-15

- La cotización se implementa ahora dentro del mismo agregado que luego será factura.
- Una cotización emitida tiene número `COT-`, PDF titulado `COTIZACIÓN` y vigencia de 30 días.
- Después de emitirla es inmutable y no puede reactivarse; puede duplicarse como una cotización nueva con otro número.
- Convertirla completa inmediatamente la factura, asigna `FAC-` y conserva visible el `COT-` de origen.
- La numeración usa el formato `COT-000001`; la vigencia termina al finalizar el día 30 en la zona horaria del negocio.
- Una cotización vencida no puede convertirse; puede duplicarse copiando sus datos a una nueva cotización editable.
- La cotización no reserva inventario: la disponibilidad se valida únicamente al convertirla.
- La conversión usa el flujo normal de borrador a factura, incluyendo el pago completo y método para ventas contado.
- Su PDF muestra base, ITBIS y total con las mismas reglas monetarias de la futura factura.
- El Vendedor puede vender a crédito solamente a clientes previamente clasificados como `CREDIT` por un Administrador.
- Servicios mecánicos y entrega permanecen sin ITBIS.
- Los borradores existentes se recalculan con precio base + 18 %; las facturas completadas conservan sus importes históricos.
- Calcular ITBIS y emitir con comprobante fiscal son reglas separadas: `Cliente contado` puede llevar ITBIS, pero no emitir comprobante fiscal.
- Por ahora el usuario decide el ITBIS mediante un checkbox `Aplicar ITBIS`, separado del checkbox de comprobante fiscal; la futura integración eNCF reemplazará esta temporalidad.
- `Aplicar ITBIS` estará desmarcado de forma predeterminada.
- El crédito se permite únicamente en DOP; el límite considera exposición abierta más el saldo nuevo, no admite sobrepaso administrativo y el plazo queda fijo en el cliente.
- El Vendedor confirma ventas a crédito sin pago inicial; todos sus cobros posteriores son registrados por el Administrador.
- El Administrador puede registrar un pago parcial al confirmar una venta crédito; el límite considera únicamente el saldo resultante.
- Un cliente crédito con saldo pendiente no puede convertirse a contado.
- La clasificación `CASH/CREDIT` nunca forma parte del nombre del cliente; el Administrador puede editarla sujeto a las restricciones de saldo.
- Un cliente contado nombrado con RNC/cédula válido puede emitir comprobante fiscal.
- Pagar total o parcialmente una factura no cambia la clasificación del cliente; un cliente crédito continúa siendo crédito.
- El Vendedor conserva Clientes, pero solo puede crear clientes `CASH`; puede consultar facturas crédito sin recibir sus movimientos de pago.
- En el detalle de una factura crédito, el Vendedor puede ver estado de pago y saldo pendiente, pero no la lista, fechas, métodos, referencias ni actores de los pagos.
- Los campos de costo se eliminan para Administrador y Vendedor. Hasta integrar inventario, la rentabilidad de las facturas se registra manualmente por el Administrador cuando el costo sea desconocido.
- La rentabilidad manual no bloquea la confirmación: cada factura nueva queda pendiente de ese seguimiento y el Administrador la registra después mediante el flujo actual.
- Los clientes nombrados existentes se migran como `CASH`; el Administrador promoverá a `CREDIT` los que correspondan sin cambiar sus nombres.
- Los estados abiertos derivados distinguirán `PENDING`, `PARTIALLY_PAID`, `OVERDUE` y `PARTIALLY_PAID_OVERDUE`; las etiquetas visibles serán `PENDIENTE`, `ABONADO`, `VENCIDA` y `ABONADA VENCIDA`.
- `ABONADO`/`ABONADA VENCIDA` también aparecerán en el PDF de factura.
- La fecha emitida es `confirmedAt`, cuando se completa la factura y se asigna `FAC-`.
- El estado de cuenta será un PDF Administrador-only generado desde CxC para un cliente seleccionado, con todas sus facturas que tengan saldo y sin canceladas/reembolsos.
- El estado de cuenta muestra por factura únicamente el total abonado acumulado, no los movimientos individuales.
- En la factura se sustituye el WhatsApp derecho `809-212-7751` por `829-627-3168`, el correo por `solocamionessrl@gmail.com`, la abreviatura por `Pdte.` y se agrega TikTok `solo.camiones.srl`.
- La aclaración de transferencias quedará como plantilla centralizada y editable hasta confirmar los datos bancarios; los cheques se indican a nombre de `Solo Camiones`.
- Al volver a descargar una factura histórica se aplican los datos corporativos y aclaraciones vigentes, preservando intactos sus hechos comerciales y monetarios.

## 1. Resumen ejecutivo

La solicitud no es un conjunto de cambios cosméticos. Modifica reglas ya implementadas y documentadas en Releases 2 y 3:

1. El ITBIS actual está **incluido** en el precio digitado; se solicita que el precio digitado sea la **base** y agregar 18 %.
2. Hoy cualquier cliente nombrado puede comprar a crédito; se solicita crear una clasificación explícita `CONTADO` / `CREDITO`, con autorización, límite y plazo.
3. Hoy el Vendedor puede ver/escribir costo en líneas genéricas o externas, consultar CxC y registrar pagos; se solicita restringir esas capacidades.
4. Hoy una factura parcialmente pagada sigue mostrándose como `PENDING` o `OVERDUE`; se solicita un estado visible `ABONADO`.
5. Los estados de cuenta formales estaban explícitamente diferidos; ahora se solicitan para antes de producción.
6. El PDF requiere datos corporativos, redes y aclaraciones de pago nuevas. Esos cambios deben entrar mediante una plantilla versionada para no cambiar silenciosamente documentos históricos.
7. “Cotización” no existe en el dominio actual y aparece en `docs/FUTURE_ROADMAP.md`. La empresa confirmó que debe adelantarse ahora como una etapa real del flujo de venta y que la misma operación debe poder convertirse en factura sin volver a crear ni copiar un borrador.

Por el alcance transversal, recomiendo tratarlo como un **change set preproducción** con decisiones congeladas primero, migraciones seguras después y entrega por hitos verificables. No recomiendo mezclarlo con la configuración de ambientes: primero debe quedar estable el modelo que se desplegará.

## 2. Estado actual comprobado

### 2.1 Release y arquitectura

- Release 2 (Billing Core) está completado localmente.
- Release 3 (Payments y CxC) está parcialmente completado y aún tiene filtros pendientes.
- La arquitectura existente es React/Vite + Express + Prisma/PostgreSQL, con flujo `Route -> Controller -> Service -> Repository -> Database`.
- El esquema actual no contiene tipo de cliente, límite de crédito ni plazo configurable.

### 2.2 Clientes y crédito

- `Customer` guarda nombre, RNC/cédula opcional, dirección, notas, contactos e indicador `isDefault`.
- El cliente genérico `Cliente contado` no puede emitir factura fiscal y exige pago inicial completo.
- Cualquier cliente nombrado puede confirmar hoy una factura sin pago o con pago parcial.
- La fecha de vencimiento es fija: 30 días calendario después de la confirmación para todas las facturas.
- Los límites de crédito y estados de cuenta estaban diferidos expresamente en Feature 12.

### 2.3 Costos y facturación

- Los formularios `AddLineModal` y `EditLineModal` permiten costo y procedencia para líneas `GENERIC` y `EXTERNAL`.
- La API también acepta esos campos y los devuelve en las proyecciones de factura/borrador.
- La documentación actual permite al Vendedor ver costo de adquisición, aunque no rentabilidad.
- El costo de líneas no inventariadas alimenta la rentabilidad; quitar su captura deja esas líneas con costo desconocido hasta que exista la integración con inventario u otro flujo autorizado.

### 2.4 ITBIS

- El cálculo vigente interpreta el precio digitado como total con ITBIS incluido.
- Ejemplo actual: precio `118.00` -> base `100.00`, ITBIS `18.00`, total `118.00`.
- El cambio solicitado produciría: base `118.00`, ITBIS `21.24`, total `139.24`.
- Servicios y entrega son no gravados actualmente.

### 2.5 Pagos y CxC

- Los estados derivados actuales son `PENDING`, `OVERDUE`, `PAID`, `PAID_LATE` y `CANCELLED`.
- Un pago parcial reduce saldo, pero no cambia el estado visible a “Abonado”.
- `/receivables` está disponible para Administrador y Vendedor tanto en UI como en API.
- `POST /api/sales/:id/payments` también está disponible para ambos roles.
- La tabla CxC muestra factura, cliente, estado, vencimiento, total y saldo, pero no la fecha de emisión.
- No existe un estado de cuenta formal por cliente.

### 2.6 PDF

- La plantilla vigente es `internal-v3` y guarda su versión en cada factura.
- Datos actuales: dos WhatsApp, Gmail personal, Instagram y Facebook; no hay TikTok.
- La dirección usa `Av. Pte. Antonio Guzmán Fernández...`.
- El PDF muestra estado y saldo, pero omite movimientos y métodos de pago.
- No incluye aclaraciones bancarias ni beneficiario de cheques.

## 3. Clasificación por impacto

| ID | Requerimiento | Impacto | Motivo principal |
|---|---|---|---|
| H-01 | Cambiar ITBIS incluido por base + 18 % | **HIGH** | Cambia cálculo monetario, totales, snapshots, PDF, pruebas y tratamiento de borradores existentes. |
| H-02 | Clasificar clientes `CONTADO` / `CREDITO` | **HIGH** | Requiere migración, validación condicional, autorización y actualización de contratos/UI. |
| H-03 | Límite y plazo de crédito 30/45/60/90/120 | **HIGH** | Requiere reglas transaccionales, definición de exposición, moneda, concurrencia y snapshot al facturar. |
| H-04 | Restringir alta/cobro de crédito del Vendedor, permitiendo vender a clientes crédito aprobados | **HIGH** | Es una frontera de autorización por operación; debe bloquearse en servidor, no solo ocultarse en UI. |
| H-05 | Separar cálculo de ITBIS y comprobante fiscal | **HIGH** | Hoy un único flag activa ambos; la nueva regla permite ITBIS sin comprobante y exige identificación para emitir comprobante. |
| H-06 | Eliminar costo de adquisición de líneas para ambos roles y usar rentabilidad manual temporal | **HIGH** | Cambia captura, contrato API, cálculo de rentabilidad y la futura fuente de costo desde inventario. |
| H-07 | Implementar cotización convertible en factura | **HIGH** | Agrega ciclo de vida, numeración/documento y una transición que debe conservar la misma operación, cliente y líneas sin duplicarlas. |
| M-01 | Estado visible `ABONADO` después de un pago parcial | **MEDIUM** | Afecta modelo derivado, filtros, chips, PDF, consultas y precedencia con vencimiento. |
| M-02 | Fecha emitida en detalle/listado CxC | **MEDIUM** | La fecha existe (`confirmedAt`), pero debe proyectarse, etiquetarse y probarse sin confundirla con `createdAt`. |
| M-03 | Estado de cuenta por cliente | **MEDIUM** | Es un nuevo read model/reporte con filtros, separación por moneda y posible PDF/descarga. |
| L-01 | Aclaraciones de transferencia y cheque en PDF | **LOW** | Cambio de contenido/layout; transferencia usa plantilla editable y cheque usa `Solo Camiones`. |
| L-02 | Cambiar WhatsApp, correo y abreviatura de dirección | **LOW** | Actualiza datos corporativos también al volver a descargar facturas históricas. |
| L-03 | Agregar TikTok a factura | **LOW** | Cambio visual y de contenido con el usuario `solo.camiones.srl`. |

> `HIGH`, `MEDIUM` y `LOW` expresan impacto técnico y riesgo de negocio, no prioridad empresarial. Los cambios `LOW` pueden entregarse temprano una vez recibidos los textos exactos.

## 4. Diseño propuesto por requerimiento

### H-01 — ITBIS como base + 18 %

#### Regla propuesta

Para cada línea gravada cuando el usuario active `Aplicar ITBIS`, independientemente de que emita o no comprobante fiscal:

```text
base = round2(quantity * unitPrice)
itbis = round2(base * 0.18)
gross = base + itbis
```

Para servicios mecánicos y entrega, que permanecen no gravados:

```text
base = round2(quantity * unitPrice)
itbis = 0.00
gross = base
```

Mantener cálculo por línea y sumar líneas ya redondeadas. No calcular 18 % sobre el total combinado.

#### Cambios técnicos

- Reemplazar la semántica `tax-inclusive` en `apps/api/src/features/sales/money/line.ts` y sus constantes.
- Mantener `Prisma.Decimal`; no introducir `number` flotante en backend.
- Separar en el dominio la aplicación de ITBIS (`applyItbis`, nombre técnico por definir) de la condición de comprobante fiscal (`fiscal`); el flag `fiscal` actual no puede seguir controlando ambas cosas.
- Agregar un checkbox temporal `Aplicar ITBIS` al borrador/cotización y preservarlo en el snapshot completado.
- Ajustar textos de POS, detalle, vista previa y PDF de “ITBIS incluido” a la redacción aprobada.
- Actualizar contratos y pruebas unitarias/integración/web con ejemplos de frontera y redondeo.
- Preservar facturas `COMPLETED` con sus `gross`, `base` e `itbis` ya guardados; nunca recalcular documentos completados al leerlos.
- Recalcular borradores existentes bajo base + 18 % al activar el cambio; preservar facturas completadas con sus snapshots monetarios históricos.

#### Pruebas mínimas

- `118.00` gravado -> `21.24` ITBIS y `139.24` total.
- Varias líneas con redondeo individual.
- Servicios/entrega continúan no gravados si la empresa mantiene esa regla.
- Venta sin comprobante calcula ITBIS cuando se marca `Aplicar ITBIS`.
- `Cliente contado` predeterminado calcula ITBIS pero rechaza comprobante fiscal.
- Facturas completadas antiguas conservan totales.
- PDF y vista previa coinciden exactamente con la API.

### H-02/H-03/H-05 — Tipo, condiciones y elegibilidad de crédito

#### Modelo de datos propuesto

Agregar a `Customer`:

```text
customerType: CASH | CREDIT
creditLimit: Decimal(12,2) | null
creditTermDays: 30 | 45 | 60 | 90 | 120 | null
```

`customerType` es una clasificación interna independiente de `name`: no agrega prefijos ni las palabras “contado” o “crédito” al nombre visible. El único registro que conserva literalmente el nombre `Cliente contado` es el cliente genérico predeterminado, como ocurre actualmente. El Administrador puede cambiar la clasificación, sujeto a que un cliente `CREDIT` con saldo abierto no puede pasar a `CASH`.

Reglas de integridad recomendadas:

- `CASH`: `creditLimit` y `creditTermDays` deben ser nulos.
- `CREDIT`: RNC/cédula, límite DOP y plazo son obligatorios.
- Límite mayor que cero, salvo que la empresa confirme que cero significa “bloqueado”.
- El cliente genérico permanece `CASH`.
- El backfill clasifica todos los clientes nombrados existentes como `CASH`; la promoción posterior a `CREDIT` es una operación explícita del Administrador.
- La API ignora nunca campos inválidos: los rechaza con error de validación.
- La migración no modifica ningún nombre de cliente ni clasifica silenciosamente a nadie como crédito.

#### Autorización

- Administrador: crear/editar `CASH` y `CREDIT`.
- Vendedor: crear clientes `CASH`; no puede convertir uno a `CREDIT`, editar límite/plazo ni degradar un crédito sin una regla administrativa. Sí puede seleccionar un cliente ya registrado como `CREDIT` y venderle a crédito, sujeto al plazo y límite configurados por el Administrador.
- El servidor determina capacidades por rol; los campos ocultos en UI no sustituyen la autorización.
- Registrar en historial el tipo, límite y plazo, incluyendo `before/after` en cambios administrativos.

#### Flujo de facturación propuesto

- Cliente `CASH`: debe quedar pagado completamente en la confirmación.
- Cliente `CREDIT`: solo puede venderse a crédito en DOP. Cuando confirma un Vendedor, el pago inicial debe ser cero y los cobros posteriores pertenecen al Administrador. El Administrador sí puede registrar un pago parcial durante la confirmación; el saldo restante es la nueva exposición de crédito.
- Al confirmar, copiar al snapshot de factura el tipo y el plazo aplicados; cambios posteriores al cliente no reescriben la factura.
- `dueDate` de una venta a crédito = fecha local de confirmación + plazo aprobado.
- Una venta al contado no debería comportarse como CxC; se debe decidir si conserva `dueDate = confirmedAt`, `dueDate = null` o un valor histórico diferente.

#### Control del límite

La confirmación debe validar el límite dentro de la misma transacción serializable que asigna `FAC-` y completa la factura:

1. Releer cliente y condición de crédito.
2. Calcular exposición abierta según la definición aprobada.
3. Sumar el saldo que generará la nueva factura después de cualquier pago inicial permitido. Para una confirmación realizada por Vendedor, ese saldo será el total porque el Vendedor no registra pagos de crédito.
4. Rechazar si supera el límite.
5. Confirmar factura y snapshot de términos atómicamente.

Esto evita que dos confirmaciones concurrentes aprueben individualmente y excedan juntas el límite. El límite es absoluto: ni siquiera el Administrador puede confirmar por encima de él.

#### Moneda

El crédito y su límite se manejarán solamente en DOP. Una factura USD no podrá confirmarse con saldo pendiente; deberá cumplir las reglas de contado y quedar pagada totalmente. No se usará la tasa de rentabilidad para convertir límites, pagos o balances.

#### ITBIS, comprobante fiscal y RNC/cédula

La nueva regla desacopla dos conceptos que hoy dependen del mismo checkbox:

- **ITBIS:** puede calcularse aunque la venta no tenga comprobante fiscal.
- **Comprobante fiscal:** requiere un cliente nombrado con RNC/cédula válido.

`Cliente contado` predeterminado nunca puede emitir comprobante fiscal, pero sí puede generar ITBIS cuando se marque `Aplicar ITBIS`. Un cliente contado nombrado sin RNC/cédula tampoco puede emitir comprobante; uno que sí tenga RNC/cédula válido puede emitirlo. Por ahora la aplicación de ITBIS usa su propio checkbox, separado del comprobante fiscal. Cuando se integre eNCF, la empresa prevé que todas las facturas apliquen ITBIS y esa regla temporal deberá retirarse de forma controlada.

### H-04 — Restricción integral del Vendedor

#### Superficie propuesta

El Vendedor conservaría, según el texto recibido:

- clientes contado;
- borradores;
- facturación/ventas al contado;
- facturación a crédito únicamente para clientes previamente clasificados como `CREDIT` por un Administrador;
- cotizaciones y su conversión a factura;
- consulta mínima de facturas necesaria para su trabajo.

En el detalle de una factura crédito, el Vendedor podrá consultar los datos comerciales autorizados, el estado de pago y el saldo pendiente. La API y la UI omitirán el historial de pagos: importes individuales, fechas, métodos, referencias y actores.

Se retiraría:

- módulo `/receivables`;
- lectura de sus endpoints;
- botón/modal de registrar pagos posteriores;
- `POST /api/sales/:id/payments`;
- creación/edición de clientes crédito y sus campos;
- datos de costo y rentabilidad.

El Vendedor podrá registrar el pago inicial correspondiente durante la confirmación de una venta al contado. Para una venta a crédito confirmará sin pago inicial; todos esos cobros pertenecerán al Administrador.

#### Capas a cambiar

- **Backend routes/policies:** separar políticas de ventas, pagos, CxC y clientes crédito; no reutilizar un único `InvoiceManager` para todo.
- **Services:** repetir autorización en el comando de negocio sensible y validar tipo de cliente al confirmar.
- **Projections:** no enviar campos financieros/costo que el Vendedor no deba recibir.
- **Frontend policies/navigation:** quitar CxC y acciones de pago para Seller; bloquear deep links.
- **HTTP tests:** probar `403` directo aunque la UI no muestre enlaces.

No basta con remover el menú. Actualmente las rutas de ventas aceptan Administrador y Vendedor globalmente, por lo que deben separarse por operación.

### H-06 — Eliminar costo de adquisición de la línea de factura

#### Implementación recomendada

- Retirar “Origen del costo” y “Costo de adquisición” de alta y edición de línea.
- Eliminar esos campos de los payloads de Administrador y Vendedor.
- Rechazar server-side cualquier intento ordinario de enviar `acquisitionCostDop` o `costProvenance` desde el formulario de factura.
- Omitir costo en las proyecciones ordinarias de borrador/detalle para ambos roles.
- Mantener las columnas existentes para snapshots históricos y para la futura fuente de inventario; no hacer una migración destructiva.
- Mantener facturas completadas antiguas intactas.
- Guardar el costo de nuevas líneas no inventariadas como `UNKNOWN`, sin inventar cero.
- Habilitar el flujo existente de rentabilidad manual para que el Administrador registre la rentabilidad de la factura cuando el costo sea desconocido.
- Cuando se implemente inventario, el costo de adquisición se capturará en el registro/recepción de inventario y se copiará al snapshot de la línea al vender, no se volverá a pedir en facturación.

#### Comportamiento temporal confirmado

Hasta integrar inventario, las nuevas líneas se tratan con costo `UNKNOWN` y la rentabilidad calculada queda no disponible. La confirmación no se bloquea. Después de cada factura, el Administrador registra manualmente la rentabilidad mediante el flujo de ganancia manual existente, sin convertir ese valor en costo de adquisición ni alterar la factura, sus pagos o su saldo. Las facturas pendientes de captura manual continúan visibles como rentabilidad desconocida en la superficie administrativa actual.

### H-07 — Cotizaciones

La empresa confirmó que la cotización debe implementarse ahora y que no debe obligar al usuario a reconstruir la venta. La cotización y la futura factura compartirán la misma operación comercial: mismo identificador interno, cliente, moneda, condición fiscal, líneas, cantidades, precios y notas. La conversión será una transición de estado, no una copia a otro borrador.

#### Modelo recomendado

Extender el agregado de ventas con etapas explícitas de preparación y emisión de cotización, manteniendo una sola raíz de datos:

```text
QUOTE_DRAFT -> QUOTE_ISSUED -> COMPLETED
```

Reglas confirmadas:

- `QUOTE_DRAFT` es editable y todavía no tiene número `COT-`;
- emitir asigna un número único `COT-` y cambia a `QUOTE_ISSUED`;
- `QUOTE_ISSUED` es inmutable y tiene una vigencia de 30 días;
- una cotización emitida no puede editarse ni reactivarse;
- puede duplicarse copiando cliente, moneda, condición fiscal, líneas, cantidades, precios y notas a una nueva `QUOTE_DRAFT`, que al emitirse recibe el próximo `COT-` disponible;
- “Convertir a factura” completa inmediatamente la misma operación y asigna `FAC-`, sin crear una etapa/borrador de factura adicional;
- la factura conserva y muestra el número `COT-` original como trazabilidad;
- la transición conserva el mismo `Invoice.id`/identificador de operación;
- no crea otra colección de líneas ni duplica reservas;
- no asigna `FAC-` hasta completar la factura;
- convertir dos veces debe ser idempotente o devolver un conflicto seguro;
- la cotización no registra pagos, no genera CxC, no reserva inventario y no consume/vende inventario;
- editar la cotización solo es posible mientras está en `QUOTE_DRAFT`;
- la disponibilidad de inventario se valida únicamente al convertir;
- una cotización vencida no puede convertirse a factura;
- la conversión reutiliza el flujo normal de confirmación de borrador: una venta contado exige capturar pago completo y método antes de completar y asignar `FAC-`;
- al completar la factura se ejecutan todas las validaciones vigentes de cliente, crédito, límite, stock, ITBIS y pago;
- el historial registra creación, emisión y conversión con actor y fecha;
- una factura completada no puede volver a cotización.

No recomiendo modelar cotización y factura como dos registros independientes enlazados, porque eso duplicaría líneas, permitiría divergencia de datos y contradice el requisito de no volver a crear un borrador.

#### Numeración y documento

La cotización tendrá una identidad visible diferente de `FAC-`: la secuencia independiente `COT-000001`, asignada al emitirla. Tendrá PDF propio cuyo encabezado dirá **COTIZACIÓN**; por decisión de la empresa no agregará la frase “NO ES FACTURA”. El documento mostrará base, ITBIS y total con las mismas reglas monetarias aplicables a la factura futura. Al convertirse, conserva la referencia a `COT-` para trazabilidad y recibe `FAC-` al completar inmediatamente la factura.

La vigencia será de 30 días y terminará al final del día calendario número 30 en `America/Santo_Domingo`. Una cotización vencida queda impedida de conversión, edición y reactivación; el camino permitido es duplicarla como una nueva cotización.

#### Capas afectadas

- Prisma: estados de cotización, número `COT-`, fecha de emisión y fecha de expiración.
- Sales service: comandos de crear/emitir/convertir sobre el mismo agregado y validación idempotente.
- Repository: secuencia `COT-` transaccional, única y sin reutilización.
- API: endpoints explícitos de cotización y conversión; no sobrecargar confirmación con significado ambiguo.
- Web: lista/filtro de cotizaciones, editor reutilizado y acción de convertir.
- PDF: plantilla versionada separada del PDF de factura.
- History: eventos aditivos de cotización y conversión.
- Tests: identidad preservada, líneas no duplicadas, doble conversión y prohibición de pagos/CxC/inventario antes de completar.

### M-01 — Estado `ABONADO`

#### Alternativas de modelo

El estado seguirá derivándose del ledger, no se almacenará como una columna mutable:

| Condición | Estado técnico | Etiqueta visible |
|---|---|---|
| Sin pagos y dentro del plazo | `PENDING` | `PENDIENTE` |
| Pago parcial y dentro del plazo | `PARTIALLY_PAID` | `ABONADO` |
| Sin pagos y fuera de plazo | `OVERDUE` | `VENCIDA` |
| Pago parcial y fuera de plazo | `PARTIALLY_PAID_OVERDUE` | `ABONADA VENCIDA` |
| Saldo cero dentro del plazo | `PAID` | `PAGADA` |
| Saldo cero después del plazo | `PAID_LATE` | `PAGADA CON RETRASO` |
| Factura cancelada | `CANCELLED` | `CANCELADA` |

El cambio aplica a API, filtros CxC, chips, detalle, mocks, pruebas y PDF de factura.

### M-02 — Fecha emitida en CxC

- Usar la fecha de confirmación (`confirmedAt`) como “fecha emitida”, porque es cuando se asigna `FAC-`.
- Agregarla a la tabla de facturas abiertas y al detalle del estado de cuenta.
- Mantener `createdAt` como fecha de creación del borrador; no mezclar ambas.
- Formatear en `America/Santo_Domingo`.

### M-03 — Estado de cuenta por cliente

#### Read model propuesto

Crear un read model de solo lectura Administrador-only, por ejemplo:

```text
GET /api/customers/:customerId/account-statement
```

Contenido mínimo recomendado:

- cliente e identificación;
- moneda DOP;
- facturas: número, fecha emitida, vencimiento, total, pagos, saldo y estado;
- total abonado acumulado por factura, sin movimientos individuales;
- totales facturados, abonados y pendientes;
- fecha/hora de generación.

#### Reglas y experiencia aprobada

- Solo Administrador puede generar el documento.
- Se genera desde la pantalla CxC mediante un selector buscable/lista desplegable de clientes con saldo abierto y un botón `Generar estado de cuenta`.
- Sustituir el filtro libre actual por nombre por el selector de cliente, manteniendo una experiencia buscable para evitar una lista inmanejable.
- El PDF incluye todas las facturas vigentes con saldo del cliente seleccionado, sin límite de período predeterminado.
- Excluir facturas canceladas y reembolsos.
- Mostrar únicamente el acumulado abonado de cada factura; no listar fecha, método ni referencia de cada pago.
- El crédito es DOP-only, por lo que este estado de cuenta no combina monedas.
- Crear un renderer y tipo de hechos distinto al PDF de factura.
- No es necesaria una pantalla de vista previa adicional como requisito; la acción genera/descarga el PDF.

### L-01/L-02/L-03 — PDF y datos corporativos

#### Implementación recomendada

- Crear `internal-v4` para la nueva estructura monetaria y de contenido.
- Tratar los hechos comerciales históricos (cliente, líneas, importes, ITBIS, fechas, estado) como inmutables.
- Tratar los datos corporativos y aclaraciones del emisor como presentación vigente: al volver a descargar una factura histórica deben mostrarse los valores actuales confirmados por la empresa.
- Compartir un perfil corporativo centralizado entre los writers soportados, en vez de duplicar teléfonos/correo/redes en cada plantilla.
- Agregar TikTok `solo.camiones.srl` y ajustar layout para que redes y contactos no se solapen.
- Sustituir únicamente el teléfono derecho de `809-875-3161 / 809-212-7751`, dejando `809-875-3161 / 829-627-3168`.
- Cambiar el correo a `solocamionessrl@gmail.com`.
- Corregir `Av. Pte.` a `Av. Pdte.` conservando el resto de la dirección actual.
- Agregar al pie aclaraciones como:
  - una constante claramente identificada y fácil de editar para `Pagos por transferencia a cuenta: <BANCO / TIPO / NÚMERO / TITULAR PENDIENTES DE CONFIRMACIÓN>`;
  - `Pagos con cheques a nombre de: Solo Camiones`.
- No imprimir movimientos privados ni afirmar que el sistema procesa el pago.
- Probar extracción textual del PDF, paginación y facturas con muchas líneas.

#### Datos confirmados y pendiente operativo

- WhatsApp: `809-875-3161 / 829-627-3168`.
- Correo: `solocamionessrl@gmail.com`.
- Dirección: usar `Pdte.` en lugar de `Pte.` y conservar el resto del texto actual.
- TikTok: `solo.camiones.srl`.
- Cheques: `Solo Camiones`.
- Transferencias: plantilla editable; banco, tipo/número de cuenta, moneda y titular quedan pendientes de confirmación y no se inventarán.
- Los datos corporativos vigentes se aplican también al volver a descargar facturas históricas.

## 5. Cambios por capa

### Base de datos y migraciones

- Enum/tipo de cliente.
- Límite y plazo de crédito con constraints.
- Snapshot obligatorio en `Invoice` del tipo de cliente, plazo, límite/condición aplicados y número de cotización de origen.
- Índices para exposición abierta por cliente/moneda/estado.
- Migración de backfill documentada y ensayada sobre copia de datos.
- Ninguna modificación a migraciones ya aplicadas; crear migraciones nuevas.

### Backend

- Separar políticas por operación y rol.
- Validación condicional de cliente crédito.
- Política transaccional de límite y plazo.
- Cálculo ITBIS base + 18 %.
- Estado de pago derivado con semántica confirmada para `ABONADO`.
- CxC Administrador-only y fecha emitida.
- Endpoint/read model de estado de cuenta.
- Proyecciones sin costo para Seller.
- Proyecciones ordinarias de factura sin costo para ambos roles; rentabilidad manual permanece Administrador-only.
- PDF `internal-v4`.

### Frontend

- Formulario de cliente con selector tipo y campos de crédito visibles/editables solo para Administrador.
- Seller crea únicamente `CONTADO`.
- `Aplicar ITBIS` separado de comprobante y desmarcado por defecto.
- Retirar campos de costo de líneas para ambos roles.
- Retirar CxC/pago del menú y acciones de Seller; bloquear deep links.
- Mostrar nuevo estado de abono y fecha emitida.
- Pantalla/acción de estado de cuenta para Administrador.
- Actualizar resumen del POS para dejar claro `Subtotal/Base + ITBIS = Total`.

### Documentación

Antes de implementar código, las fuentes de verdad ya actualizadas (Paso 1) son:

- `docs/DEVELOPMENT_PLAN.md` — change set preproducción y su relación con Release 3.
- `docs/FEATURES/08_CUSTOMERS.md` — `CUST-004`–`CUST-007`.
- `docs/FEATURES/10_SALES_AND_INVOICES.md` — `SALE-009`, `SALE-010`, `QUOTE-001`, `QUOTE-002`, `DOC-001`.
- `docs/FEATURES/11_COST_AND_PROFITABILITY.md` — `COST-006`.
- `docs/FEATURES/12_PAYMENTS_AND_ACCOUNTS_RECEIVABLE.md` — `PAY-006`, `PAY-007`, `STMT-001`.
- `docs/ROLES_AND_PERMISSIONS.md` — matriz Admin/Seller.
- `docs/USE_CASE_FLOWS.md` — alta crédito, cotización y estado de cuenta.
- `docs/PROTOTYPE_PLAN.md` — navegación y demo corregidos.
- `docs/FUTURE_ROADMAP.md` — cotizaciones y estados de cuenta/crédito básico retirados del futuro.

## 6. Plan de entrega recomendado

### Hito 0 — Formalización de decisiones y documentación

**Estado:** cerrado 2026-09-15. IDs y criterios de aceptación están en Features 08/10/11/12.

- Trasladar el registro de decisiones de la sección 9 a las features fuente de verdad.
- Actualizar las especificaciones fuente de verdad.
- Definir casos de aceptación con ejemplos numéricos aprobados.
- Definir backfill de clientes y tratamiento de borradores existentes.

**Salida:** reglas firmes; ninguna ambigüedad de negocio llega a código desde este plan.

### Hito 1 — Modelo de cliente y autorización

- Migración de tipo/límite/plazo.
- Validación y policies Admin/Seller.
- API y UI de clientes.
- Historial y pruebas negativas de autorización.

**Salida:** no se puede crear o modificar crédito fuera de las reglas aprobadas.

### Hito 2 — ITBIS y retiro de costo en facturación

- Nueva fórmula.
- Checkbox `Aplicar ITBIS` separado de comprobante y desmarcado por defecto.
- Tratamiento de borradores previos.
- Totales UI/API y pruebas de redondeo.
- Compatibilidad de facturas completadas.
- Retirar costo de los formularios/payloads de ambos roles.
- Mantener costo `UNKNOWN` y flujo posterior de ganancia manual para Administrador.

**Salida:** ejemplos financieros aprobados coinciden en POS, API y documento.

### Hito 3 — Motor de crédito y restricciones de Seller

- Confirmación contado/crédito sobre el cálculo monetario estabilizado.
- Plazo y snapshot.
- Control transaccional de límite.
- Pago inicial parcial de crédito solo por Administrador.
- Bloqueo de pagos posteriores/CxC para Seller.
- Proyecciones por rol: Seller ve saldo/estado pero no pagos ni costo.

**Salida:** requests directos no pueden saltar las restricciones de UI y dos confirmaciones concurrentes no exceden el límite.

### Hito 4 — Cotizaciones convertibles

- Extender el agregado de ventas con la etapa de cotización aprobada.
- Implementar numeración `COT-`, vigencia de 30 días e inmutabilidad después de emitir.
- Reutilizar el editor y los mismos datos de la operación.
- Permitir duplicarla como nueva cotización con nuevo identificador y próximo número al emitir.
- Convertir directamente a `COMPLETED` mediante el motor del Hito 3, asignando `FAC-` sin duplicar borrador ni líneas.
- Preservar y mostrar `COT-` en la factura resultante.
- Registrar historial y asegurar idempotencia.
- Prohibir reserva/inventario, pagos y CxC mientras siga siendo cotización.

**Salida:** el Vendedor puede preparar una cotización y continuar esa misma operación hasta factura sin reconstruirla.

### Hito 5 — Estados de pago y CxC

- Estado `ABONADO` según semántica aprobada.
- Fecha emitida.
- Completar filtros Release 3 ya pendientes.
- Restringir CxC a Administrador.

**Salida:** Administrador puede explicar por cliente y moneda cada factura, pago y saldo.

### Hito 6 — Estado de cuenta PDF

- Selector buscable de clientes con saldo en CxC.
- Botón `Generar estado de cuenta`.
- Todas las facturas abiertas DOP del cliente, total abonado acumulado y saldo.
- Excluir canceladas, reembolsos y movimientos de pago individuales.

**Salida:** Administrador genera el estado de cuenta aprobado desde CxC.

### Hito 7 — PDFs y presentación corporativa

- PDF de cotización y factura con base, ITBIS, totales y estados aprobados.
- Datos corporativos confirmados, TikTok y `COT-` de origen.
- Plantilla editable de transferencia y cheques a nombre de Solo Camiones.
- Perfil corporativo vigente al volver a descargar facturas históricas, sin alterar hechos monetarios.
- Texto correcto de ITBIS y estado.
- Verificación visual y de paginación.

**Salida:** cotización, factura nueva, factura histórica y estado de cuenta de prueba aprobados por la empresa.

### Hito 8 — Gate antes de ambientes

- Migración desde una copia realista de base de datos.
- `npm run lint`.
- `npm run typecheck`.
- `npm run test`.
- `npm run build`.
- Walkthrough por rol: Administrador y Vendedor.
- Pruebas concurrentes de límite y confirmación.
- Regresión de PDFs históricos y nuevos.
- Solo después: configuración de development/staging/production y gate operativo.

## 7. Estrategia de pruebas

### Unitarias

- Fórmula de ITBIS y redondeo por línea.
- Elegibilidad contado/crédito.
- Cálculo de fecha de vencimiento por cada plazo.
- Límite exacto, debajo y encima.
- Estado `ABONADO` y precedencia con vencimiento.
- Totales DOP del estado de cuenta.
- Máquina de estados de cotización y elegibilidad de conversión.

### Integración PostgreSQL/API

- Dos confirmaciones concurrentes no exceden el límite.
- Seller recibe `403` al crear crédito, abrir CxC o registrar pago posterior.
- Seller no recibe costo en JSON ni puede escribirlo.
- Seller recibe saldo/estado de pago, pero no movimientos de pago de una factura crédito.
- Administrador puede crear/editar crédito.
- RNC/cédula requerido solo bajo la regla aprobada.
- Snapshot de tipo/plazo no cambia al editar cliente.
- Backfill y constraints aplican en base limpia y con datos existentes.
- Documentos completados conservan importes.
- Conversión de cotización conserva id, número `COT-`, cliente, moneda, líneas, cantidades, precios y notas, y asigna `FAC-`.
- Reintento/doble clic no crea otra factura, otro borrador ni líneas duplicadas.
- Cotización no admite pagos, CxC ni efectos de inventario.
- Cotización emitida rechaza edición y reactivación.
- Duplicación crea una nueva cotización y nunca reutiliza `COT-`.
- Cotización vencida rechaza conversión al finalizar el día 30.
- Cotización no reserva stock y la conversión falla limpiamente si la disponibilidad cambió.
- Conversión contado exige pago completo y método antes de asignar `FAC-`.
- PDF de cotización muestra base, ITBIS y total consistentes con API y editor.

### Componentes/web

- Campos condicionales por tipo y rol.
- Menú y deep links de Seller.
- POS muestra base, ITBIS y total correctos.
- CxC muestra fecha emitida y estado aprobado.
- Estado de cuenta maneja cliente sin saldo, error y una cantidad grande de facturas DOP abiertas.
- Selector CxC lista/busca clientes con saldo y habilita el PDF solo con una selección válida.
- Formularios de línea no exponen costo según alcance confirmado.
- Editor de cotización continúa como la misma operación al convertir, sin pedir recaptura.

### PDF

- Contactos y textos exactos.
- TikTok y medios de pago.
- ITBIS no aparece como “incluido” en `internal-v4`.
- Facturas largas no superponen pie, firmas o totales.
- `internal-v1/v2/v3` preservan hechos monetarios históricos y usan el perfil corporativo vigente al volver a descargarse.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Recalcular facturas emitidas con la nueva fórmula | Usar snapshots persistidos; no recalcular `COMPLETED`. |
| Superar límite por confirmaciones simultáneas | Validar exposición dentro de transacción serializable con retry controlado. |
| Ocultar UI pero dejar API abierta al Seller | Pruebas HTTP negativas y policies por operación. |
| Mezclar balances DOP/USD | Agrupar y reportar siempre por moneda; no usar FX de rentabilidad. |
| Perder rentabilidad al quitar costo | Costo `UNKNOWN`, factura no bloqueada y captura posterior mediante el flujo actual de ganancia manual. |
| Confundir actualización corporativa con reescritura histórica | Separar hechos inmutables de la factura de la presentación vigente del emisor; probar que solo cambian contactos/aclaraciones. |
| Clasificar mal clientes existentes | Backfill aprobado, reporte previo y migración ensayada. |
| Duplicar datos al convertir cotización | Mantener un solo agregado/identificador y hacer la conversión como transición idempotente. |

## 9. Registro de decisiones de la empresa

### ITBIS

1. **Confirmado:** el 18 % sobre la base aplica a `GENERIC`, `EXTERNAL`, `ITEM` y `QTY`; servicios y entrega permanecen sin ITBIS.
2. **Confirmado:** los borradores existentes se recalculan con base + 18 %.
3. **Confirmado:** las facturas completadas conservan exactamente sus importes históricos.
3.a. **Confirmado:** por ahora habrá un checkbox `Aplicar ITBIS`, independiente de `Comprobante fiscal`.
3.b. **Confirmado:** `Aplicar ITBIS` estará desmarcado de forma predeterminada al crear una cotización/borrador.

### Clientes y crédito

4. **Confirmado:** `CASH/CREDIT` es una clasificación separada del nombre; los clientes nombrados existentes se migran como `CASH` y el Administrador promoverá los que correspondan a `CREDIT`.
5. **Confirmado:** el crédito y su límite operan solamente en DOP; una factura USD debe quedar pagada completamente.
6. **Confirmado:** el límite controla saldo pendiente actual más el saldo que generará la nueva factura después de cualquier pago inicial autorizado.
7. **Confirmado:** nunca se permite exceder el límite, ni siquiera al Administrador.
8. **Confirmado:** el plazo 30/45/60/90/120 queda fijo en el cliente.
9. **Confirmado:** pagar total o parcialmente una factura no cambia la clasificación; el cliente continúa siendo `CREDIT`.
10. **Confirmado:** un cliente `CREDIT` con saldo abierto no puede cambiarse a `CASH`.
11. **Confirmado:** un cliente contado nombrado sin RNC/cédula no puede emitir comprobante fiscal.
12. **Confirmado:** `Cliente contado` genérico no puede emitir comprobante fiscal, pero sí puede calcular ITBIS.
12.a. **Confirmado:** un cliente contado nombrado con RNC/cédula válido puede emitir comprobante fiscal.

### Vendedor

13. **Confirmado:** el Vendedor puede ver clientes crédito existentes y venderles a crédito; solo el Administrador puede registrar o clasificar un cliente como crédito.
14. **Confirmado:** el Vendedor puede abrir el detalle de una factura crédito, pero no puede ver los pagos registrados.
14.a. **Confirmado:** el Vendedor puede ver saldo pendiente y estado de pago, pero no los movimientos registrados.
15. **Confirmado:** el Vendedor registra el pago completo durante la confirmación contado; una factura contado no puede confirmarse pendiente ni cobrarla posteriormente como excepción.
16. **Confirmado:** el Vendedor conserva Clientes, pero al crear solo puede registrar clientes `CASH`.
17. **Confirmado:** la cotización se convierte directamente a `COMPLETED`, sobre la misma operación y asignando `FAC-`, sin crear/copiar otro borrador.
18. **Confirmado:** tendrá número propio `COT-`, PDF con título `COTIZACIÓN` y vigencia de 30 días.
19. **Confirmado:** una vez emitida no puede modificarse ni reactivarse; puede duplicarse como una cotización nueva, que obtiene un nuevo `COT-` al emitirse.
20. **Confirmado:** la factura conserva y muestra el número `COT-` original.
21. **Confirmado:** la cotización vence al final del día número 30 en `America/Santo_Domingo`.
22. **Confirmado:** una cotización vencida queda bloqueada para convertir a factura.
23. **Confirmado:** al duplicar se copian cliente, moneda, condición fiscal, líneas, precios y notas a una nueva cotización editable.
24. **Confirmado:** la cotización no reserva inventario; la disponibilidad se valida únicamente al convertirla.
25. **Confirmado:** la conversión contado usa el flujo normal de borrador a factura y exige pago completo/método antes de asignar `FAC-`.
26. **Confirmado:** el PDF de cotización muestra base, ITBIS y total.

### Costo

27. **Confirmado:** los campos de costo se eliminan del formulario para Administrador y Vendedor.
28. **Confirmado:** hasta integrar inventario, las líneas nuevas quedan con costo `UNKNOWN` y el Administrador registra manualmente la rentabilidad de cada factura.
29. **Confirmado:** el costo tampoco se entrega en las proyecciones ordinarias de factura; la futura fuente será el registro/recepción de inventario.
29.a. **Confirmado:** la factura se confirma sin bloquearse, queda con rentabilidad desconocida y el Administrador registra posteriormente la ganancia manual mediante el flujo actual.

### Pagos y CxC

30. **Confirmado:** se necesitan `ABONADO` dentro del plazo y `ABONADA VENCIDA` después del vencimiento.
31. **Confirmado:** esos estados también aparecen en el PDF de factura.
32. **Confirmado:** “fecha emitida” es `confirmedAt`, cuando se asigna `FAC-`.
33. **Confirmado:** solo el Administrador puede generar estados de cuenta.
34. **Confirmado:** el estado de cuenta incluye todas las facturas vigentes que tengan saldo del cliente seleccionado.
35. **Confirmado:** se genera como PDF desde un botón en CxC, después de seleccionar el cliente en un selector buscable/lista desplegable.
36. **Confirmado:** no usa un período predeterminado; incluye todas las facturas con saldo.
37. **Confirmado:** excluye facturas canceladas y reembolsos.
37.a. **Confirmado:** por cada factura se muestra únicamente el total abonado acumulado, sin movimientos individuales.

### PDF y datos corporativos

38. **Confirmado:** sustituir el teléfono derecho `809-212-7751` por `829-627-3168`; conservar `809-875-3161`.
39. **Confirmado:** usar `solocamionessrl@gmail.com`.
40. **Confirmado:** corregir la abreviatura a `Pdte.` y conservar el resto de la dirección actual.
41. **Confirmado:** agregar TikTok `solo.camiones.srl`.
42. **Confirmado temporalmente:** dejar una plantilla centralizada/editable para banco, tipo/número de cuenta, moneda y titular hasta recibir los valores definitivos; no inventar datos.
43. **Confirmado temporalmente:** indicar cheques a nombre de `Solo Camiones`.
44. **Confirmado:** al volver a descargar/regenerar facturas históricas se aplican los datos corporativos y aclaraciones vigentes sin modificar sus hechos comerciales o monetarios.

## 10. Criterio de terminado

Este change set estará listo antes de configurar ambientes cuando:

- las decisiones de esta sección estén incorporadas en las features correspondientes;
- migraciones y backfill estén probados;
- los límites y permisos se cumplan en servidor bajo concurrencia;
- POS, API y PDF coincidan en ITBIS y totales;
- el Vendedor no pueda crear crédito, cobrar crédito, abrir CxC ni recibir costo;
- una cotización pueda convertirse sobre la misma operación sin duplicar borrador, líneas ni efectos;
- el Administrador pueda mantener condiciones de crédito y generar el estado de cuenta aprobado;
- facturas históricas permanezcan coherentes;
- la suite completa, lint, typecheck y build pasen;
- la empresa apruebe un walkthrough por rol y ejemplos de PDF/estado de cuenta.
