# Cancelaciones y reembolsos

Guía operativa para Administradores. Fuentes: Feature 13 (`CANCEL-001`, `CANCEL-002`) y Feature 16 (`CON-005`).

## Quién puede cancelar

Solo el Administrador puede cancelar. El Vendedor y el Mecánico no pueden cancelar operaciones ni registrar reembolsos.

## Qué se puede cancelar

- Una factura confirmada.
- Un conduce emitido.
- Una factura que salió de un conduce. En ese caso se cancela la operación completa: el conduce y la factura quedan cancelados.

Una operación ya cancelada no se vuelve a cancelar.

## Cancelar no es borrar

- La cancelación exige un motivo y registra fecha y Administrador.
- El documento original se conserva con sus líneas, precios, impuestos y totales.
- El número (`FAC-` o `CON-`) se conserva y nunca se reutiliza.
- Los pagos originales se conservan; el reembolso es un registro adicional.

## Reembolso al cancelar

- El Administrador indica el monto realmente devuelto, desde cero hasta el neto cobrado de la operación.
- Un reembolso mayor que el neto cobrado se rechaza.
- Si el reembolso es mayor que cero, debe indicar el método (efectivo, transferencia o cheque).
- El reembolso usa la moneda de la operación.
- Se puede cancelar con reembolso cero, incluso si hubo pagos; el historial de pagos queda intacto.
- Al cancelar, el saldo pendiente de la operación queda en cero.

## Documento cancelado

El PDF de una operación cancelada sigue disponible. Conserva los datos originales y agrega una marca visible `CANCELADA` con fecha, motivo y Administrador.

## Efectos en reportes

Las operaciones canceladas salen de las cuentas por cobrar abiertas y de los totales de ventas y cobros.

## Inventario

La restauración automática de inventario al cancelar depende del módulo de inventario, que todavía no está disponible en producción.
