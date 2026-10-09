import { businessDateString } from '../payments/dates.js';

const QUOTE_VALIDITY_DAYS = 15;
const SANTO_DOMINGO_UTC_OFFSET = '-04:00';

/** End of calendar day 15 in the business timezone (America/Santo_Domingo). */
export function quoteExpirationDate(issuedAt: Date): Date {
  const [year, month, day] = businessDateString(issuedAt).split('-').map(Number);
  const expiryDay = new Date(Date.UTC(year!, month! - 1, day! + QUOTE_VALIDITY_DAYS));
  const localDate = expiryDay.toISOString().slice(0, 10);
  return new Date(`${localDate}T23:59:59.999${SANTO_DOMINGO_UTC_OFFSET}`);
}

export function isQuoteExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt != null && now.getTime() > expiresAt.getTime();
}
