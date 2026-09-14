import { describe, expect, it } from 'vitest';

import {
  profitabilityInvoiceIdSchema,
  recordManualGrossProfitSchema,
} from '../../../src/features/profitability/validation.js';

describe('COST-005 manual gross profit validation', () => {
  it('accepts zero, negative, and two-decimal DOP strings', () => {
    expect(recordManualGrossProfitSchema.parse({ profitDop: '0.00' })).toEqual({
      profitDop: '0.00',
    });
    expect(recordManualGrossProfitSchema.parse({ profitDop: '-10.50' })).toEqual({
      profitDop: '-10.50',
    });
    expect(recordManualGrossProfitSchema.parse({ profitDop: '1250.5' })).toEqual({
      profitDop: '1250.5',
    });
  });

  it('rejects blank, non-numeric, float, extra fields, and invalid ids', () => {
    expect(recordManualGrossProfitSchema.safeParse({ profitDop: '' }).success).toBe(false);
    expect(recordManualGrossProfitSchema.safeParse({ profitDop: 'N/A' }).success).toBe(false);
    expect(recordManualGrossProfitSchema.safeParse({ profitDop: 20 }).success).toBe(false);
    expect(
      recordManualGrossProfitSchema.safeParse({ profitDop: '20.00', reason: 'x' }).success,
    ).toBe(false);
    expect(profitabilityInvoiceIdSchema.safeParse({ invoiceId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});
