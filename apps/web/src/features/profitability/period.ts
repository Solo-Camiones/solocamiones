export const PERIOD_PRESETS = [
  { id: 'today', label: 'Hoy' },
  { id: 'last_7', label: 'Últimos 7 días' },
  { id: 'last_30', label: '30 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'previous_month', label: 'Mes anterior' },
  { id: 'custom', label: 'Rango personalizado' },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['id'];

export type DateRange = {
  from: string;
  to: string;
};

export const DEFAULT_PERIOD_PRESET: PeriodPreset = 'today';

/** Extra empty days after today on the evolution chart so the current day is not glued to the right edge. */
export const EVOLUTION_CHART_FORWARD_DAYS = 4;

function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function shiftMonth(month: string, months: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const utc = new Date(Date.UTC(year, monthNumber - 1 + months, 1));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(month: string): string {
  const next = shiftMonth(month, 1);
  return shiftDay(`${next}-01`, -1);
}

export function resolvePeriodRange(input: {
  preset: PeriodPreset;
  today: string;
  customFrom?: string;
  customTo?: string;
}): DateRange {
  const month = input.today.slice(0, 7);

  if (input.preset === 'today') {
    return { from: input.today, to: input.today };
  }
  if (input.preset === 'last_7') {
    return { from: shiftDay(input.today, -6), to: input.today };
  }
  if (input.preset === 'last_30') {
    return { from: shiftDay(input.today, -29), to: input.today };
  }
  if (input.preset === 'this_month') {
    return { from: `${month}-01`, to: input.today };
  }
  if (input.preset === 'previous_month') {
    const previous = shiftMonth(month, -1);
    return { from: `${previous}-01`, to: lastDayOfMonth(previous) };
  }

  const first = input.customFrom || input.today;
  const second = input.customTo || input.today;
  return first <= second ? { from: first, to: second } : { from: second, to: first };
}

export function evolutionChartRange(range: DateRange, preset: PeriodPreset, today: string): DateRange {
  if (preset === 'custom' || range.to !== today) {
    return range;
  }
  return { from: range.from, to: shiftDay(range.to, EVOLUTION_CHART_FORWARD_DAYS) };
}

/**
 * Converts an ISO date string (YYYY-MM-DD) to a UTC-based Date for formatting,
 * avoiding timezone shifts that would display the wrong calendar day.
 */
function isoToUtcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const DATE_RANGE_FORMATTER = new Intl.DateTimeFormat('es-DO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_RANGE_FORMATTER_NO_YEAR = new Intl.DateTimeFormat('es-DO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * Formats a date range as a human-readable string in Spanish.
 * When from === to, returns a single date. When both dates share the same year,
 * the year is omitted from `from` to reduce visual noise.
 *
 * Examples:
 *   "1 sep — 18 sep 2026"  (same year, different days)
 *   "18 sep 2026"           (same day)
 *   "28 dic 2025 — 3 ene 2026" (different years)
 */
export function formatDateRange(from: string, to: string): string {
  const fromDate = isoToUtcDate(from);
  const toDate = isoToUtcDate(to);

  const toFormatted = DATE_RANGE_FORMATTER.format(toDate);

  if (from === to) {
    return toFormatted;
  }

  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const fromFormatted = sameYear
    ? DATE_RANGE_FORMATTER_NO_YEAR.format(fromDate)
    : DATE_RANGE_FORMATTER.format(fromDate);

  return `${fromFormatted} — ${toFormatted}`;
}
