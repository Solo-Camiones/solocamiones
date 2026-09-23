# Cotizaciones, conduces y facturas

Guía operativa para Administradores. Fuentes: Feature 10 (`SALE-*`, `QUOTE-*`, `DOC-001`) y Feature 16 (`CON-001`, `CON-003`, `CON-004`).

## Una sola operación con varias etapas

Cotización, conduce y factura son etapas de la misma operación de venta. No se copian líneas entre documentos.

Recorridos permitidos:

- Borrador → factura (confirmación directa, sin conduce).
- Borrador → conduce → factura.
- Cotización borrador → cotización emitida → factura.
- Cotización emitida → conduce → factura.

Cualquier operación reconocida puede terminar cancelada por un Administrador.

## Numeración

- `COT-000001`: número de cotización, se asigna al emitir la cotización.
- `CON-000001`: número de conduce, se asigna al emitir el conduce.
- `FAC-000001`: número de factura, se asigna al confirmar la factura o al facturar un conduce.
- Cada secuencia es independiente, automática y nunca reutiliza números, ni siquiera tras una cancelación.
- Los usuarios nunca escriben estos números.
- Una operación fallida no consume número.

## Moneda

Cada operación usa una sola moneda: `DOP` o `USD`. Líneas, totales, pagos, saldos y reembolsos usan esa moneda. No hay conversión operativa de moneda.

## Líneas disponibles hoy

- Mercancía genérica de texto libre.
- Servicio mecánico del catálogo de servicios.
- Reventa externa.
- Envío o entrega (con cargo o sin cargo).

Las líneas de inventario individual y de producto por cantidad todavía no están disponibles.

Cada línea puede llevar una nota de hasta 100 caracteres. La nota nunca cambia precios, impuestos ni inventario.

## ITBIS y descuento

- `Aplicar ITBIS` está desmarcado por defecto y es independiente de la emisión fiscal.
- Con ITBIS activo, el precio escrito es la base sin impuesto: `base = cantidad × precio`, `ITBIS = base × 18%`, redondeando cada línea a dos decimales.
- Servicio mecánico y envío nunca llevan ITBIS.
- El ITBIS de la factura es la suma del ITBIS ya redondeado de cada línea.
- El descuento porcentual (0 a 100) se aplica sobre la suma de las bases de todas las líneas y no reduce el ITBIS.
- Las operaciones confirmadas conservan sus montos guardados; nunca se recalculan.

## Factura fiscal y NCF

- Una factura fiscal requiere un cliente con nombre y RNC/Cédula válido. `Cliente contado` nunca puede ser fiscal.
- Marcar la factura como fiscal no agrega ITBIS por sí solo.
- El sistema no se conecta a la DGII y no genera, valida ni asigna NCF ni e-CF. El PDF muestra un campo `NCF` en blanco para el proceso manual.

## Cotizaciones

- La cotización borrador se puede editar y no tiene número.
- Al emitirla recibe `COT-` y queda inmutable.
- Es válida hasta el final del día 15 posterior a su emisión, en hora de Santo Domingo. Después no se puede convertir.
- Una cotización se puede duplicar como borrador nuevo; recibe un `COT-` nuevo cuando se emite.
- Una cotización no registra pagos ni crea cuentas por cobrar hasta convertirse.

## Confirmación directa de factura

- Cliente `CASH` (incluido `Cliente contado`): debe pagar el total al confirmar.
- Cliente `CREDIT`: solo en DOP y dentro del límite. El Vendedor confirma sin pago inicial; el Administrador puede registrar un pago inicial parcial o total.
- Una factura en USD no puede confirmarse con saldo pendiente.
- La excepción del Administrador para dejar saldo a un cliente `CASH` con nombre solo existe al emitir conduces, nunca al confirmar factura directa.

## Conduces

- Emitir un conduce reconoce la venta una sola vez y congela cliente, líneas, moneda, descuento, ITBIS, totales y vendedor.
- El conduce siempre es no fiscal y no se puede editar una vez emitido.
- Las reglas de pago al emitir un conduce están en la guía de pagos y CxC.

## Facturar un conduce

- El Vendedor y el Administrador pueden convertir un conduce en factura, eligiendo si es fiscal.
- La validación fiscal usa los datos del cliente congelados en el conduce.
- Se asigna `FAC-` y la fecha de factura es el momento de la conversión.
- No se recalculan líneas, ITBIS ni totales, no se crean pagos y se conservan la fecha de vencimiento, los pagos y el saldo.
- Un conduce cancelado no se puede facturar.

## Documentos PDF

- Factura: muestra `FAC-`, orígenes `CON-` y `COT-` cuando existan y el campo NCF en blanco. No muestra estado de pago ni saldo.
- Conduce: muestra `CON-`, cliente, vendedor, líneas y totales. Nunca muestra NCF, pagos ni saldo.
- Cotización: título `COTIZACIÓN`, con las mismas reglas de base, ITBIS y total.
- Al volver a descargar un PDF se conservan los datos comerciales originales y se aplica el perfil corporativo vigente.
- Si falla la generación del PDF, la venta sigue siendo válida y el Administrador puede regenerarlo.
