import { describe, expect, it } from 'vitest';

import {
  assembleProfitabilitySnapshot,
  toCollectionMethod,
} from '../../../src/api/client/assemble-profitability-snapshot';
import type { ProfitabilityInvoiceRow } from '../../../src/api/contracts/profitability';
import type { ProfitabilitySeriesInvoice } from '../../../src/api/client/profitability-series';

function row(overrides: Partial<ProfitabilityInvoiceRow>): ProfitabilityInvoiceRow {
  return {
    id: 'inv-1',
    number: 'FAC-000002',
    customerName: 'Cliente',
    currency: 'DOP',
    total: 1000,
    profit: 100,
    pendingFx: false,
    canRecordManual: false,
    href: '/sales/inv-1',
    confirmedAt: '2026-09-01T16:00:00.000Z',
    ...overrides,
  };
}

function seriesInvoice(
  overrides: Partial<ProfitabilitySeriesInvoice> = {},
): ProfitabilitySeriesInvoice {
  return {
    status: 'COMPLETED',
    currency: 'DOP',
    confirmedAt: '2026-09-01T16:00:00.000Z',
    saleCondition: 'CASH',
    gross: 1000,
    profit: 100,
    pendingFx: false,
    rateDopPerUsd: null,
    receipts: [],
    ...overrides,
  };
}

describe('toCollectionMethod', () => {
  it('accepts known collection methods and rejects others', () => {
    expect(toCollectionMethod('CASH')).toBe('CASH');
    expect(toCollectionMethod('TRANSFER')).toBe('TRANSFER');
    expect(toCollectionMethod('CHECK')).toBe('CHECK');
    expect(toCollectionMethod('CARD')).toBeNull();
    expect(toCollectionMethod('')).toBeNull();
  });
});

describe('assembleProfitabilitySnapshot', () => {
  it('sums profit excluding pending FX, sorts invoices, and counts pending FX', () => {
    const snapshot = assembleProfitabilitySnapshot({
      invoices: [
        row({ id: 'b', number: 'FAC-000002', profit: 50 }),
        row({ id: 'a', number: 'FAC-000001', profit: 25 }),
        row({
          id: 'c',
          number: 'FAC-000003',
          profit: null,
          pendingFx: true,
          currency: 'USD',
        }),
      ],
      seriesInputs: [
        seriesInvoice({ profit: 50 }),
        seriesInvoice({ profit: 25 }),
        seriesInvoice({
          currency: 'USD',
          profit: null,
          pendingFx: true,
          rateDopPerUsd: null,
        }),
      ],
      outstanding: { outstandingDop: 1200, outstandingUsd: 40 },
      fxAvailable: true,
      fxRateDopPerUsd: 61.5,
    });

    expect(snapshot.profitDop).toBe(75);
    expect(snapshot.pendingFxCount).toBe(1);
    expect(snapshot.outstandingDop).toBe(1200);
    expect(snapshot.outstandingUsd).toBe(40);
    expect(snapshot.fxAvailable).toBe(true);
    expect(snapshot.fxRateDopPerUsd).toBe(61.5);
    expect(snapshot.invoices.map((entry) => entry.number)).toEqual([
      'FAC-000001',
      'FAC-000002',
      'FAC-000003',
    ]);
    expect(snapshot.charts).not.toBeNull();
  });

  it('defaults FX fields when omitted', () => {
    const snapshot = assembleProfitabilitySnapshot({
      invoices: [],
      seriesInputs: [],
      outstanding: { outstandingDop: 0, outstandingUsd: 0 },
    });

    expect(snapshot.fxAvailable).toBe(false);
    expect(snapshot.fxRateDopPerUsd).toBe(0);
    expect(snapshot.profitDop).toBe(0);
    expect(snapshot.pendingFxCount).toBe(0);
    expect(snapshot.invoices).toEqual([]);
  });
});
