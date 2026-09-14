import { CEDULA_DIGIT_COUNT, RNC_DIGIT_COUNT } from './constants.js';

export function fiscalIdDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidFiscalId(digits: string): boolean {
  return digits.length === RNC_DIGIT_COUNT || digits.length === CEDULA_DIGIT_COUNT;
}

/** CUST-002: the generic cash customer never qualifies as fiscal identity. */
export function satisfiesFiscalIdentity(customer: {
  isDefault: boolean;
  rnc: string | null;
}): boolean {
  return !customer.isDefault && customer.rnc !== null && isValidFiscalId(customer.rnc);
}
