import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { toInvoicePdfFacts, toQuotePdfFacts } from '../../../src/features/invoice-documents/projection.js';
import type { InvoiceRecord } from '../../../src/features/sales/types.js';

function invoice(overrides: Record<string, unknown> = {}): InvoiceRecord {
  return {
    id: 'inv-1',
    status: 'COMPLETED',
    number: 'FAC-000001',
    quoteNumber: null,
    currency: 'DOP',
    fiscal: false,
    customerName: 'Cliente contado',
    customerRnc: '00100000001',
    customerPhone: '809-555-0000',
    confirmedByName: 'María Pérez',
    confirmedAt: new Date('2026-09-08T18:00:00.000Z'),
    dueDate: new Date('2026-10-08T00:00:00.000Z'),
    cancelledAt: null,
    cancelReason: null,
    cancelledByName: null,
    gross: new Prisma.Decimal('118.00'),
    base: new Prisma.Decimal('118.00'),
    itbis: new Prisma.Decimal('0.00'),
    pdfTemplateVersion: 'internal-v4',
    payments: [
      {
        id: 'pay-1',
        amount: new Prisma.Decimal('40.00'),
        kind: 'PAYMENT',
      },
    ],
    lines: [
      {
        description: 'Filtro',
        notes: 'Instalado',
        quantity: new Prisma.Decimal('1.00'),
        unitPrice: new Prisma.Decimal('118.00'),
        gross: new Prisma.Decimal('118.00'),
        base: new Prisma.Decimal('118.00'),
        itbis: new Prisma.Decimal('0.00'),
      },
    ],
    ...overrides,
  } as unknown as InvoiceRecord;
}

