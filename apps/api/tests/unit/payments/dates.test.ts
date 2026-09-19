import { describe, expect, it } from 'vitest';

import {
  businessDateString,
  businessDayRange,
} from '../../../src/features/payments/dates.js';

describe('businessDateString', () => {
  it('uses America/Santo_Domingo calendar days', () => {
    expect(businessDateString(new Date('2026-09-18T01:30:00.000Z'))).toBe('2026-09-17');
    expect(businessDateString(new Date('2026-09-18T16:00:00.000Z'))).toBe('2026-09-18');
  });
});

describe('businessDayRange', () => {
  it('builds inclusive AST day bounds when both sides are present', () => {
    expect(businessDayRange('2026-09-01', '2026-09-18')).toEqual({
      gte: new Date('2026-09-01T00:00:00-04:00'),
      lte: new Date('2026-09-18T23:59:59.999-04:00'),
    });
  });

  it('supports open-ended list filters', () => {
    expect(businessDayRange('2026-09-01')).toEqual({
      gte: new Date('2026-09-01T00:00:00-04:00'),
    });
    expect(businessDayRange(undefined, '2026-09-18')).toEqual({
      lte: new Date('2026-09-18T23:59:59.999-04:00'),
    });
    expect(businessDayRange()).toEqual({});
  });
});
