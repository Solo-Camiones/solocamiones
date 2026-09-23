/** Document lookup matches API listReceivablesSchema: FAC- or CON- (CON-002 / PAY-007). */
const DOCUMENT_NUMBER_PATTERN = /^(FAC|CON)-\d{6}$/i;

export const RECEIVABLES_INVOICE_FILTER_ERROR =
  'Debe ser un número FAC-000123 o CON-000123.';

export function parseReceivablesInvoiceFilter(value: string): string | undefined {
  const trimmed = value.trim();
  if (!DOCUMENT_NUMBER_PATTERN.test(trimmed)) {
    return undefined;
  }

  return trimmed.toUpperCase();
}

export function isValidReceivablesInvoiceFilter(value: string): boolean {
  return parseReceivablesInvoiceFilter(value) !== undefined;
}
