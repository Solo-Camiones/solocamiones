import type { ProfitabilityChartPoint, ProfitabilityCharts } from '../../api/contracts/profitability';
import { roundMoney } from '../../api/client/profitability-series';
import type { DateRange } from './period';

const DAY_LABEL = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

const MONTH_LABEL = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});

export const MONTHLY_CHART_MONTHS = 6;
export const EVOLUTION_CHART_HEIGHT_PX = 300;
export const MONTHLY_CHART_HEIGHT_PX = 280;

export type CombinedDayPoint = {
  key: string;
  label: string;
  profit: number;
  collected: number;
};

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber === 12) return `${year + 1}-01`;
  return `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber === 1) return `${year - 1}-12`;
  return `${year}-${String(monthNumber - 1).padStart(2, '0')}`;
}

function enumerateKeys(from: string, to: string, step: (key: string) => string): string[] {
  if (from > to) return [to];
  const keys = [from];
  let current = from;
  while (current < to) {
    current = step(current);
    keys.push(current);
  }
  return keys;
}

function amountMap(points: ProfitabilityChartPoint[]): Map<string, number> {
  return new Map(points.map((point) => [point.key, point.amount]));
}

function utcNoon(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12));
}

function utcMonth(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
}

export function fillDailyRange(
  points: ProfitabilityChartPoint[],
  range: DateRange,
): ProfitabilityChartPoint[] {
  const amounts = amountMap(points);
  return enumerateKeys(range.from, range.to, nextDay).map((key) => ({
    key,
    label: DAY_LABEL.format(utcNoon(key)),
    amount: amounts.get(key) ?? 0,
  }));
}

export function lastCalendarMonths(
  points: ProfitabilityChartPoint[],
  endMonth: string,
  count = MONTHLY_CHART_MONTHS,
): ProfitabilityChartPoint[] {
  let start = endMonth;
  for (let index = 1; index < count; index += 1) {
    start = previousMonth(start);
  }
  const amounts = amountMap(points);
  return enumerateKeys(start, endMonth, nextMonth).map((key) => ({
    key,
    label: MONTH_LABEL.format(utcMonth(key)),
    amount: amounts.get(key) ?? 0,
  }));
}

export function sumAmounts(points: ProfitabilityChartPoint[]): number {
  return roundMoney(points.reduce((sum, point) => sum + point.amount, 0));
}

export function combineDailySeries(
  profit: ProfitabilityChartPoint[],
  collected: ProfitabilityChartPoint[],
): CombinedDayPoint[] {
  return profit.map((point, index) => ({
    key: point.key,
    label: point.label,
    profit: point.amount,
    collected: collected[index]?.amount ?? 0,
  }));
}

export function toChartView(
  charts: ProfitabilityCharts | null,
  range: DateRange,
  today: string,
): {
  daily: CombinedDayPoint[];
  profitByMonth: ProfitabilityChartPoint[];
  collectedByMonth: ProfitabilityChartPoint[];
  periodProfit: number;
  periodCollected: number;
} {
  const emptyMonths = lastCalendarMonths([], today.slice(0, 7));
  if (!charts) {
    const daily = combineDailySeries(fillDailyRange([], range), fillDailyRange([], range));
    return {
      daily,
      profitByMonth: emptyMonths,
      collectedByMonth: emptyMonths,
      periodProfit: 0,
      periodCollected: 0,
    };
  }

  const profitDays = fillDailyRange(charts.profitByDay, range);
  const collectedDays = fillDailyRange(charts.collectedByDay, range);
  const endMonth = today.slice(0, 7);

  return {
    daily: combineDailySeries(profitDays, collectedDays),
    profitByMonth: lastCalendarMonths(charts.profitByMonth, endMonth),
    collectedByMonth: lastCalendarMonths(charts.collectedByMonth, endMonth),
    periodProfit: sumAmounts(profitDays),
    periodCollected: sumAmounts(collectedDays),
  };
}
