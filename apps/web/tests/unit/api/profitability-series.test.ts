import { describe, expect, it } from 'vitest';

import {
  buildProfitabilitySeries,
  type ProfitabilitySeriesInvoice,
} from '../../../src/api/client/profitability-series';

function invoice(overrides: Partial<ProfitabilitySeriesInvoice>): ProfitabilitySeriesInvoice {
  return {
    status: 'COMPLETED',
    currency: 'DOP',
    confirmedAt: '2026-08-20T14:00:00.000Z',
    profit: null,
    pendingFx: false,
    rateDopPerUsd: null,
    receipts: [],
    ...overrides,
  };
}

describe('buildProfitabilitySeries', () => {
  it('fills missing days and months with zero from the first invoice through today', () => {
    const series = buildProfitabilitySeries(
      [
        invoice({
          confirmedAt: '2026-08-31T16:00:00.000Z',
          profit: 100,
        }),
      ],
      '2026-09-02',
    );

    expect(series.charts?.fromDay).toBe('2026-08-31');
    expect(series.charts?.toDay).toBe('2026-09-02');
    expect(series.charts?.profitByDay.map((point) => [point.key, point.amount])).toEqual([
      ['2026-08-31', 100],
      ['2026-09-01', 0],
      ['2026-09-02', 0],
    ]);
    expect(series.charts?.profitByMonth.map((point) => [point.key, point.amount])).toEqual([
      ['2026-08', 100],
      ['2026-09', 0],
    ]);
    expect(series.charts?.collectedByDay.every((point) => point.amount === 0)).toBe(true);
  });

  it('omits unknown and pending-FX profit until they become numbered, then includes them', () => {
    const pending = invoice({
      currency: 'USD',
      confirmedAt: '2026-09-01T16:00:00.000Z',
      profit: null,
      pendingFx: true,
    });
    const unknown = invoice({
      confirmedAt: '2026-09-01T18:00:00.000Z',
      profit: null,
    });

    const before = buildProfitabilitySeries([pending, unknown], '2026-09-01');
    expect(before.invoicesMissingProfitCount).toBe(2);
    expect(before.charts?.profitByDay[0]?.amount).toBe(0);

    const after = buildProfitabilitySeries(
      [
        { ...pending, pendingFx: false, profit: 7177, rateDopPerUsd: 61.5 },
        { ...unknown, profit: 1800 },
      ],
      '2026-09-01',
    );
    expect(after.invoicesMissingProfitCount).toBe(0);
    expect(after.charts?.profitByDay[0]?.amount).toBe(8977);
  });

  it('converts USD receipts with the stored rate and omits them when the rate is missing', () => {
    const withRate = invoice({
      currency: 'USD',
      pendingFx: false,
      rateDopPerUsd: 61.5,
      receipts: [{ kind: 'PAYMENT', amount: 100, effectiveDate: '2026-09-01' }],
    });
    const pendingFx = invoice({
      currency: 'USD',
      pendingFx: true,
      rateDopPerUsd: null,
      receipts: [{ kind: 'PAYMENT', amount: 50, effectiveDate: '2026-09-01' }],
    });

    const converted = buildProfitabilitySeries([withRate], '2026-09-01');
    expect(converted.collectedDop).toBe(6150);
    expect(converted.omittedUsdReceiptCount).toBe(0);
    expect(converted.charts?.collectedByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      6150,
    );

    const omitted = buildProfitabilitySeries([pendingFx], '2026-09-01');
    expect(omitted.collectedDop).toBe(0);
    expect(omitted.omittedUsdReceiptCount).toBe(1);
  });

  it('drops cancelled invoice profit and subtracts its refund from collected on the refund date', () => {
    const series = buildProfitabilitySeries(
      [
        invoice({
          status: 'CANCELLED',
          confirmedAt: '2026-09-01T16:00:00.000Z',
          profit: 5000,
          receipts: [
            { kind: 'PAYMENT', amount: 8000, effectiveDate: '2026-09-01' },
            { kind: 'REFUND', amount: 8000, effectiveDate: '2026-09-03' },
          ],
        }),
      ],
      '2026-09-03',
    );

    expect(series.charts?.profitByDay.map((point) => point.amount)).toEqual([0, 0, 0]);
    expect(series.charts?.collectedByDay.map((point) => [point.key, point.amount])).toEqual([
      ['2026-09-01', 8000],
      ['2026-09-02', 0],
      ['2026-09-03', -8000],
    ]);
    expect(series.collectedDop).toBe(0);
  });
});
