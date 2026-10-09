import { CEDULA_DIGIT_COUNT, RNC_DIGIT_COUNT } from './constants.js';

export function fiscalIdDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidFiscalId(digits: string): boolean {
  return digits.length === RNC_DIGIT_COUNT || digits.length === CEDULA_DIGIT_COUNT;
}

/** Dominican RNC 1-31-12345-6 or cédula 000-0000000-0 for documents and display. */
export function formatFiscalId(value: string | null | undefined): string {
  const digits = fiscalIdDigits(value ?? '');
  if (!digits) return '';
  if (digits.length === RNC_DIGIT_COUNT) {
    return `${digits[0]}-${digits.slice(1, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === CEDULA_DIGIT_COUNT) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
  }
  return digits;
}

/** CUST-002: the generic cash customer never qualifies as fiscal identity. */
export function satisfiesFiscalIdentity(customer: {
  isDefault: boolean;
  rnc: string | null;
}): boolean {
  return !customer.isDefault && customer.rnc !== null && isValidFiscalId(customer.rnc);
}
