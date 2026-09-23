# Pagos, cuentas por cobrar y estados de cuenta

Guía operativa para Administradores. Fuentes: Feature 12 (`PAY-001` a `PAY-007`, `STMT-001`) y Feature 16 (`CON-002`).

## Pagos como registros acumulativos

- Cada pago es un registro nuevo con monto, moneda de la operación, método, fecha efectiva, referencia opcional y usuario.
- Un pago nunca sobrescribe a otro.
- Métodos disponibles: efectivo (`CASH`), transferencia (`TRANSFER`) y cheque (`CHECK`).
- Una operación puede pagarse con varios pagos y con métodos distintos.
- El pago debe estar en la moneda de la operación. Una factura en DOP rechaza pagos en USD y viceversa.
- No se permiten pagos mayores al saldo pendiente.
- Enviar el mismo pago dos veces no lo registra dos veces.
- Un pago de monto cero no se guarda.

## Quién puede registrar pagos

- El Vendedor solo puede registrar el pago completo al confirmar una venta de contado o al emitir un conduce que exige pago completo.
- Los cobros posteriores (abonos) los registra solo el Administrador.
- El Mecánico no tiene acceso a información financiera.

## Estados de pago

El estado se calcula a partir de los pagos y la fecha de vencimiento; no se guarda como un campo editable.

| Situación                          | Estado visible     |
| ---------------------------------- | ------------------ |
| Sin pagos, dentro del plazo        | PENDIENTE          |
| Pago parcial, dentro del plazo     | ABONADO            |
| Sin pagos, vencida                 | VENCIDA            |
| Pago parcial, vencida              | ABONADA VENCIDA    |
| Saldo cero a tiempo                | PAGADA             |
| Saldo cero después del vencimiento | PAGADA CON RETRASO |
| Operación cancelada                | CANCELADA          |

## Fecha de vencimiento

- Venta a crédito: fecha local de confirmación más el plazo del cliente (30, 45, 60, 90 o 120 días), al final de ese día en hora de Santo Domingo.
- Venta de contado pagada completa: vence el mismo día de la confirmación.
- Las facturas históricas conservan la fecha de vencimiento que ya tenían.

## Pago inicial al emitir un conduce

- Vendedor con cliente `CASH` (incluido `Cliente contado`): pago completo obligatorio.
- Vendedor con cliente `CREDIT` en DOP: sin pago inicial; aplican límite y plazo.
- Vendedor en USD: pago completo obligatorio.
- Administrador con cliente `CASH` con nombre, en DOP o USD: puede registrar pago cero, parcial o completo. Si queda saldo, debe indicar una fecha de vencimiento igual o posterior al día de emisión. Esto no convierte al cliente en `CREDIT` ni usa límite de crédito.
- Administrador con `Cliente contado`: pago completo obligatorio.
- Administrador con cliente `CREDIT` en DOP: pago cero, parcial o completo, dentro del límite.
- Administrador con cliente `CREDIT` en USD: pago completo obligatorio.

## Cuentas por cobrar (CxC)

La pantalla CxC y sus consultas son exclusivas del Administrador.

- Muestra facturas y conduces confirmados con saldo pendiente.
- Resume saldos por cliente y por moneda. DOP y USD nunca se suman ni se convierten entre sí.
- La fecha de emisión que se muestra es la del reconocimiento comercial (confirmación de factura o emisión de conduce).
- Filtros disponibles: cliente (selector con búsqueda) y número de documento `FAC-` o `CON-`.
- No hay filtros por estado de pago, fecha de emisión ni moneda.
- El Vendedor no ve estado de pago, montos pagados, saldo ni movimientos de pago en facturas.

## Estado de cuenta en PDF

- Solo el Administrador lo genera desde CxC, eligiendo un cliente con saldo abierto y usando `Generar estado de cuenta`.
- Incluye todas las operaciones abiertas en DOP del cliente: número, fecha de emisión, vencimiento, estado, total, pagado acumulado y saldo.
- Excluye operaciones canceladas y reembolsos.
- Los totales del documento cuadran con las filas listadas.
- Un cliente sin saldo abierto no puede generar estado de cuenta.

## Lo que no existe todavía

Antigüedad de saldos por tramos, intereses, promesas de pago, recordatorios automáticos y conciliación bancaria no están disponibles.
