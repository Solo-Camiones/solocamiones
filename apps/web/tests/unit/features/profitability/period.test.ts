import { describe, expect, it } from 'vitest';

import {
  evolutionChartRange,
  formatDateRange,
  resolvePeriodRange,
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

  it('formats a single day without a range separator', () => {
    expect(formatDateRange('2026-09-18', '2026-09-18')).toBe('18 sept de 2026');
  });

  it('omits the year from the start date when both ends share the year', () => {
    expect(formatDateRange('2026-09-01', '2026-09-18')).toBe('1 sept — 18 sept de 2026');
  });

  it('keeps both years when the range crosses a year boundary', () => {
    expect(formatDateRange('2025-12-28', '2026-01-03')).toBe('28 dic de 2025 — 3 ene de 2026');
  });
});
