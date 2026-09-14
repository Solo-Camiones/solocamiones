/** Pair Conversion already returns DOP per 1 USD. Do not invert this rate. */
export const EXCHANGE_RATE_API_BASE_URL = 'https://v6.exchangerate-api.com/v6';

export const EXCHANGE_RATE_API_PAIR_PATH = 'pair/USD/DOP';

/**
 * Historical rates use the UTC calendar day of confirmation.
 * ExchangeRate-API documents month/day without leading zeros.
 */
export function exchangeRateApiHistoryPath(asOf: Date): string {
  return `history/USD/${asOf.getUTCFullYear()}/${asOf.getUTCMonth() + 1}/${asOf.getUTCDate()}`;
}

/** Pair is the published rate for the current UTC day; History is only for past UTC days. */
export function isSameUtcCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

export const EXCHANGE_RATE_API_KEY_ENV = 'EXCHANGE_RATE_API_KEY';

/** Bounded so a hung provider cannot stall confirmation indefinitely. */
export const EXCHANGE_RATE_API_TIMEOUT_MS = 3_000;

export const EXCHANGE_RATE_API_SOURCE = 'ExchangeRate-API';
