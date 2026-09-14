const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';
const DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const INVOICE_DUE_DAYS = 30;

export function businessDateString(value: Date): string {
  const parts = DATE_PARTS.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function databaseDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function invoiceDueDate(confirmedAt: Date): Date {
  const date = databaseDate(businessDateString(confirmedAt));
  date.setUTCDate(date.getUTCDate() + INVOICE_DUE_DAYS);
  return date;
}

export function todayBusinessDate(now = new Date()): Date {
  return databaseDate(businessDateString(now));
}
