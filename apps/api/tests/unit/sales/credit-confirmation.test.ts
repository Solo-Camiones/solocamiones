import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  CREDIT_LIMIT_EXCEEDED_MESSAGE,
  SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE,
  USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE,
} from '../../../src/features/sales/constants.js';
import {
  assertCreditExposureWithinLimit,
  assertInitialPaymentPolicy,
  confirmationDueTermDays,
  confirmationInitialPaymentAmount,
  invoiceNewBalance,
  saleConditionFromInitialSettlement,
} from '../../../src/features/sales/credit-confirmation.js';

const cash = {
  customerType: 'CASH' as const,
  isDefault: false,
  creditLimitDop: null,
  creditTermDays: null,
};

const credit = {
  customerType: 'CREDIT' as const,
  isDefault: false,
  creditLimitDop: new Prisma.Decimal('10000.00'),
  creditTermDays: 45,
};

describe('credit confirmation policy', () => {
  const gross = new Prisma.Decimal('5000.00');

  it('requires named CASH customers to pay in full in any currency', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: cash,
        currency: 'USD',
        actorRole: 'ADMINISTRATOR',
        invoiceGross: gross,
        initialPaymentAmount: null,
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('forbids a Seller from sending an initial payment on CREDIT DOP', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: credit,
        currency: 'DOP',
        actorRole: 'SELLER',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('2000.00'),
      }),
    ).toThrow(SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE);
  });

  it('allows a Seller to confirm CREDIT DOP without payment', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: credit,
        currency: 'DOP',
        actorRole: 'SELLER',
        invoiceGross: gross,
        initialPaymentAmount: null,
      }),
    ).not.toThrow();
  });

  it('allows an Administrator to omit, partially pay, or fully pay CREDIT DOP', () => {
    for (const amount of [null, new Prisma.Decimal('2000.00'), new Prisma.Decimal('5000.00')]) {
      expect(() =>
        assertInitialPaymentPolicy({
          customer: credit,
          currency: 'DOP',
          actorRole: 'ADMINISTRATOR',
          invoiceGross: gross,
          initialPaymentAmount: amount,
        }),
      ).not.toThrow();
    }
  });

  it('requires CREDIT USD invoices to be paid in full', () => {
    expect(() =>
      assertInitialPaymentPolicy({
        customer: credit,
        currency: 'USD',
        actorRole: 'ADMINISTRATOR',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('2000.00'),
      }),
    ).toThrow(USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE);
    expect(() =>
      assertInitialPaymentPolicy({
        customer: credit,
        currency: 'USD',
        actorRole: 'ADMINISTRATOR',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('5000.00'),
      }),
    ).not.toThrow();
  });

  it('computes due term days from the customer only for CREDIT DOP', () => {
    expect(confirmationDueTermDays(cash, 'DOP')).toBe(0);
    expect(confirmationDueTermDays(credit, 'USD')).toBe(0);
    expect(confirmationDueTermDays(credit, 'DOP')).toBe(45);
  });

  it('rejects CREDIT DOP exposure that would exceed the limit even for an Administrator', () => {
    expect(() =>
      assertCreditExposureWithinLimit({
        customer: credit,
        currency: 'DOP',
        openExposure: new Prisma.Decimal('6000.00'),
        newBalance: new Prisma.Decimal('5000.00'),
      }),
    ).toThrow(CREDIT_LIMIT_EXCEEDED_MESSAGE);
  });

  it('allows a fully paid CREDIT DOP confirmation even with existing exposure', () => {
    expect(() =>
      assertCreditExposureWithinLimit({
        customer: credit,
        currency: 'DOP',
        openExposure: new Prisma.Decimal('10000.00'),
        newBalance: invoiceNewBalance(gross, new Prisma.Decimal('5000.00')),
      }),
    ).not.toThrow();
  });

  it('labels Al contado only when confirmation payment equals the gross', () => {
    expect(saleConditionFromInitialSettlement(gross, new Prisma.Decimal('5000.00'))).toBe('CASH');
    expect(saleConditionFromInitialSettlement(gross, new Prisma.Decimal('2000.00'))).toBe('CREDIT');
    expect(saleConditionFromInitialSettlement(gross, null)).toBe('CREDIT');
  });

  it('reconstructs confirmation payment only via confirm:{id}, never nearby CxC', () => {
    expect(
      confirmationInitialPaymentAmount({
        id: 'inv-1',
        payments: [
          {
            kind: 'PAYMENT',
            amount: new Prisma.Decimal('2000.00'),
            idempotencyKey: 'confirm:inv-1',
          },
          {
            kind: 'PAYMENT',
            amount: new Prisma.Decimal('3000.00'),
            idempotencyKey: 'later',
          },
        ],
      })?.toFixed(2),
    ).toBe('2000.00');
    // Custom keys and timestamp-adjacent CxC must not invent a confirmation payment.
    expect(
      confirmationInitialPaymentAmount({
        id: 'inv-2',
        payments: [
          {
            kind: 'PAYMENT',
            amount: new Prisma.Decimal('5000.00'),
            idempotencyKey: 'custom-confirm-key',
          },
        ],
      }),
    ).toBeNull();
    expect(
      confirmationInitialPaymentAmount({
        id: 'inv-3',
        payments: [
          {
            kind: 'PAYMENT',
            amount: new Prisma.Decimal('5000.00'),
            idempotencyKey: 'cxc-immediate',
          },
        ],
      }),
    ).toBeNull();
    expect(
      confirmationInitialPaymentAmount({
        id: 'inv-4',
        payments: [],
      }),
    ).toBeNull();
  });
});
