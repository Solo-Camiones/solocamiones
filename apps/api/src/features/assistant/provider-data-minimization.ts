const REDACTED_VALUE = '[REDACTED]';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const LABELED_FREE_TEXT_PATTERN =
  /\b(direcci[oó]n|domicilio|nota(?:s)?|observaci[oó]n(?:es)?)\s*(?::|=|es)?\s*([^\n;]+)/giu;
const LABELED_IDENTITY_OR_CONTACT_PATTERN =
  /\b(rnc|c[eé]dula|tel[eé]fono|celular|correo(?:\s+electr[oó]nico)?|email)\s*(?::|=|#|n(?:ú|u)mero|no\.?)?\s*([^\n;,]+)/giu;
const ADDRESS_PATTERN =
  /\b(calle|avenida|av\.?|carretera|autopista|sector|residencial|urbanizaci[oó]n)\s+[^\n;]+/giu;
const DOMINICAN_PHONE_PATTERN =
  /(?<![\p{L}\d])(?:\+?1[\s.-]?)?\(?8(?:09|29|49)\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\p{L}\d])/gu;
const IDENTITY_NUMBER_PATTERN = /(?<![\p{L}\d])(?:\d[\s-]?){8,10}\d(?![\p{L}\d])/gu;

/**
 * Removes identity/contact values that AI-004 forbids from provider-bound text.
 * The original content remains in the owned audit history; only the external
 * retrieval/model projection is minimized.
 */
export function minimizeProviderText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED_VALUE)
    .replace(LABELED_FREE_TEXT_PATTERN, (_match, label: string) => `${label}: ${REDACTED_VALUE}`)
    .replace(
      LABELED_IDENTITY_OR_CONTACT_PATTERN,
      (_match, label: string) => `${label}: ${REDACTED_VALUE}`,
    )
    .replace(ADDRESS_PATTERN, REDACTED_VALUE)
    .replace(DOMINICAN_PHONE_PATTERN, REDACTED_VALUE)
    .replace(IDENTITY_NUMBER_PATTERN, REDACTED_VALUE);
}
