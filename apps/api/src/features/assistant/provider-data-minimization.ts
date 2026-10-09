const REDACTED_VALUE = '[REDACTED]';

// Domain labels exclude `.` so the engine cannot backtrack across overlapping
// `[A-Z0-9.-]+` / `\.[A-Z]{2,}` partitions (super-linear on long dotted strings).
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/giu;

const FREE_TEXT_LABEL = String.raw`\b(direcci[oó]n|domicilio|notas?|observaci[oó]n(?:es)?)`;
const LABELED_FREE_TEXT_PATTERNS = [
  new RegExp(String.raw`${FREE_TEXT_LABEL}\s*[=:]\s*([^\n;]+)`, 'giu'),
  new RegExp(String.raw`${FREE_TEXT_LABEL}\s+es\s+([^\n;]+)`, 'giu'),
  new RegExp(String.raw`${FREE_TEXT_LABEL}\s+([^\n:;=]+)`, 'giu'),
] as const;

const IDENTITY_OR_CONTACT_LABEL = String.raw`\b(rnc|c[eé]dula|tel[eé]fono|celular|correo(?:\s+electr[oó]nico)?|email)`;
const LABELED_IDENTITY_OR_CONTACT_PATTERNS = [
  new RegExp(String.raw`${IDENTITY_OR_CONTACT_LABEL}\s*[=:#]\s*([^\n;,]+)`, 'giu'),
  new RegExp(String.raw`${IDENTITY_OR_CONTACT_LABEL}\s+(?:n(?:ú|u)mero|no\.?)\s*([^\n;,]+)`, 'giu'),
  new RegExp(String.raw`${IDENTITY_OR_CONTACT_LABEL}\s+([^\n:;,=]+)`, 'giu'),
] as const;

const ADDRESS_PATTERN =
  /\b(calle|avenida|av\.?|carretera|autopista|sector|residencial|urbanizaci[oó]n)\s+[^\n;]+/giu;
const DOMINICAN_PHONE_PATTERN =
  /(?<![\p{L}\d])(?:\+?1[\s.-]?)?\(?8(?:09|29|49)\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\p{L}\d])/gu;
const IDENTITY_NUMBER_PATTERN = /(?<![\p{L}\d])(?:\d[\s-]?){8,10}\d(?![\p{L}\d])/gu;

function redactLabeledMatches(value: string, patterns: readonly RegExp[]): string {
  let result = value;
  for (const pattern of patterns) {
    result = result.replace(pattern, (_match, label: string) => `${label}: ${REDACTED_VALUE}`);
  }
  return result;
}

/**
 * Removes identity/contact values that AI-004 forbids from provider-bound text.
 * The original content remains in the owned audit history; only the external
 * retrieval/model projection is minimized.
 */
export function minimizeProviderText(value: string): string {
  const afterFreeText = redactLabeledMatches(
    value.replace(EMAIL_PATTERN, REDACTED_VALUE),
    LABELED_FREE_TEXT_PATTERNS,
  );
  const afterIdentity = redactLabeledMatches(afterFreeText, LABELED_IDENTITY_OR_CONTACT_PATTERNS);

  return afterIdentity
    .replace(ADDRESS_PATTERN, REDACTED_VALUE)
    .replace(DOMINICAN_PHONE_PATTERN, REDACTED_VALUE)
    .replace(IDENTITY_NUMBER_PATTERN, REDACTED_VALUE);
}
