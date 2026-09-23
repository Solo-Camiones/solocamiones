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
    saleCondition: 'CASH',
    gross: 0,
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
          gross: 500,
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
    expect(series.charts?.invoicedCashByDay.map((point) => [point.key, point.amount])).toEqual([
      ['2026-08-31', 500],
      ['2026-09-01', 0],
      ['2026-09-02', 0],
    ]);
  });

  it('omits unknown and pending-FX profit until they become numbered, then includes them', () => {
    const pending = invoice({
      currency: 'USD',
      confirmedAt: '2026-09-01T16:00:00.000Z',
      profit: null,
      pendingFx: true,
      gross: 100,
    });
    const unknown = invoice({
      confirmedAt: '2026-09-01T18:00:00.000Z',
      profit: null,
      gross: 200,
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
      confirmedAt: '2026-09-01T16:00:00.000Z',
      pendingFx: false,
      rateDopPerUsd: 61.5,
      gross: 100,
      receipts: [{ kind: 'PAYMENT', amount: 100, method: 'CASH', effectiveDate: '2026-09-01' }],
    });
    const pendingFx = invoice({
      currency: 'USD',
      confirmedAt: '2026-09-01T16:00:00.000Z',
      pendingFx: true,
      rateDopPerUsd: null,
      gross: 50,
      receipts: [{ kind: 'PAYMENT', amount: 50, method: 'TRANSFER', effectiveDate: '2026-09-01' }],
    });

    const converted = buildProfitabilitySeries([withRate], '2026-09-01');
    expect(converted.collectedDop).toBe(6150);
    expect(converted.omittedUsdReceiptCount).toBe(0);
    expect(converted.charts?.collectedByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      6150,
    );
    expect(converted.charts?.invoicedCashByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      6150,
    );
    expect(converted.charts?.collectedByMethodByDay.find((point) => point.key === '2026-09-01')).toEqual(
      expect.objectContaining({ CASH: 6150, TRANSFER: 0, CHECK: 0 }),
    );

    const omitted = buildProfitabilitySeries([pendingFx], '2026-09-01');
    expect(omitted.collectedDop).toBe(0);
    expect(omitted.omittedUsdReceiptCount).toBe(1);
    expect(omitted.charts?.invoicedCashByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(0);
  });

  it('counts CONDUCE sales once without inventing a second row after status is still CONDUCE', () => {
    const series = buildProfitabilitySeries(
      [
        invoice({
          status: 'CONDUCE',
          confirmedAt: '2026-09-01T12:00:00.000Z',
          saleCondition: 'CREDIT',
          gross: 1000,
          profit: 400,
        }),
      ],
      '2026-09-01',
    );

    expect(series.invoicesMissingProfitCount).toBe(0);
    expect(series.charts?.invoicedCreditByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      1000,
    );
    expect(series.charts?.profitByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(400);
  });

  it('excludes cancelled invoices from profit, invoiced, and collected KPIs', () => {
    const series = buildProfitabilitySeries(
      [
        invoice({
          status: 'CANCELLED',
          confirmedAt: '2026-09-01T16:00:00.000Z',
          saleCondition: 'CASH',
          gross: 8000,
          profit: 5000,
          receipts: [
            { kind: 'PAYMENT', amount: 8000, method: 'CASH', effectiveDate: '2026-09-01' },
            { kind: 'REFUND', amount: 8000, method: 'CASH', effectiveDate: '2026-09-03' },
          ],
        }),
      ],
      '2026-09-03',
    );

    // CANCELLED still anchors the chart date range from confirmedAt.
    expect(series.charts?.fromDay).toBe('2026-09-01');
    expect(series.charts?.profitByDay.map((point) => point.amount)).toEqual([0, 0, 0]);
    expect(series.charts?.collectedByDay.map((point) => point.amount)).toEqual([0, 0, 0]);
    expect(series.charts?.invoicedCashByDay.map((point) => point.amount)).toEqual([0, 0, 0]);
    expect(series.charts?.collectedByMethodByDay.map((point) => point.CASH)).toEqual([0, 0, 0]);
    expect(series.collectedDop).toBe(0);
  });

  it('splits invoiced gross by saleCondition on confirmation day', () => {
    const series = buildProfitabilitySeries(
      [
        invoice({
          confirmedAt: '2026-09-01T12:00:00.000Z',
          saleCondition: 'CASH',
          gross: 10_000,
        }),
        invoice({
          confirmedAt: '2026-09-01T18:00:00.000Z',
          saleCondition: 'CREDIT',
          gross: 4_500,
        }),
      ],
      '2026-09-01',
    );

    expect(series.charts?.invoicedCashByDay[0]?.amount).toBe(10_000);
    expect(series.charts?.invoicedCreditByDay[0]?.amount).toBe(4_500);
  });

  it('buckets collected by method on payment effectiveDate and nets refunds', () => {
    const series = buildProfitabilitySeries(
      [
        invoice({
          confirmedAt: '2026-09-01T12:00:00.000Z',
          saleCondition: 'CREDIT',
          gross: 12_000,
          receipts: [
            { kind: 'PAYMENT', amount: 5_000, method: 'TRANSFER', effectiveDate: '2026-09-02' },
            { kind: 'PAYMENT', amount: 3_000, method: 'CHECK', effectiveDate: '2026-09-02' },
            { kind: 'PAYMENT', amount: 2_000, method: 'CASH', effectiveDate: '2026-09-03' },
            { kind: 'REFUND', amount: 500, method: 'TRANSFER', effectiveDate: '2026-09-03' },
          ],
        }),
      ],
      '2026-09-03',
    );

    const byDay = Object.fromEntries(
      (series.charts?.collectedByMethodByDay ?? []).map((point) => [
        point.key,
        { CASH: point.CASH, TRANSFER: point.TRANSFER, CHECK: point.CHECK },
      ]),
    );
    expect(byDay['2026-09-01']).toEqual({ CASH: 0, TRANSFER: 0, CHECK: 0 });
    expect(byDay['2026-09-02']).toEqual({ CASH: 0, TRANSFER: 5_000, CHECK: 3_000 });
    expect(byDay['2026-09-03']).toEqual({ CASH: 2_000, TRANSFER: -500, CHECK: 0 });
    expect(series.collectedDop).toBe(9_500);
  });
});
