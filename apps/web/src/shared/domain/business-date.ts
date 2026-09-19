/** Business calendar day for Solo Camiones (Dominican Republic). */
export const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';

const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day `YYYY-MM-DD` in the business timezone. */
export function businessDateString(value: Date): string {
  const parts = BUSINESS_DATE.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Normalizes a timestamp or date-only string to `YYYY-MM-DD` in the business timezone.
 * Date-only values (`YYYY-MM-DD`) pass through unchanged.
 */
export function businessDateFromTimestamp(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return businessDateString(new Date(value));
}
