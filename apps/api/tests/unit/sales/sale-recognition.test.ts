import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PAYMENT_EXCEEDS_BALANCE_MESSAGE } from '../../../src/features/sales/constants.js';
import {
  parseInitialPaymentAmount,
  recognitionCustomerSnapshot,
  recognitionPersistedLineMoney,
  resolveSaleLineMoneyAndTotals,
} from '../../../src/features/sales/sale-recognition.js';

describe('sale recognition helpers', () => {
  it('recalculates draft line money and applies discount', () => {
    const { lineMoney, totals } = resolveSaleLineMoneyAndTotals({
      lines: [
        {
          id: 'line-1',
          type: 'GENERIC',
          unitPrice: new Prisma.Decimal('100.00'),
          quantity: new Prisma.Decimal('2'),
          gross: null,
          base: null,
          itbis: null,
        } as never,
      ],
      applyItbis: false,
      discountPercent: new Prisma.Decimal('0'),
      preferFrozenLineMoney: false,
    });

    expect(lineMoney).toHaveLength(1);
    expect(totals.gross.toFixed(2)).toBe('200.00');
  });

  it('keeps frozen quote line money when preferFrozenLineMoney is true', () => {
    const { totals } = resolveSaleLineMoneyAndTotals({
      lines: [
        {
          id: 'line-1',
          type: 'GENERIC',
          unitPrice: new Prisma.Decimal('999.00'),
          quantity: new Prisma.Decimal('1'),
          gross: new Prisma.Decimal('50.00'),
          base: new Prisma.Decimal('50.00'),
          itbis: new Prisma.Decimal('0.00'),
        } as never,
      ],
      applyItbis: false,
      discountPercent: new Prisma.Decimal('0'),
      preferFrozenLineMoney: true,
    });

    expect(totals.gross.toFixed(2)).toBe('50.00');
  });

  it('rejects an initial payment above invoice gross', () => {
    expect(() =>
      parseInitialPaymentAmount(
        { amount: '100.01', method: 'CASH' },
        new Prisma.Decimal('100.00'),
      ),
    ).toThrow(PAYMENT_EXCEEDS_BALANCE_MESSAGE);
  });

  it('snapshots live customer data for draft recognition', () => {
    expect(
      recognitionCustomerSnapshot({
        sourceStatus: 'DRAFT',
        invoice: { customerName: 'Frozen', customerRnc: '1', customerPhone: '809' },
        customer: {
          name: 'Live',
          rnc: '2',
          contacts: [{ isPrimary: true, phone: '829' }],
        },
      }),
    ).toEqual({ customerName: 'Live', customerRnc: '2', customerPhone: '829' });
  });

  it('maps line money for persistence', () => {
    expect(
      recognitionPersistedLineMoney([
        {
          line: { id: 'line-1' } as never,
          money: {
            gross: new Prisma.Decimal('10.00'),
            base: new Prisma.Decimal('10.00'),
            itbis: new Prisma.Decimal('0.00'),
          },
        },
      ]),
    ).toEqual([
      {
        id: 'line-1',
        gross: new Prisma.Decimal('10.00'),
        base: new Prisma.Decimal('10.00'),
        itbis: new Prisma.Decimal('0.00'),
      },
    ]);
  });
});
