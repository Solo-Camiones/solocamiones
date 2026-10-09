import { describe, expect, it } from 'vitest';

import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatCalendarDate,
  formatMoney,
} from '../../../src/infrastructure/document-pdf/formatters.js';

describe('document PDF formatters', () => {
  it('formats real timestamps in the business timezone', () => {
    // 01:30Z → previous calendar day in America/Santo_Domingo.
    expect(formatBusinessDate(new Date('2026-09-18T01:30:00.000Z'))).toBe('17/09/2026');
    expect(formatBusinessDate(new Date('2026-09-18T16:00:00.000Z'))).toBe('18/09/2026');
  });

  it('formats @db.Date values in UTC so the stored day does not shift', () => {
    expect(formatCalendarDate(new Date('2026-09-18T00:00:00.000Z'))).toBe('18/09/2026');
  });

  it('includes time for generated-at style labels', () => {
    const label = formatBusinessDateTime(new Date('2026-09-18T16:30:00.000Z'));
    expect(label).toContain('18/09/2026');
    expect(label).toMatch(/\d/);
  });

  it('formats money with currency symbols and two decimals', () => {
    expect(formatMoney('1250.5', 'DOP')).toBe('RD$1,250.50');
    expect(formatMoney('19.5', 'USD')).toBe('US$19.50');
  });
});
