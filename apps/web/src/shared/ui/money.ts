const DATE_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Santo_Domingo',
});

const DOP_FORMATTER = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
});

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export type MoneyCurrency = 'DOP' | 'USD';

/** Formats monetary values for display — business rounding lives in mock services. */
export function money(amount: number, currency: MoneyCurrency = 'DOP'): string {
  return currency === 'USD' ? USD_FORMATTER.format(amount) : DOP_FORMATTER.format(amount);
}

/** Human-readable currency name for selects and labels; ISO code stays in parentheses. */
export function currencyLabel(currency: MoneyCurrency): string {
  return currency === 'USD' ? 'Dólares (USD)' : 'Pesos (DOP)';
}

/**
 * Formats an ISO-8601 date string to a short human-readable date (e.g. "09 sep. 2026").
 * Formats in the business timezone (America/Santo_Domingo) so dates match local calendar days.
 */
export function shortDate(isoString: string): string {
  return DATE_FORMATTER.format(new Date(isoString));
}

const NUMERIC_DATE_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'America/Santo_Domingo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Numeric calendar date in the business timezone (e.g. "18/09/2026"). */
export function numericDate(iso: string): string {
  return NUMERIC_DATE_FORMATTER.format(new Date(iso));
}
