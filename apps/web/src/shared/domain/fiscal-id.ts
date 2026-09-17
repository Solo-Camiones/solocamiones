export const RNC_DIGIT_COUNT = 9;
export const CEDULA_DIGIT_COUNT = 11;

export type FiscalIdKind = 'RNC' | 'CEDULA';

export function fiscalIdDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function inferFiscalIdKind(value: string | null | undefined): FiscalIdKind | '' {
  const digits = fiscalIdDigits(value ?? '');
  if (digits.length === RNC_DIGIT_COUNT) return 'RNC';
  if (digits.length === CEDULA_DIGIT_COUNT) return 'CEDULA';
  return '';
}

/** Dominican RNC display: 1-31-12345-6 */
export function formatRnc(digits: string): string {
  const value = digits.slice(0, RNC_DIGIT_COUNT);
  if (value.length <= 1) return value;
  if (value.length <= 3) return `${value[0]}-${value.slice(1)}`;
  if (value.length <= 8) return `${value[0]}-${value.slice(1, 3)}-${value.slice(3)}`;
  return `${value[0]}-${value.slice(1, 3)}-${value.slice(3, 8)}-${value.slice(8)}`;
}

/** Dominican cédula display: 000-0000000-0 */
export function formatCedula(digits: string): string {
  const value = digits.slice(0, CEDULA_DIGIT_COUNT);
  if (value.length <= 3) return value;
  if (value.length <= 10) return `${value.slice(0, 3)}-${value.slice(3)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 10)}-${value.slice(10)}`;
}

export function maskFiscalIdInput(kind: FiscalIdKind, raw: string): string {
  const digits = fiscalIdDigits(raw);
  return kind === 'RNC' ? formatRnc(digits) : formatCedula(digits);
}

/** Formats a stored 9-digit RNC or 11-digit cédula for UI and documents. */
export function formatFiscalId(value: string | null | undefined): string {
  const digits = fiscalIdDigits(value ?? '');
  if (!digits) return '';
  if (digits.length === RNC_DIGIT_COUNT) return formatRnc(digits);
  if (digits.length === CEDULA_DIGIT_COUNT) return formatCedula(digits);
  return digits;
}
