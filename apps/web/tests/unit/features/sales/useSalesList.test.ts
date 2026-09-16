import { describe, expect, it } from 'vitest';

import type { PaymentState } from '../../../../src/api/contracts/entities';
import type { SalesListRow } from '../../../../src/api/contracts/sales';
import { applySalesUrlFilters } from '../../../../src/features/sales/useSalesList';

const PAYMENTS_FILTER = { today: false, outstanding: false, payments: true };

function row(paymentState?: PaymentState): SalesListRow {
  return {
    id: paymentState ?? 'missing',
    number: 'INV-1',
    status: 'COMPLETED',
    customerId: 'C-1',
    customerName: 'Cliente',
    currency: 'DOP',
    fiscal: false,
    total: 100,
    createdAt: '2026-08-25T12:00:00.000Z',
    href: '/sales/INV-1',
    ...(paymentState ? { paymentState } : {}),
  };
}

function keptIds(rows: SalesListRow[]): string[] {
  return applySalesUrlFilters(rows, PAYMENTS_FILTER).map((item) => item.id);
}

describe('applySalesUrlFilters payments', () => {
  it('keeps paid and partial states, including late and overdue variants', () => {
    const rows = [
      row('PAID'),
      row('PAID_LATE'),
      row('PARTIALLY_PAID'),
      row('PARTIALLY_PAID_OVERDUE'),
    ];

    expect(keptIds(rows)).toEqual([
      'PAID',
      'PAID_LATE',
      'PARTIALLY_PAID',
      'PARTIALLY_PAID_OVERDUE',
    ]);
  });

  it('excludes unpaid, overdue, cancelled, and missing paymentState', () => {
    const rows = [row('PENDING'), row('OVERDUE'), row('CANCELLED'), row()];

    expect(keptIds(rows)).toEqual([]);
  });
});
