import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE } from '../../../src/features/sales/constants.js';
import { assertInitialPaymentPolicy } from '../../../src/features/sales/credit-confirmation.js';

const cashCustomer = {
  customerType: 'CASH' as const,
  isDefault: false,
  creditLimitDop: null,
  creditTermDays: null,
};

const genericCashCustomer = {
  ...cashCustomer,
  isDefault: true,
};

describe('cash confirmation payment policy', () => {
  const gross = new Prisma.Decimal('1000.00');

  it('rejects named CASH customers without a full initial payment', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: cashCustomer,
        currency: 'DOP',
        actorRole: 'ADMINISTRATOR',
        invoiceGross: gross,
        initialPaymentAmount: null,
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('rejects Cliente contado without a full initial payment', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: genericCashCustomer,
        currency: 'DOP',
        actorRole: 'SELLER',
        invoiceGross: gross,
        initialPaymentAmount: null,
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
    expect(() =>
      assertInitialPaymentPolicy({
        customer: genericCashCustomer,
        currency: 'DOP',
        actorRole: 'SELLER',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('250.00'),
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('allows Cliente contado when the initial payment equals the total', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: genericCashCustomer,
        currency: 'USD',
        actorRole: 'SELLER',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('1000.00'),
      }),
    ).not.toThrow();
  });
});
