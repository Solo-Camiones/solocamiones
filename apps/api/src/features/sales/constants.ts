export const DEFAULT_DRAFT_CURRENCY = 'DOP' as const;
export const MISSING_GENERIC_CUSTOMER_MESSAGE = 'Cliente contado is not seeded';
export const FISCAL_IDENTITY_REQUIRED_MESSAGE =
  'A fiscal invoice requires a customer with RNC or Cédula';
export const DRAFT_ONLY_EDIT_MESSAGE = 'Only draft invoices can be edited';
export const DRAFT_ONLY_DISCARD_MESSAGE = 'Only draft invoices can be discarded';
export const DRAFT_META_REQUIRED_MESSAGE = 'At least one field is required';
export const UNSUPPORTED_INVENTORY_LINE_MESSAGE =
  'Inventory-backed lines are not available; this invoice cannot create, reserve, or consume stock';
export const UNSUPPORTED_LINE_TYPE_MESSAGE =
  'Only GENERIC, SERVICE, DELIVERY, and EXTERNAL draft lines are supported';
export const DUPLICATE_DELIVERY_LINE_MESSAGE = 'A draft can have at most one DELIVERY line';
export const INACTIVE_SERVICE_LINE_MESSAGE = 'Inactive catalog services cannot be added to a draft';
export const CATALOG_SERVICE_NOT_FOUND_MESSAGE = 'Catalog service not found';
export const LINE_NOT_FOUND_MESSAGE = 'Invoice line not found';
export const FIXED_LINE_QUANTITY_MESSAGE = 'This line type has a fixed quantity of 1';
export const LINE_DESCRIPTION_NOT_EDITABLE_MESSAGE =
  'This line type does not allow editing the description';
export const LINE_NOTE_MAX_LENGTH = 100;
export const UNKNOWN_COST_AMOUNT_MESSAGE = 'UNKNOWN cost must not include an amount';
export const COST_AMOUNT_REQUIRED_MESSAGE =
  'Acquisition cost amount is required when provenance is not UNKNOWN';
export const COST_PROVENANCE_REQUIRED_MESSAGE =
  'Cost provenance is required when acquisition cost is updated';
export const EMPTY_DRAFT_CONFIRM_MESSAGE = 'Agregue al menos una línea';
export const DRAFT_ONLY_CONFIRM_MESSAGE = 'Solo se puede confirmar un borrador';
export const QUOTE_DRAFT_ONLY_ISSUE_MESSAGE = 'Solo se puede emitir una cotización en borrador';
export const QUOTE_ISSUED_ONLY_DUPLICATE_MESSAGE = 'Solo se puede duplicar una cotización emitida';
export const QUOTE_ISSUED_ONLY_CONVERT_MESSAGE = 'Solo se puede convertir una cotización emitida';
export const EXPIRED_QUOTE_CONVERT_MESSAGE = 'La cotización está vencida y no puede convertirse';
export const DRAFT_ONLY_ISSUE_CONDUCE_MESSAGE = 'Solo se puede emitir un conduce desde un borrador';
export const QUOTE_ISSUED_ONLY_CONVERT_TO_CONDUCE_MESSAGE =
  'Solo se puede convertir a conduce una cotización emitida';
export const CONDUCE_ONLY_CONVERT_TO_INVOICE_MESSAGE = 'Solo se puede facturar un conduce emitido';
export const CONDUCE_FISCAL_RETRY_MISMATCH_MESSAGE =
  'El conduce ya fue facturado con otra opción fiscal';
export const PAYMENT_COMPLETED_ONLY_MESSAGE =
  'Solo se pueden registrar pagos en facturas completadas o conduces emitidos';
export const PAYMENT_DATE_RANGE_MESSAGE =
  'La fecha del pago debe estar entre la confirmación y hoy';
export const PAYMENT_EXCEEDS_BALANCE_MESSAGE = 'El pago no puede superar el saldo pendiente';
export const CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE =
  'Las ventas de contado deben pagarse por completo al confirmar';
export const USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE =
  'Las facturas en USD deben pagarse por completo al confirmar';
export const SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE =
  'El Vendedor no puede registrar un pago al confirmar una venta a crédito';
export const CREDIT_LIMIT_EXCEEDED_MESSAGE =
  'El límite de crédito del cliente sería excedido';
export const PAYMENT_IDEMPOTENCY_MISMATCH_MESSAGE =
  'La clave de idempotencia ya fue usada con datos de pago diferentes';
export const CANCELLATION_COMPLETED_ONLY_MESSAGE =
  'Solo se pueden cancelar facturas completadas o conduces emitidos';
export const CANCELLATION_REASON_REQUIRED_MESSAGE = 'La cancelación requiere un motivo';
export const CANCELLATION_REFUND_AMOUNT_REQUIRED_MESSAGE =
  'La cancelación requiere el monto de reembolso cuando hay neto cobrado';
export const CANCELLATION_REFUND_EXCEEDS_NET_MESSAGE =
  'El reembolso no puede superar el neto cobrado';
export const CANCELLATION_REFUND_METHOD_REQUIRED_MESSAGE =
  'La cancelación requiere el método del reembolso cuando el monto es mayor que cero';
export const CONDUCE_DUE_DATE_REQUIRED_MESSAGE =
  'El vencimiento es obligatorio cuando el conduce de contado queda con saldo';
export const CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE =
  'El vencimiento no puede ser anterior al día local de emisión del conduce';
export const CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE =
  'El vencimiento manual solo aplica a conduces de contado nombrados con saldo';
export const INVOICE_NUMBER_PREFIX = 'FAC-';
export const QUOTE_NUMBER_PREFIX = 'COT-';
export const CONDUCE_NUMBER_PREFIX = 'CON-';
export const INVOICE_NUMBER_PAD_WIDTH = 6;

export function formatInvoiceNumber(sequenceValue: number): string {
  return `${INVOICE_NUMBER_PREFIX}${String(sequenceValue).padStart(INVOICE_NUMBER_PAD_WIDTH, '0')}`;
}

export function formatQuoteNumber(sequenceValue: number): string {
  return `${QUOTE_NUMBER_PREFIX}${String(sequenceValue).padStart(INVOICE_NUMBER_PAD_WIDTH, '0')}`;
}

export function formatConduceNumber(sequenceValue: number): string {
  return `${CONDUCE_NUMBER_PREFIX}${String(sequenceValue).padStart(INVOICE_NUMBER_PAD_WIDTH, '0')}`;
}
