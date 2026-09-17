const INVOICE_NUMBER_PATTERN = /^FAC-\d{6}$/i;

export const RECEIVABLES_INVOICE_FILTER_ERROR = 'Debe ser un número de factura FAC-000123.';

export function parseReceivablesInvoiceFilter(value: string): string | undefined {
  const trimmed = value.trim();
  if (!INVOICE_NUMBER_PATTERN.test(trimmed)) {
    return undefined;
  }

  return trimmed.toUpperCase();
}

export function isValidReceivablesInvoiceFilter(value: string): boolean {
  return parseReceivablesInvoiceFilter(value) !== undefined;
}
