import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpProfitabilityRepository as repository } from '../../../src/api/http/repositories';

const calculatedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pendingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const unknownId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const cashCustomer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cliente contado',
  rnc: null,
  isDefault: true,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function emptySalesPage() {
  return json({ items: [], total: 0, page: 1, pageSize: 10 });
}

function emptyReceivables() {
  return json({ invoices: [], customers: [], total: 0, page: 1, pageSize: 10 });
}

/** Receivables are loaded alongside sales when composing the snapshot. */
function stubReceivablesIfNeeded(url: string): Response | null {
  if (url.startsWith('/api/sales/receivables')) return emptyReceivables();
  return null;
}

function listItem(
  id: string,
  number: string,
  profitability: {
    status: 'CALCULATED' | 'UNAVAILABLE' | 'MANUAL';
    reason: 'UNKNOWN_COST' | 'PENDING_FX_RATE' | null;
    profitDop: string | null;
    margin: string | null;
    fx?: { exchangeRateDopPerUsd: string; source: string; rateUpdatedAt: string; obtainedAt: string };
  },
  extra: {
    confirmedAt?: string;
    saleCondition?: 'CASH' | 'CREDIT';
    totalsGross?: string;
    payments?: Array<{
      kind: 'PAYMENT' | 'REFUND';
      amount: string;
      method: string;
      effectiveDate: string;
    }>;
  } = {},
) {
  return {
    id,
    status: 'COMPLETED',
    number,
    currency: id === pendingId ? 'USD' : 'DOP',
    customer: cashCustomer,
    confirmedAt: extra.confirmedAt ?? '2026-09-01T16:00:00.000Z',
    saleCondition: extra.saleCondition ?? 'CASH',
    totals: { gross: extra.totalsGross ?? '118.00', base: '100.00', itbis: '18.00' },
    payments: extra.payments ?? [],
    profitability,
  };
}

const calculated = listItem(
  calculatedId,
  'FAC-000001',
  {
    status: 'CALCULATED',
    reason: null,
    profitDop: '50.00',
    margin: '42.37',
  },
  {
    saleCondition: 'CASH',
    payments: [{ kind: 'PAYMENT', amount: '80.00', method: 'CASH', effectiveDate: '2026-09-01' }],
  },
);

const pending = listItem(pendingId, 'FAC-000002', {
  status: 'UNAVAILABLE',
  reason: 'PENDING_FX_RATE',
  profitDop: null,
  margin: null,
}, { saleCondition: 'CASH', totalsGross: '1200.00' });

const unknown = listItem(unknownId, 'FAC-000003', {
  status: 'UNAVAILABLE',
  reason: 'UNKNOWN_COST',
  profitDop: null,
  margin: null,
}, { saleCondition: 'CREDIT', totalsGross: '2000.00' });

afterEach(() => vi.unstubAllGlobals());

