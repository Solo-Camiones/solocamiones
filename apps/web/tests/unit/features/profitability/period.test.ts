import { describe, expect, it } from 'vitest';

import {
  evolutionChartRange,
  percentChange,
  previousRange,
  resolvePeriodRange,
  trendFromChange,
} from '../../../../src/features/profitability/period';

describe('profitability period', () => {
  it('resolves rolling and calendar presets in Santo Domingo calendar dates', () => {
    expect(resolvePeriodRange({ preset: 'today', today: '2026-09-11' })).toEqual({
      from: '2026-09-11',
      to: '2026-09-11',
    });
    expect(resolvePeriodRange({ preset: 'last_7', today: '2026-09-11' })).toEqual({
      from: '2026-09-05',
      to: '2026-09-11',
    });
    expect(resolvePeriodRange({ preset: 'last_30', today: '2026-09-11' })).toEqual({
      from: '2026-08-13',
      to: '2026-09-11',
    });
    expect(resolvePeriodRange({ preset: 'this_month', today: '2026-09-11' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-11',
    });
    expect(resolvePeriodRange({ preset: 'previous_month', today: '2026-09-11' })).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('pads the evolution chart four days past today for presets that end today', () => {
    expect(
      evolutionChartRange({ from: '2026-09-11', to: '2026-09-11' }, 'today', '2026-09-11'),
    ).toEqual({ from: '2026-09-11', to: '2026-09-15' });
    expect(
      evolutionChartRange({ from: '2026-08-13', to: '2026-09-11' }, 'last_30', '2026-09-11'),
    ).toEqual({ from: '2026-08-13', to: '2026-09-15' });
    expect(
      evolutionChartRange({ from: '2026-09-01', to: '2026-09-11' }, 'this_month', '2026-09-11'),
    ).toEqual({ from: '2026-09-01', to: '2026-09-15' });
  });

  it('keeps a custom range and a closed previous month without forward padding', () => {
    expect(
      evolutionChartRange({ from: '2026-09-01', to: '2026-09-11' }, 'custom', '2026-09-11'),
    ).toEqual({ from: '2026-09-01', to: '2026-09-11' });
    expect(
      evolutionChartRange({ from: '2026-08-01', to: '2026-08-31' }, 'previous_month', '2026-09-11'),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('normalizes a custom range so from is never after to', () => {
    expect(
      resolvePeriodRange({
        preset: 'custom',
        today: '2026-09-11',
        customFrom: '2026-09-20',
        customTo: '2026-09-10',
      }),
    ).toEqual({ from: '2026-09-10', to: '2026-09-20' });
  });

  it('builds an equal-length previous window and percent change', () => {
    expect(previousRange({ from: '2026-09-11', to: '2026-09-11' })).toEqual({
      from: '2026-09-10',
      to: '2026-09-10',
    });
    expect(previousRange({ from: '2026-09-01', to: '2026-09-11' })).toEqual({
      from: '2026-08-21',
      to: '2026-08-31',
    });
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(50, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
    expect(trendFromChange(12.4)).toEqual({
      label: '+12.4% vs período anterior',
      tone: 'up',
    });
    expect(trendFromChange(-3)).toEqual({
      label: '-3.0% vs período anterior',
      tone: 'down',
    });
    expect(trendFromChange(null)).toBeUndefined();
  });
});
