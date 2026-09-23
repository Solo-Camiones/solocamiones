import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE,
  CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE,
  CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE,
  CONDUCE_DUE_DATE_REQUIRED_MESSAGE,
  CONDUCE_RETRY_MISMATCH_MESSAGE,
  CREDIT_LIMIT_EXCEEDED_MESSAGE,
  SELLER_CREDIT_CONFIRM_PAYMENT_FORBIDDEN_MESSAGE,
  USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE,
} from '../../../src/features/sales/constants.js';
import {
  assertConduceInitialPaymentPolicy,
  assertConduceRetryMatches,
  assertCreditExposureWithinLimit,
  assertInitialPaymentPolicy,
  confirmationDueTermDays,
  confirmationInitialPaymentAmount,
  confirmationPaymentIdempotencyKey,
  invoiceNewBalance,
  resolveConduceDueDate,
  saleConditionFromInitialSettlement,
} from '../../../src/features/sales/credit-confirmation.js';

const cash = {
  customerType: 'CASH' as const,
  isDefault: false,
  creditLimitDop: null,
  creditTermDays: null,
};

const defaultCash = {
  customerType: 'CASH' as const,
  isDefault: true,
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

describe('conduce initial payment policy (CON-002)', () => {
  const gross = new Prisma.Decimal('5000.00');

  it('allows Administrator named CASH DOP/USD with zero, partial, or full payment', () => {
    for (const currency of ['DOP', 'USD'] as const) {
      for (const amount of [null, new Prisma.Decimal('2000.00'), new Prisma.Decimal('5000.00')]) {
        expect(() =>
          assertConduceInitialPaymentPolicy({
            customer: cash,
            currency,
            actorRole: 'ADMINISTRATOR',
            invoiceGross: gross,
            initialPaymentAmount: amount,
          }),
        ).not.toThrow();
      }
    }
  });

  it('still requires full payment for default Cliente contado on conduce', () => {
    expect(() =>
      assertConduceInitialPaymentPolicy({
        customer: defaultCash,
        currency: 'DOP',
        actorRole: 'ADMINISTRATOR',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('2000.00'),
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('still requires Seller named CASH to pay in full on conduce', () => {
    expect(() =>
      assertConduceInitialPaymentPolicy({
        customer: cash,
        currency: 'DOP',
        actorRole: 'SELLER',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('2000.00'),
      }),
    ).toThrow(CASH_CUSTOMER_CREDIT_FORBIDDEN_MESSAGE);
  });

  it('still requires Administrator CREDIT USD full payment on conduce', () => {
    expect(() =>
      assertConduceInitialPaymentPolicy({
        customer: credit,
        currency: 'USD',
        actorRole: 'ADMINISTRATOR',
        invoiceGross: gross,
        initialPaymentAmount: new Prisma.Decimal('2000.00'),
      }),
    ).toThrow(USD_INVOICE_MUST_BE_PAID_IN_FULL_MESSAGE);
  });
});

describe('resolveConduceDueDate (CON-002)', () => {
  const confirmedAt = new Date('2026-09-20T16:00:00.000Z'); // AST 12:00 → local day 2026-09-20

  it('requires actor dueDate for Admin named CASH with balance and accepts emission day', () => {
    expect(() =>
      resolveConduceDueDate({
        customer: cash,
        currency: 'DOP',
        actorRole: 'ADMINISTRATOR',
        confirmedAt,
        newBalance: new Prisma.Decimal('100.00'),
        actorDueDate: undefined,
      }),
    ).toThrow(CONDUCE_DUE_DATE_REQUIRED_MESSAGE);

    expect(
      resolveConduceDueDate({
        customer: cash,
        currency: 'USD',
        actorRole: 'ADMINISTRATOR',
        confirmedAt,
        newBalance: new Prisma.Decimal('100.00'),
        actorDueDate: '2026-09-20',
      }),
    ).toEqual(new Date('2026-09-20T00:00:00.000Z'));
  });

  it('rejects dueDate before local emission day', () => {
    expect(() =>
      resolveConduceDueDate({
        customer: cash,
        currency: 'DOP',
        actorRole: 'ADMINISTRATOR',
        confirmedAt,
        newBalance: new Prisma.Decimal('100.00'),
        actorDueDate: '2026-09-19',
      }),
    ).toThrow(CONDUCE_DUE_DATE_BEFORE_EMISSION_MESSAGE);
  });

  it('rejects actor dueDate when balance is settled or customer is CREDIT', () => {
    expect(() =>
      resolveConduceDueDate({
        customer: cash,
        currency: 'DOP',
        actorRole: 'ADMINISTRATOR',
        confirmedAt,
        newBalance: new Prisma.Decimal(0),
        actorDueDate: '2026-09-25',
      }),
    ).toThrow(CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE);

    expect(() =>
      resolveConduceDueDate({
        customer: credit,
        currency: 'DOP',
        actorRole: 'ADMINISTRATOR',
        confirmedAt,
        newBalance: new Prisma.Decimal('100.00'),
        actorDueDate: '2026-09-25',
      }),
    ).toThrow(CONDUCE_DUE_DATE_NOT_ALLOWED_MESSAGE);
  });

  it('derives CREDIT DOP dueDate from snapshotted term', () => {
    expect(
      resolveConduceDueDate({
        customer: credit,
        currency: 'DOP',
        actorRole: 'SELLER',
        confirmedAt,
        newBalance: new Prisma.Decimal('5000.00'),
        actorDueDate: undefined,
      }),
    ).toEqual(new Date('2026-11-04T00:00:00.000Z')); // 2026-09-20 + 45
  });
});

describe('assertConduceRetryMatches', () => {
  const invoiceId = 'inv-retry-1';
  const confirmKey = confirmationPaymentIdempotencyKey(invoiceId);

  function baseInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: invoiceId,
      quoteNumber: null as string | null,
      dueDate: new Date('2026-09-25T00:00:00.000Z'),
      gross: new Prisma.Decimal('1000.00'),
      snapshotCustomerType: 'CASH' as const,
      customer: { isDefault: false },
      payments: [
        {
          kind: 'PAYMENT',
          amount: new Prisma.Decimal('400.00'),
          method: 'CASH',
          reference: null,
          idempotencyKey: confirmKey,
        },
      ],
      ...overrides,
    };
  }

  it('allows identical payment and dueDate retries from the same origin', () => {
    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice(),
        sourceStatus: 'DRAFT',
        payment: { amount: '400.00', method: 'CASH' },
        dueDate: '2026-09-25',
      }),
    ).not.toThrow();
  });

  it('rejects different amount, method, or dueDate', () => {
    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice(),
        sourceStatus: 'DRAFT',
        payment: { amount: '500.00', method: 'CASH' },
        dueDate: '2026-09-25',
      }),
    ).toThrow(CONDUCE_RETRY_MISMATCH_MESSAGE);

    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice(),
        sourceStatus: 'DRAFT',
        payment: { amount: '400.00', method: 'TRANSFER' },
        dueDate: '2026-09-25',
      }),
    ).toThrow(CONDUCE_RETRY_MISMATCH_MESSAGE);

    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice(),
        sourceStatus: 'DRAFT',
        payment: { amount: '400.00', method: 'CASH' },
        dueDate: '2026-09-30',
      }),
    ).toThrow(CONDUCE_RETRY_MISMATCH_MESSAGE);
  });

  it('rejects omitting dueDate when named-CASH still has balance', () => {
    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice(),
        sourceStatus: 'DRAFT',
        payment: { amount: '400.00', method: 'CASH' },
      }),
    ).toThrow(CONDUCE_RETRY_MISMATCH_MESSAGE);
  });

  it('rejects wrong origen between draft and quote paths', () => {
    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice({ quoteNumber: 'COT-000001' }),
        sourceStatus: 'DRAFT',
        payment: { amount: '400.00', method: 'CASH' },
        dueDate: '2026-09-25',
      }),
    ).toThrow(CONDUCE_RETRY_MISMATCH_MESSAGE);

    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice(),
        sourceStatus: 'QUOTE_ISSUED',
        payment: { amount: '400.00', method: 'CASH' },
        dueDate: '2026-09-25',
      }),
    ).toThrow(CONDUCE_RETRY_MISMATCH_MESSAGE);
  });

  it('allows unpaid CREDIT retry without payment or dueDate payload', () => {
    expect(() =>
      assertConduceRetryMatches({
        invoice: baseInvoice({
          quoteNumber: null,
          snapshotCustomerType: 'CREDIT',
          gross: new Prisma.Decimal('118.00'),
          payments: [],
          dueDate: new Date('2026-11-19T00:00:00.000Z'),
        }),
        sourceStatus: 'DRAFT',
      }),
    ).not.toThrow();
  });
});
