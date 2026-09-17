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
    const rows = [
      row('INVOICE_CONFIRMED', { number: 'FAC-000101' }),
      row('PAYMENT_RECORDED', {
        amount: '50.00',
        currency: 'DOP',
        method: 'CASH',
      }),
    ];

    expect(toInvoiceHistoryEntries(rows, 'SELLER')).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'INVOICE_CONFIRMED',
        description: 'Factura FAC-000101 confirmada',
        createdAt: occurredAt.toISOString(),
        actorName: 'Ana Pérez',
      },
    ]);
    expect(toInvoiceHistoryEntries(rows, 'ADMINISTRATOR')).toEqual([
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

  it.each(['SELLER', 'MECHANIC'] as const)(
    'hides payment events from %s and keeps them for Administrator',
    (role) => {
      const rows = [
        row('INVOICE_CONFIRMED', { number: 'FAC-000101' }),
        row('PAYMENT_RECORDED', { amount: '50.00', currency: 'DOP', method: 'CASH' }),
        row('INVOICE_PDF_GENERATED', { status: 'READY' }),
      ];

      expect(toInvoiceHistoryEntries(rows, role).map((event) => event.type)).toEqual([
        'INVOICE_CONFIRMED',
        'INVOICE_PDF_GENERATED',
      ]);
      expect(toInvoiceHistoryEntries(rows, 'ADMINISTRATOR').map((event) => event.type)).toEqual([
        'INVOICE_CONFIRMED',
        'PAYMENT_RECORDED',
        'INVOICE_PDF_GENERATED',
      ]);
    },
  );

  it.each(['SELLER', 'MECHANIC'] as const)(
    'hides profitability events from %s and keeps them for Administrator',
    (role) => {
      const rows = [
        row('INVOICE_GROSS_PROFIT_RECORDED', { before: null, after: '10.00' }),
        row('INVOICE_USD_FX_RECORDED', { after: { exchangeRateDopPerUsd: '61.5', source: 'DEMO_FX' } }),
        row('INVOICE_USD_FX_RETRIED', { outcome: 'UNAVAILABLE' }),
        row('INVOICE_PDF_GENERATED', { status: 'READY' }),
      ];

      expect(toInvoiceHistoryEntries(rows, role).map((event) => event.type)).toEqual([
        'INVOICE_PDF_GENERATED',
      ]);
      expect(toInvoiceHistoryEntries(rows, 'ADMINISTRATOR').map((event) => event.type)).toEqual([
        'INVOICE_GROSS_PROFIT_RECORDED',
        'INVOICE_USD_FX_RECORDED',
        'INVOICE_USD_FX_RETRIED',
        'INVOICE_PDF_GENERATED',
      ]);
    },
  );

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

  it.each([
    ['INVOICE_DRAFT_CREATED', null, 'Borrador creado'],
    ['INVOICE_DRAFT_DISCARDED', null, 'Borrador descartado'],
    ['INVOICE_CONFIRMED', {}, 'Factura confirmada'],
    ['INVOICE_CANCELLED', null, 'Factura anulada'],
    ['INVOICE_GROSS_PROFIT_RECORDED', null, 'Ganancia bruta registrada'],
    ['INVOICE_USD_FX_RETRIED', { outcome: 'RECORDED' }, 'Tasa USD registrada'],
    ['INVOICE_PDF_GENERATED', null, 'PDF generado'],
    ['INVOICE_PDF_FAILED', null, 'Falló la generación del PDF'],
  ])('describes supported %s fallbacks', (eventType, payload, description) => {
    expect(toInvoiceHistoryEntries([row(eventType, payload, null)], 'ADMINISTRATOR')).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: eventType,
        description,
        createdAt: occurredAt.toISOString(),
      },
    ]);
  });

  it.each([
    [{ amount: '10.00', currency: 'USD', method: 'TRANSFER' }, 'Pago de 10.00 USD en transferencia'],
    [{ amount: '20.00', currency: 'DOP', method: 'CHECK' }, 'Pago de 20.00 DOP en cheque'],
    [{ amount: '30.00', method: 'CARD' }, 'Pago de 30.00 en card'],
    [null, 'Pago de 0.00 en pago'],
    [[], 'Pago de 0.00 en pago'],
  ])('describes payment payload %# without exposing missing fields', (payload, description) => {
    expect(toInvoiceHistoryEntries([row('PAYMENT_RECORDED', payload)], 'ADMINISTRATOR')[0]?.description).toBe(
      description,
    );
  });

  it.each([
    ['DEMO_FX', 'Tasa USD 61.5 DOP/USD registrada (tasa de demostración)'],
    ['MANUAL_SOURCE', 'Tasa USD 61.5 DOP/USD registrada (origen del tipo de cambio · MANUAL_SOURCE)'],
  ])('describes the %s FX source without leaking provider details', (source, description) => {
    const entries = toInvoiceHistoryEntries(
      [
        row('INVOICE_USD_FX_RECORDED', {
          after: { exchangeRateDopPerUsd: '61.5', source },
        }),
      ],
      'ADMINISTRATOR',
    );

    expect(entries[0]?.description).toBe(description);
  });

  it.each([
    null,
    [],
    { after: null },
    { after: { exchangeRateDopPerUsd: '', source: 'ExchangeRate-API' } },
    { after: { exchangeRateDopPerUsd: '61.5' } },
  ])('uses a safe FX fallback for incomplete payload %#', (payload) => {
    expect(
      toInvoiceHistoryEntries([row('INVOICE_USD_FX_RECORDED', payload)], 'ADMINISTRATOR')[0]
        ?.description,
    ).toBe('Tasa USD registrada');
  });
});
