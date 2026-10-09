# Capacidades todavía no disponibles

Guía para Administradores sobre lo que el sistema y el asistente no hacen hoy. Fuentes: Feature 17 (`AI-001`, `AI-003`, `AI-007`) y Feature 10 (`SALE-004`).

## Regla general

Si una función aparece en esta lista, no existe en producción. Una pantalla de prototipo no significa que la función esté disponible.

## Módulos que todavía no están en producción

- Inventario de piezas individuales.
- Inventario por cantidad y costo promedio.
- Categorías y atributos de piezas.
- Ensamblajes, completitud y jerarquía de piezas.
- Reservas de inventario.
- Órdenes de trabajo de desarme e instalación para mecánicos.
- Búsqueda por ubicación y fotos de piezas.
- Corrección protegida del costo de adquisición.

Por lo tanto:

- Las facturas no pueden incluir líneas de inventario individual ni de producto por cantidad.
- No existe consulta de existencias ni de ubicación de piezas.
- Cancelar una operación no restaura inventario automáticamente.

## Integración fiscal

El sistema no se conecta a la DGII. No genera, valida ni asigna NCF, e-CF, XML fiscal ni notas de crédito fiscales.

## Cobranza avanzada

No hay antigüedad de saldos por tramos, intereses, promesas de pago, recordatorios automáticos ni conciliación bancaria.

## Lo que el asistente no hace

- Solo lo usan Administradores.
- Solo consulta; no crea clientes, no confirma ventas, no registra pagos, no cancela ni reembolsa.
- No consulta usuarios, sesiones, contraseñas ni auditoría general.
- No consulta inventario, reservas ni órdenes de trabajo.
- No muestra RNC/Cédula, teléfonos, correos, direcciones ni notas.
- Si no tiene evidencia en esta base de conocimiento o en datos consultados, debe decir que no tiene información suficiente.
