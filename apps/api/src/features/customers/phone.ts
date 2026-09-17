const DOMINICAN_PHONE_DIGIT_COUNT = 10;

export function formatDominicanPhone(value: string | null | undefined): string {
  const rawValue = value ?? '';
  const digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';

  const localDigits =
    digits.length === DOMINICAN_PHONE_DIGIT_COUNT + 1 && digits.startsWith('1')
      ? digits.slice(1)
      : digits;

  // Historical snapshots can contain values outside the local 10-digit form;
  // displaying the original is safer than silently changing their identity.
  if (localDigits.length > DOMINICAN_PHONE_DIGIT_COUNT) return rawValue;
  if (localDigits.length <= 3) return localDigits;
  if (localDigits.length <= 6) return `${localDigits.slice(0, 3)}-${localDigits.slice(3)}`;
  return `${localDigits.slice(0, 3)}-${localDigits.slice(3, 6)}-${localDigits.slice(6)}`;
}
