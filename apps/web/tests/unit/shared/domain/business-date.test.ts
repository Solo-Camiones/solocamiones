import { describe, expect, it } from 'vitest';

import {
  BUSINESS_TIME_ZONE,
  businessDateFromTimestamp,
  businessDateString,
} from '../../../../src/shared/domain/business-date';

describe('business-date', () => {
  it('uses America/Santo_Domingo as the business timezone', () => {
    expect(BUSINESS_TIME_ZONE).toBe('America/Santo_Domingo');
  });

  it('formats a Date as YYYY-MM-DD in the business timezone', () => {
    // 2026-09-18T01:30Z is still 2026-09-17 in UTC-4.
    expect(businessDateString(new Date('2026-09-18T01:30:00.000Z'))).toBe('2026-09-17');
    expect(businessDateString(new Date('2026-09-18T16:00:00.000Z'))).toBe('2026-09-18');
  });

  it('passes date-only strings through and normalizes timestamps', () => {
    expect(businessDateFromTimestamp('2026-09-18')).toBe('2026-09-18');
    expect(businessDateFromTimestamp('2026-09-18T01:30:00.000Z')).toBe('2026-09-17');
  });
});
