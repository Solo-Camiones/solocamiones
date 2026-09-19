import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { toPublicInvoiceListItem } from '../../../src/features/sales/projection.js';
import type { InvoiceListRecord } from '../../../src/features/sales/types.js';

function listInvoice(
  overrides: Partial<InvoiceListRecord> & {
    payments?: InvoiceListRecord['payments'];
  } = {},
): InvoiceListRecord {
  const confirmedAt = new Date('2026-09-08T18:00:00.000Z');
  const { payments, ...rest } = overrides;
  return {
    id: 'inv-1',
    status: 'COMPLETED',
    number: 'FAC-000001',
    quoteNumber: null,
    quoteIssuedAt: null,
    quoteExpiresAt: null,
    currency: 'DOP',
    fiscal: false,
    applyItbis: false,
    discountPercent: new Prisma.Decimal('0'),
    customerId: 'cust-1',
    customerName: 'Cliente',
    customerRnc: null,
    customerPhone: null,
    snapshotCustomerType: 'CREDIT',
    snapshotCreditTermDays: 30,
    confirmedByUserId: 'user-1',
    confirmedByName: 'Seller',
    confirmedAt,
    dueDate: new Date('2026-10-08T00:00:00.000Z'),
    cancelledAt: null,
    cancelReason: null,
    cancelledByUserId: null,
    cancelledByName: null,
    cancellationIdempotencyKey: null,
    gross: new Prisma.Decimal('1000.00'),
    base: new Prisma.Decimal('1000.00'),
    itbis: new Prisma.Decimal('0.00'),
    exchangeRateDopPerUsd: null,
    fxRateSource: null,
    fxRateUpdatedAt: null,
    fxRateObtainedAt: null,
    manualGrossProfitDop: null,
    pdfTemplateVersion: null,
    pdfGeneratedAt: null,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
    customer: {
      id: 'cust-1',
      name: 'Cliente',
      rnc: null,
      phone: null,
      email: null,
      isDefault: false,
      customerType: 'CREDIT',
      creditLimitDop: new Prisma.Decimal('50000'),
      creditTermDays: 30,
      createdAt: confirmedAt,
      updatedAt: confirmedAt,
    },
    lines: [],
    payments: payments ?? [],
    ...rest,
  } as InvoiceListRecord;
}

describe('toPublicInvoiceListItem saleCondition', () => {
  it('marks full confirmation settlement as CASH', () => {
    const confirmedAt = new Date('2026-09-08T18:00:00.000Z');
    const item = toPublicInvoiceListItem(
      listInvoice({
        payments: [
          {
            id: 'pay-1',
            invoiceId: 'inv-1',
            kind: 'PAYMENT',
            amount: new Prisma.Decimal('1000.00'),
            method: 'CASH',
            currency: 'DOP',
            effectiveDate: confirmedAt,
            reference: null,
            idempotencyKey: 'confirm:inv-1',
            actorUserId: 'user-1',
            createdAt: confirmedAt,
          },
        ],
      }),
      { role: 'ADMINISTRATOR' },
    );
    expect(item.saleCondition).toBe('CASH');
  });

  it('marks unpaid or partial confirmation as CREDIT', () => {
    expect(toPublicInvoiceListItem(listInvoice(), { role: 'SELLER' }).saleCondition).toBe('CREDIT');

    const confirmedAt = new Date('2026-09-08T18:00:00.000Z');
    const partial = toPublicInvoiceListItem(
      listInvoice({
        payments: [
          {
            id: 'pay-1',
            invoiceId: 'inv-1',
            kind: 'PAYMENT',
            amount: new Prisma.Decimal('400.00'),
            method: 'TRANSFER',
            currency: 'DOP',
            effectiveDate: confirmedAt,
            reference: null,
            idempotencyKey: 'confirm:inv-1',
            actorUserId: 'user-1',
            createdAt: confirmedAt,
          },
        ],
      }),
      { role: 'SELLER' },
    );
    expect(partial.saleCondition).toBe('CREDIT');
  });

  it('omits saleCondition on drafts', () => {
    const item = toPublicInvoiceListItem(
      listInvoice({ status: 'DRAFT', confirmedAt: null, number: null, gross: null, base: null, itbis: null }),
      { role: 'ADMINISTRATOR' },
    );
    expect(item.saleCondition).toBeUndefined();
  });
});
