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

export function inclusiveDayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function previousRange(range: DateRange): DateRange {
  const days = Math.max(1, inclusiveDayCount(range.from, range.to));
  const to = shiftDay(range.from, -1);
  return { from: shiftDay(to, -(days - 1)), to };
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

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round((((current - previous) / Math.abs(previous)) * 100 + Number.EPSILON) * 10) / 10;
}

export function trendFromChange(change: number | null): { label: string; tone: 'up' | 'down' | 'neutral' } | undefined {
  if (change == null) {
    return undefined;
  }
  const sign = change > 0 ? '+' : '';
  return {
    label: `${sign}${change.toFixed(1)}% vs período anterior`,
    tone: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
  };
}
