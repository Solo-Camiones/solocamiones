const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';

type MoneyCurrency = 'DOP' | 'USD';

/** Real timestamps in the business timezone (issue, generated-at, etc.). */
export function formatBusinessDate(value: Date): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

/**
 * Date-only DB values (`@db.Date` / `databaseDate`) are UTC midnight of that calendar day.
 * Format in UTC so the stored calendar day does not shift in America/Santo_Domingo.
 */
export function formatCalendarDate(value: Date): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

export function formatBusinessDateTime(value: Date): string {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}

export function formatMoney(amount: string, currency: MoneyCurrency): string {
  const symbol = currency === 'DOP' ? 'RD$' : 'US$';
  return `${symbol}${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
