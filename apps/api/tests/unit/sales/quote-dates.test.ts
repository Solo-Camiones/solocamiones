import { describe, expect, it } from 'vitest';

import { isQuoteExpired, quoteExpirationDate } from '../../../src/features/sales/quote-dates.js';

describe('quote validity dates (QUOTE-002)', () => {
  it('expires at the end of calendar day 15 in Santo Domingo', () => {
    const issuedAt = new Date('2026-09-15T14:30:00.000Z');
    const expiresAt = quoteExpirationDate(issuedAt);
    expect(expiresAt.toISOString()).toBe('2026-10-01T03:59:59.999Z');
    expect(isQuoteExpired(expiresAt, expiresAt)).toBe(false);
    expect(isQuoteExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });
});
