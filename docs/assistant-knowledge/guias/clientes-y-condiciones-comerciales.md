# Clientes y condiciones comerciales

Guía operativa para Administradores. Fuente: Feature 08 (`CUST-001` a `CUST-007`).

## Qué es un cliente en Solo Camiones

Un cliente es un registro reutilizable para vender. No es un CRM. Guarda nombre, contactos, RNC/Cédula, dirección, notas, tipo de cliente y, solo para clientes a crédito, límite y plazo.

- Un cliente puede tener varios contactos (nombre, teléfono, correo y cargo opcional).
- El teléfono y el correo pertenecen a los contactos, no al cliente.
- El directorio se busca por nombre o RNC/Cédula.
- El Mecánico no tiene acceso a clientes.

## Cliente contado (cliente genérico)

`Cliente contado` es el cliente por defecto para ventas de mostrador no fiscales.

- Siempre es de tipo `CASH` (contado) y nunca puede venderse a crédito.
- Toda confirmación de factura directa y toda emisión de conduce con `Cliente contado` exige un pago inicial igual al total.
- Nunca puede recibir una factura con valor fiscal, aunque se marque `Aplicar ITBIS`.
- La excepción del Administrador que permite dejar saldo en un conduce de cliente contado con nombre no aplica a `Cliente contado`.

## Tipos de cliente: contado y crédito

Cada cliente tiene un tipo interno `customerType`: `CASH` (contado) o `CREDIT` (crédito).

- El tipo es independiente del nombre. No se escribe "contado" ni "crédito" en el nombre del cliente.
- Pagar facturas no cambia el tipo del cliente.
- Un cliente `CASH` no tiene límite ni plazo de crédito.
- Un cliente `CREDIT` requiere RNC/Cédula, un límite de crédito positivo en pesos (DOP) y un plazo de 30, 45, 60, 90 o 120 días.

## Quién puede crear y editar clientes

- El Administrador puede crear y editar clientes `CASH` y `CREDIT`, incluidos límite y plazo.
- El Vendedor solo puede crear clientes `CASH`. No puede cambiar tipo, límite ni plazo.
- El Vendedor sí puede seleccionar un cliente `CREDIT` existente en una venta.

## Límite de crédito y plazo

- El crédito existe solo en DOP. Una factura en USD no puede quedar con saldo, aunque el cliente sea `CREDIT`.
- Al confirmar una venta a crédito, el sistema suma los saldos abiertos del cliente (facturas y conduces en DOP) más el saldo que dejaría la nueva operación. Si supera el límite, la operación se rechaza, también para el Administrador.
- La fecha de vencimiento de una venta a crédito es la fecha local de confirmación (zona `America/Santo_Domingo`) más el plazo del cliente, al final de ese día. No es siempre +30 días.
- El tipo y el plazo vigentes se copian a la operación al confirmarla. Cambios posteriores en el cliente no modifican operaciones ya emitidas.

## Cambios de clasificación

- Cambiar tipo, límite o plazo deja historial con los valores anteriores y nuevos.
- Un cliente `CREDIT` con cualquier saldo abierto no puede pasar a `CASH`.
- Las operaciones canceladas no bloquean ese cambio.

## Identidad fiscal

- Un cliente `CASH` con nombre y RNC/Cédula válido puede recibir una factura con valor fiscal.
- Un cliente con nombre pero sin identificación válida no puede recibir una factura fiscal, pero sí una venta no fiscal.
- `Aplicar ITBIS` es una decisión separada de la emisión fiscal.

## Datos congelados en la operación

Al confirmar una factura o emitir un conduce, el sistema guarda una copia inmutable de los datos del cliente usados en ese momento (nombre, RNC/Cédula, teléfono del contacto principal, tipo y plazo). Editar el cliente después no cambia documentos emitidos.
