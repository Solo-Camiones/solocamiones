# Rentabilidad y tasa de cambio

Guía operativa para Administradores. Fuentes: Feature 11 (`COST-002` a `COST-006`) y Feature 16 (`CON-006`).

## Quién ve la rentabilidad

Ganancia bruta, margen y estadísticas de rentabilidad son exclusivas del Administrador. El Vendedor y el Mecánico no las ven.

## Costo de adquisición

- El costo de adquisición se guarda siempre en pesos (DOP).
- La facturación ya no pide ni muestra costo de adquisición, ni al Vendedor ni al Administrador.
- Las líneas nuevas se guardan con costo desconocido. Desconocido nunca significa cero.
- El costo conocido llegará desde el módulo de inventario cuando esté disponible.

## Ganancia bruta

- Ganancia bruta = precio de venta final − costo de adquisición conocido o estimado.
- Es ganancia bruta, no utilidad neta contable.
- Si alguna línea de la operación tiene costo desconocido, la ganancia de la operación queda no disponible; el sistema no inventa ganancia sumando solo las líneas conocidas.

## Ganancia registrada por el Administrador

Cuando la ganancia no se puede calcular por costo desconocido, el Administrador puede registrar una ganancia bruta en DOP según su criterio.

- Se permiten montos cero o negativos (sin ganancia o pérdida).
- No cambia costos, precios, pagos ni el estado de la operación.
- Queda historial con valores anteriores y nuevos.
- No aplica a operaciones con ganancia ya calculada ni a operaciones en USD pendientes de tasa.

## Operaciones en dólares (USD)

- Para una venta en USD, el sistema obtiene de un proveedor externo la tasa en pesos por dólar al reconocer la venta.
- Calcula la ganancia en USD y la convierte a DOP con esa misma tasa para los reportes.
- La tasa se guarda con su origen y fecha; los resultados no cambian si la tasa del mercado se mueve después.
- Si el proveedor de tasa falla, la venta se confirma igual y la rentabilidad queda como pendiente de tasa. El Administrador puede reintentar después; el reintento usa la tasa del día de la venta y no vuelve a ejecutar la venta.
- Esta conversión solo sirve para rentabilidad. Nunca convierte pagos, saldos ni reembolsos.

## Indicadores del período

La pantalla Rentabilidad muestra, en DOP:

- Ventas de contado, ventas a crédito y ventas totales, según si la operación se pagó completa al confirmarse (no según el tipo de cliente).
- Cobrado neto por método de pago, según la fecha efectiva del pago.
- Total abierto de cuentas por cobrar, en DOP y en USD por separado.

Las operaciones canceladas se excluyen. Los montos en USD sin tasa guardada se omiten de las cifras en DOP.

## Conduces y rentabilidad

Un conduce cuenta como venta desde su emisión, una sola vez. Al facturarlo no se duplica en ventas, rentabilidad, CxC ni reportes, y la tasa de cambio no se vuelve a calcular.

## Reporte de ventas por vendedor

El Administrador tiene un reporte de ventas por vendedor en Finanzas y control, con rango de fechas y vendedor opcional, en pantalla y en PDF. Atribuye cada venta al vendedor que la emitió y no cuenta dos veces una operación que pasó de conduce a factura.
