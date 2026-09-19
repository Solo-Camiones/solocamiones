import { describe, expect, it } from 'vitest';

import { money, numericDate, shortDate } from '../../../../src/shared/ui/money';

describe('money', () => {
  it('formats DOP with two decimals by default', () => {
    expect(money(1250)).toContain('1,250.00');
    expect(money(1250)).toMatch(/RD\$|DOP/);
  });

  it('formats USD independently from DOP', () => {
    expect(money(19.5, 'USD')).toBe('$19.50');
  });
});

describe('shortDate', () => {
  it('formats date using business timezone (America/Santo_Domingo)', () => {
    // 2026-09-18T01:30:00.000Z is 2026-09-17 21:30 in UTC-4 (America/Santo_Domingo)
    const formattedNightUtc = shortDate('2026-09-18T01:30:00.000Z');
    expect(formattedNightUtc).toContain('17');
    expect(formattedNightUtc).toContain('2026');

    // 2026-09-18T16:00:00.000Z is 2026-09-18 12:00 in UTC-4
    const formattedDayUtc = shortDate('2026-09-18T16:00:00.000Z');
    expect(formattedDayUtc).toContain('18');
    expect(formattedDayUtc).toContain('2026');
  });
});

describe('numericDate', () => {
  it('formats a numeric calendar date in the business timezone', () => {
    // Same UTC instant as shortDate night case → calendar day 17 in Santo Domingo.
    expect(numericDate('2026-09-18T01:30:00.000Z')).toBe('17/09/2026');
    expect(numericDate('2026-09-18T16:00:00.000Z')).toBe('18/09/2026');
  });
});

