import { describe, expect, it } from 'vitest';

import { toInvoiceHistoryEntries } from '../../../src/features/history/invoice-timeline.js';

const occurredAt = new Date('2026-09-10T12:00:00.000Z');

function row(
  eventType: string,
  payload: unknown,
  actorName: string | null = 'Ana Pérez',
) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    occurredAt,
    eventType,
    actor: actorName ? { name: actorName } : null,
    payload,
  };
}

describe('invoice history timeline', () => {
  it('describes invoice events and names the actor', () => {
    const entries = toInvoiceHistoryEntries(
      [
        row('INVOICE_CONFIRMED', { number: 'FAC-000101' }),
        row('PAYMENT_RECORDED', {
          amount: '50.00',
          currency: 'DOP',
          method: 'CASH',
        }),
      ],
      'SELLER',
    );

    expect(entries).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'INVOICE_CONFIRMED',
        description: 'Factura FAC-000101 confirmada',
        createdAt: occurredAt.toISOString(),
        actorName: 'Ana Pérez',
      },
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'PAYMENT_RECORDED',
        description: 'Pago de 50.00 DOP en efectivo',
        createdAt: occurredAt.toISOString(),
        actorName: 'Ana Pérez',
      },
    ]);
  });

  it('hides profitability events from Seller and keeps them for Administrator', () => {
    const rows = [
      row('INVOICE_GROSS_PROFIT_RECORDED', { before: null, after: '10.00' }),
      row('INVOICE_USD_FX_RETRIED', { outcome: 'UNAVAILABLE' }),
      row('INVOICE_PDF_GENERATED', { status: 'READY' }),
    ];

    expect(toInvoiceHistoryEntries(rows, 'SELLER').map((event) => event.type)).toEqual([
      'INVOICE_PDF_GENERATED',
    ]);
    expect(toInvoiceHistoryEntries(rows, 'ADMINISTRATOR').map((event) => event.description)).toEqual([
      'Ganancia bruta registrada',
      'Reintento de tasa USD no disponible',
      'PDF generado',
    ]);
  });

  it('omits draft edits and line churn from the invoice timeline', () => {
    expect(
      toInvoiceHistoryEntries(
        [
          row('INVOICE_DRAFT_UPDATED', { before: {}, after: {} }),
          row('INVOICE_LINE_ADDED', { description: 'Filtro' }),
          row('INVOICE_LINE_UPDATED', { before: {}, after: {} }),
          row('INVOICE_LINE_REMOVED', { description: 'Filtro' }),
          row('INVOICE_CONFIRMED', { number: 'FAC-000101' }),
        ],
        'ADMINISTRATOR',
      ).map((event) => event.type),
    ).toEqual(['INVOICE_CONFIRMED']);
  });

  it('describes a recorded USD rate with operator language and provenance', () => {
    const entries = toInvoiceHistoryEntries(
      [
        row('INVOICE_USD_FX_RECORDED', {
          after: {
            exchangeRateDopPerUsd: '61.5',
            source: 'ExchangeRate-API',
          },
        }),
      ],
      'ADMINISTRATOR',
    );

    expect(entries[0]?.description).toBe(
      'Tasa USD 61.5 DOP/USD registrada (proveedor de tipo de cambio)',
    );
  });

  it('skips unknown event types instead of exposing raw payloads', () => {
    expect(toInvoiceHistoryEntries([row('USER_CREATED', { name: 'secret' })], 'ADMINISTRATOR')).toEqual(
      [],
    );
  });
});