describe('toInvoicePdfFacts', () => {
  it('projects stored commercial facts and origin quote without payment ledger fields', () => {
    const facts = toInvoicePdfFacts(
      invoice({ quoteNumber: 'COT-000012', customerPhone: null, confirmedByName: null }),
    );

    expect(facts).toMatchObject({
      status: 'COMPLETED',
      number: 'FAC-000001',
      originQuoteNumber: 'COT-000012',
      currency: 'DOP',
      customerName: 'Cliente contado',
      customerRnc: '001-0000000-1',
      customerPhone: null,
      sellerName: null,
      totals: { gross: '118.00', base: '118.00', itbis: '0.00' },
      lines: [
        {
          description: 'Filtro',
          notes: 'Instalado',
          quantity: '1.00',
          unitPrice: '118.00',
          base: '118.00',
          gross: '118.00',
          itbis: '0.00',
        },
      ],
    });
    expect(facts).not.toHaveProperty('paymentState');
    expect(facts).not.toHaveProperty('balance');
    expect(facts).not.toHaveProperty('generatedAt');
    expect(facts?.templateVersion).toBe('internal-v4');
  });

  it('renders retired stored template labels with the current invoice writer', () => {
    const facts = toInvoicePdfFacts(invoice({ pdfTemplateVersion: 'internal-v3' }));
    expect(facts?.templateVersion).toBe('internal-v4');
  });

  it('keeps stored totals instead of deriving them from payments', () => {
    const facts = toInvoicePdfFacts(
      invoice({
        gross: new Prisma.Decimal('236.00'),
        base: new Prisma.Decimal('200.00'),
        itbis: new Prisma.Decimal('36.00'),
        payments: [{ id: 'pay-1', amount: new Prisma.Decimal('236.00'), kind: 'PAYMENT' }],
        lines: [
          {
            description: 'Filtro',
            notes: null,
            quantity: new Prisma.Decimal('2.00'),
            unitPrice: new Prisma.Decimal('118.00'),
            gross: new Prisma.Decimal('236.00'),
            base: new Prisma.Decimal('200.00'),
            itbis: new Prisma.Decimal('36.00'),
          },
        ],
      }),
    );

    expect(facts?.totals).toEqual({ gross: '236.00', base: '200.00', itbis: '36.00' });
  });

  it('formats a Dominican phone with country prefix without truncating it', () => {
    const facts = toInvoicePdfFacts(invoice({ customerPhone: '+1 809-555-0100' }));

    expect(facts?.customerPhone).toBe('809-555-0100');
  });

  it('returns null when a completed invoice is missing persisted line money', () => {
    expect(
      toInvoicePdfFacts(
        invoice({
          lines: [
            {
              description: 'Filtro',
              notes: null,
              quantity: new Prisma.Decimal('1.00'),
              unitPrice: new Prisma.Decimal('118.00'),
              gross: null,
              base: null,
              itbis: null,
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('does not project quotes or drafts', () => {
    expect(toInvoicePdfFacts(invoice({ status: 'QUOTE_ISSUED' }))).toBeNull();
    expect(toInvoicePdfFacts(invoice({ status: 'DRAFT' }))).toBeNull();
  });
});

function issuedQuote(overrides: Record<string, unknown> = {}): InvoiceRecord {
  return invoice({
    status: 'QUOTE_ISSUED',
    number: null,
    quoteNumber: 'COT-000012',
    quoteIssuedAt: new Date('2026-09-15T18:00:00.000Z'),
    quoteExpiresAt: new Date('2026-10-15T04:00:00.000Z'),
    confirmedAt: null,
    dueDate: null,
    confirmedByName: null,
    customer: { id: 'cust-live', name: 'Cliente actualizado' },
    ...overrides,
  });
}

describe('toQuotePdfFacts', () => {
  it('projects issued quote snapshots without payment ledger fields', () => {
    const facts = toQuotePdfFacts(issuedQuote());

    expect(facts).toEqual({
      status: 'QUOTE_ISSUED',
      quoteNumber: 'COT-000012',
      currency: 'DOP',
      customerName: 'Cliente contado',
      customerRnc: '001-0000000-1',
      customerPhone: '809-555-0000',
      sellerName: null,
      quoteIssuedAt: new Date('2026-09-15T18:00:00.000Z'),
      quoteExpiresAt: new Date('2026-10-15T04:00:00.000Z'),
      lines: [
        {
          description: 'Filtro',
          notes: 'Instalado',
          quantity: '1.00',
          unitPrice: '118.00',
          base: '118.00',
          gross: '118.00',
          itbis: '0.00',
        },
      ],
      totals: { gross: '118.00', base: '118.00', itbis: '0.00' },
    });
    expect(facts).not.toHaveProperty('paymentState');
    expect(facts).not.toHaveProperty('balance');
    expect(facts).not.toHaveProperty('payments');
  });

  it('keeps frozen totals instead of live customer data or payments', () => {
    const facts = toQuotePdfFacts(
      issuedQuote({
        customerName: 'Snapshot emitido',
        customer: { id: 'cust-live', name: 'Nombre vivo del cliente' },
        payments: [{ id: 'pay-1', amount: new Prisma.Decimal('40.00'), kind: 'PAYMENT' }],
      }),
    );

    expect(facts?.customerName).toBe('Snapshot emitido');
    expect(facts?.totals).toEqual({ gross: '118.00', base: '118.00', itbis: '0.00' });
  });

  it('returns null when issued facts are incomplete', () => {
    expect(toQuotePdfFacts(issuedQuote({ quoteNumber: null }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ quoteIssuedAt: null }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ quoteExpiresAt: null }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ customerName: null }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ gross: null, base: null, itbis: null }))).toBeNull();
    expect(
      toQuotePdfFacts(
        issuedQuote({
          lines: [
            {
              description: 'Filtro',
              notes: null,
              quantity: new Prisma.Decimal('1.00'),
              unitPrice: new Prisma.Decimal('118.00'),
              gross: null,
              base: null,
              itbis: null,
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('rejects any status other than QUOTE_ISSUED', () => {
    expect(toQuotePdfFacts(issuedQuote({ status: 'QUOTE_DRAFT' }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ status: 'DRAFT' }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ status: 'COMPLETED' }))).toBeNull();
    expect(toQuotePdfFacts(issuedQuote({ status: 'CANCELLED' }))).toBeNull();
  });
});
