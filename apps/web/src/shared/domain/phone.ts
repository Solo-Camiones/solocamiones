export const DOMINICAN_PHONE_DIGIT_COUNT = 10;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Dominican display: 809-555-0100 */
export function formatDominicanPhone(value: string | null | undefined): string {
  const rawValue = value ?? '';
  const digits = phoneDigits(rawValue);
  if (!digits) return '';

  const localDigits =
    digits.length === DOMINICAN_PHONE_DIGIT_COUNT + 1 && digits.startsWith('1')
      ? digits.slice(1)
      : digits;

  // Preserve unsupported values instead of silently discarding digits when a
  // previously stored phone does not match the Dominican local/prefixed form.
  if (localDigits.length > DOMINICAN_PHONE_DIGIT_COUNT) return rawValue;
  if (localDigits.length <= 3) return localDigits;
  if (localDigits.length <= 6) return `${localDigits.slice(0, 3)}-${localDigits.slice(3)}`;
  return `${localDigits.slice(0, 3)}-${localDigits.slice(3, 6)}-${localDigits.slice(6)}`;
}
