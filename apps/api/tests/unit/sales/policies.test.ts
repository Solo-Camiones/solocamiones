import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE } from '../../../src/features/sales/constants.js';
import { assertCashCustomerPaidInFull } from '../../../src/features/sales/policies.js';

describe('assertCashCustomerPaidInFull', () => {
  const gross = new Prisma.Decimal('1000.00');

  it('allows named customers to confirm without payment', () => {
    expect(() =>
      assertCashCustomerPaidInFull({ isDefault: false }, gross, null),
    ).not.toThrow();
  });

  it('rejects Cliente contado without a full initial payment', () => {
    expect(() => assertCashCustomerPaidInFull({ isDefault: true }, gross, null)).toThrow(
      CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
    );
    expect(() =>
      assertCashCustomerPaidInFull({ isDefault: true }, gross, new Prisma.Decimal('250.00')),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('allows Cliente contado when the initial payment equals the total', () => {
    expect(() =>
      assertCashCustomerPaidInFull({ isDefault: true }, gross, new Prisma.Decimal('1000.00')),
    ).not.toThrow();
  });
});
