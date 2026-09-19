const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';
/** Fixed AST offset for America/Santo_Domingo (no DST). */
const BUSINESS_UTC_OFFSET = '-04:00';
const DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function businessDateString(value: Date): string {
  const parts = DATE_PARTS.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Inclusive calendar-day bounds for Prisma date filters in the business timezone.
 * Both ends are required for full-range reports; list filters may pass only one side.
 */
export function businessDayRange(
  dateFrom: string,
  dateTo: string,
): { gte: Date; lte: Date };
export function businessDayRange(
  dateFrom?: string,
  dateTo?: string,
): { gte?: Date; lte?: Date };
export function businessDayRange(
  dateFrom?: string,
  dateTo?: string,
): { gte?: Date; lte?: Date } {
  return {
    ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00${BUSINESS_UTC_OFFSET}`) } : {}),
    ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999${BUSINESS_UTC_OFFSET}`) } : {}),
  };
}

export function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function databaseDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function invoiceDueDate(confirmedAt: Date, termDays: number): Date {
  const date = databaseDate(businessDateString(confirmedAt));
  date.setUTCDate(date.getUTCDate() + termDays);
  return date;
}

export function todayBusinessDate(now = new Date()): Date {
  return databaseDate(businessDateString(now));
}
