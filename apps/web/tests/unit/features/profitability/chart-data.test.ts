import { describe, expect, it } from 'vitest';

import { fillDailyRange, lastCalendarMonths, sumAmounts, toChartView } from '../../../../src/features/profitability/chart-data';

describe('profitability chart-data', () => {
  it('fills missing days in the selected range with zero', () => {
    const points = fillDailyRange(
      [{ key: '2026-09-02', label: '2 sept', amount: 100 }],
      { from: '2026-09-01', to: '2026-09-03' },
    );
    expect(points.map((point) => [point.key, point.amount])).toEqual([
      ['2026-09-01', 0],
      ['2026-09-02', 100],
      ['2026-09-03', 0],
    ]);
    expect(sumAmounts(points)).toBe(100);
  });

  it('pads the last 6 calendar months', () => {
    const months = lastCalendarMonths(
      [{ key: '2026-09', label: 'sept 2026', amount: 50 }],
      '2026-09',
      6,
    );
    expect(months).toHaveLength(6);
    expect(months[0]?.key).toBe('2026-04');
    expect(months.at(-1)?.key).toBe('2026-09');
    expect(months.at(-1)?.amount).toBe(50);
  });

  it('combines daily profit and collected for the selected window', () => {
    const view = toChartView(
      {
        fromDay: '2026-08-31',
        toDay: '2026-09-02',
        profitByDay: [
          { key: '2026-08-31', label: '31 ago', amount: 10 },
          { key: '2026-09-01', label: '1 sept', amount: 20 },
        ],
        profitByMonth: [{ key: '2026-08', label: 'ago 2026', amount: 10 }],
        collectedByDay: [
          { key: '2026-08-31', label: '31 ago', amount: 5 },
          { key: '2026-09-01', label: '1 sept', amount: 40 },
        ],
        collectedByMonth: [{ key: '2026-08', label: 'ago 2026', amount: 5 }],
      },
      { from: '2026-09-01', to: '2026-09-02' },
      '2026-09-02',
    );

    expect(view.periodProfit).toBe(20);
    expect(view.periodCollected).toBe(40);
    expect(view.daily).toEqual([
      { key: '2026-09-01', label: view.daily[0]?.label, profit: 20, collected: 40 },
      { key: '2026-09-02', label: view.daily[1]?.label, profit: 0, collected: 0 },
    ]);
    expect(view.profitByMonth).toHaveLength(6);
  });
});