describe('HTTP profitability contract', () => {
  it('composes the snapshot from completed sales pages and omits seller rows without profit', async () => {
    const fetchMock = vi.fn(async (path: string) => {
      const url = String(path);
      const receivables = stubReceivablesIfNeeded(url);
      if (receivables) {
        return json({
          invoices: [],
          customers: [
            {
              customerId: cashCustomer.id,
              customerName: cashCustomer.name,
              currency: 'DOP',
              invoiceCount: 1,
              invoiced: '2000.00',
              paid: '500.00',
              balance: '1500.00',
            },
            {
              customerId: cashCustomer.id,
              customerName: cashCustomer.name,
              currency: 'USD',
              invoiceCount: 1,
              invoiced: '1200.00',
              paid: '0.00',
              balance: '1200.00',
            },
          ],
          total: 0,
          page: 1,
          pageSize: 10,
        });
      }
      if (url.startsWith('/api/sales?status=CANCELLED')) return emptySalesPage();
      if (url === '/api/sales?status=COMPLETED&page=1&pageSize=10') {
        return json({ items: [calculated, pending], total: 3, page: 1, pageSize: 10 });
      }
      if (url === '/api/sales?status=COMPLETED&page=2&pageSize=10') {
        return json({ items: [unknown], total: 3, page: 2, pageSize: 10 });
      }
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.getSnapshot();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.pendingFxCount).toBe(1);
    expect(result.value.outstandingDop).toBe(1500);
    expect(result.value.outstandingUsd).toBe(1200);
    expect(result.value.profitDop).toBe(50);
    expect(result.value.collectedDop).toBe(80);
    expect(result.value.invoicesMissingProfitCount).toBe(2);
    expect(result.value.charts?.profitByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      50,
    );
    expect(result.value.charts?.invoicedCashByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      118,
    );
    expect(result.value.charts?.invoicedCreditByDay.find((point) => point.key === '2026-09-01')?.amount).toBe(
      2000,
    );
    expect(
      result.value.charts?.collectedByMethodByDay.find((point) => point.key === '2026-09-01'),
    ).toMatchObject({ CASH: 80, TRANSFER: 0, CHECK: 0 });
    expect(result.value.invoices.map((row) => row.number)).toEqual([
      'FAC-000001',
      'FAC-000002',
      'FAC-000003',
    ]);
    expect(result.value.invoices[1]).toMatchObject({
      pendingFx: true,
      profit: null,
      canRecordManual: false,
    });
    expect(result.value.invoices[2]).toMatchObject({
      pendingFx: false,
      profit: null,
      canRecordManual: true,
    });
  });

  it('retries USD profitability and records judged DOP profit with CSRF, then reloads the snapshot', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const receivables = stubReceivablesIfNeeded(url);
      if (receivables) return receivables;
      if (url.includes(`/api/profitability/${pendingId}/retry`) && init?.method === 'POST') {
        expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(JSON.parse(String(init.body))).toEqual({});
        return json({ id: pendingId });
      }
      if (url.includes(`/api/profitability/${unknownId}/manual-gross-profit`) && init?.method === 'POST') {
        expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(JSON.parse(String(init.body))).toEqual({ profitDop: '1800.00' });
        return json({ id: unknownId });
      }
      if (url.startsWith('/api/sales?status=CANCELLED')) return emptySalesPage();
      if (url.startsWith('/api/sales?status=COMPLETED')) {
        return json({
          items: [
            {
              ...pending,
              profitability: {
                status: 'CALCULATED',
                reason: null,
                profitDop: '7177.00',
                margin: '10.00',
                fx: {
                  exchangeRateDopPerUsd: '61.50',
                  source: 'ExchangeRate-API',
                  rateUpdatedAt: '2026-09-09T00:00:00.000Z',
                  obtainedAt: '2026-09-09T13:00:00.000Z',
                },
              },
            },
            {
              ...unknown,
              profitability: {
                status: 'MANUAL',
                reason: null,
                profitDop: '1800.00',
                margin: '15.25',
              },
            },
          ],
          total: 2,
          page: 1,
          pageSize: 10,
        });
      }
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const retried = await repository.retryUsd({ invoiceId: pendingId });
    expect(retried.ok).toBe(true);
    if (retried.ok) {
      expect(retried.value.invoices[0]).toMatchObject({
        number: 'FAC-000002',
        profit: 7177,
        pendingFx: false,
        source: 'CALCULATED',
        rateDopPerUsd: 61.5,
      });
    }

    const recorded = await repository.recordManualGrossProfit({
      invoiceId: unknownId,
      profitDop: 1800,
    });
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(recorded.value.invoices[1]).toMatchObject({
        number: 'FAC-000003',
        profit: 1800,
        source: 'MANUAL',
        canRecordManual: true,
      });
      expect(recorded.value.profitDop).toBe(8977);
    }
  });

  it.each([
    { name: 'null', rawRate: null, expectedCollected: 0, expectedOmitted: 1 },
    { name: 'empty', rawRate: '', expectedCollected: 0, expectedOmitted: 1 },
    { name: 'non-numeric', rawRate: 'not-a-rate', expectedCollected: 0, expectedOmitted: 1 },
    { name: 'infinite', rawRate: 'Infinity', expectedCollected: 0, expectedOmitted: 1 },
    { name: 'zero', rawRate: '0', expectedCollected: 0, expectedOmitted: 1 },
    { name: 'negative', rawRate: '-61.5', expectedCollected: 0, expectedOmitted: 1 },
    { name: 'valid', rawRate: '61.50', expectedCollected: 123, expectedOmitted: 0 },
  ])(
    'handles a $name fallback FX rate without producing invalid collected totals',
    async ({ rawRate, expectedCollected, expectedOmitted }) => {
      const usdWithoutProfitFx = {
        ...pending,
        profitability: {
          status: 'CALCULATED' as const,
          reason: null,
          profitDop: '10.00',
          margin: '1.00',
        },
        exchangeRateDopPerUsd: rawRate,
        payments: [
          { kind: 'PAYMENT' as const, amount: '2.00', method: 'CASH', effectiveDate: '2026-09-01' },
        ],
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string) => {
          const url = String(path);
          const receivables = stubReceivablesIfNeeded(url);
          if (receivables) return receivables;
          if (url.startsWith('/api/sales?status=CANCELLED')) return emptySalesPage();
          if (url.startsWith('/api/sales?status=COMPLETED')) {
            return json({ items: [usdWithoutProfitFx], total: 1, page: 1, pageSize: 10 });
          }
          throw new Error(`Unexpected ${path}`);
        }),
      );

      const result = await repository.getSnapshot();

      expect(result).toMatchObject({
        ok: true,
        value: {
          collectedDop: expectedCollected,
          omittedUsdReceiptCount: expectedOmitted,
          invoices: [{ rateDopPerUsd: undefined }],
        },
      });
    },
  );

  it('ignores drafts and rows without profitability while preserving optional invoice fields', async () => {
    const rowsWithoutProfit = [
      {
        ...calculated,
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'DRAFT',
        number: null,
        confirmedAt: null,
        payments: undefined,
        profitability: undefined,
      },
      {
        ...calculated,
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        status: 'COMPLETED',
        number: null,
        confirmedAt: null,
        payments: undefined,
        profitability: undefined,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        const url = String(path);
        const receivables = stubReceivablesIfNeeded(url);
        if (receivables) return receivables;
        if (url.startsWith('/api/sales?status=CANCELLED')) return emptySalesPage();
        if (url.startsWith('/api/sales?status=COMPLETED')) {
          return json({ items: rowsWithoutProfit, total: 2, page: 1, pageSize: 10 });
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );

    expect(await repository.getSnapshot()).toMatchObject({
      ok: true,
      value: {
        profitDop: 0,
        collectedDop: 0,
        outstandingDop: 0,
        outstandingUsd: 0,
        pendingFxCount: 0,
        invoices: [],
        charts: null,
      },
    });
  });

  it('uses the invoice id when a profitable completed row has no number', async () => {
    const unnumbered = {
      ...calculated,
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      number: null,
      confirmedAt: null,
      payments: undefined,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        const url = String(path);
        const receivables = stubReceivablesIfNeeded(url);
        if (receivables) return receivables;
        if (url.startsWith('/api/sales?status=CANCELLED')) return emptySalesPage();
        if (url.startsWith('/api/sales?status=COMPLETED')) {
          return json({ items: [unnumbered], total: 1, page: 1, pageSize: 10 });
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );

    expect(await repository.getSnapshot()).toMatchObject({
      ok: true,
      value: {
        profitDop: 50,
        invoices: [{ number: 'ffffffff-ffff-4fff-8fff-ffffffffffff', confirmedAt: null }],
      },
    });
  });

  it.each([
    ['retry', () => repository.retryUsd({ invoiceId: pendingId })],
    [
      'manual profit',
      () => repository.recordManualGrossProfit({ invoiceId: unknownId, profitDop: 10.126 }),
    ],
  ])('maps a failed %s request without attempting snapshot lookups', async (_name, mutate) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ error: { code: 'CONFLICT', message: 'Conflicto' } }, 409));
    vi.stubGlobal('fetch', fetchMock);

    expect(await mutate()).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes manual profit to two decimals', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const receivables = stubReceivablesIfNeeded(url);
      if (receivables) return receivables;
      if (url.includes(`/api/profitability/${unknownId}/manual-gross-profit`)) {
        const requestInit = init as RequestInit;
        expect(init?.method).toBe('POST');
        expect(new Headers(requestInit.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(JSON.parse(String(requestInit.body))).toEqual({ profitDop: '10.13' });
        return json({ id: unknownId });
      }
      if (url.startsWith('/api/sales?status=')) return emptySalesPage();
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await repository.recordManualGrossProfit({ invoiceId: unknownId, profitDop: 10.126 }),
    ).toMatchObject({ ok: true, value: { invoices: [], profitDop: 0 } });
  });

  it('leaves the demo FX toggle unimplemented', async () => {
    const result = await repository.setFxAvailable({ available: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
  });
});
