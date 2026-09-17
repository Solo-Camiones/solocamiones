import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpSalesRepository as repository } from '../../../src/api/http/repositories';
import { toHttpAddLineBody } from '../../../src/api/client/sales-api';

const cashCustomer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cliente contado',
  customerType: 'CASH',
  creditLimitDop: null,
  creditTermDays: null,
  rnc: null,
  isDefault: true,
};

const installation = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Instalación',
  description: null,
  active: true,
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const lineId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const emptyInvoice = {
  id: draftId,
  status: 'DRAFT',
  number: null,
  currency: 'DOP',
  fiscal: false,
  applyItbis: false,
  customer: cashCustomer,
  customerSnapshot: null,
  confirmedAt: null,
  dueDate: null,
  sellerName: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledByName: null,
  paymentState: 'PENDING',
  payments: [],
  paid: '0.00',
  refunded: '0.00',
  balance: '0.00',
  lines: [],
  totals: { gross: '0.00', base: '0.00', itbis: '0.00' },
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
};

const invoiceWithTotal = {
  ...emptyInvoice,
  totals: { gross: '118.00', base: '100.00', itbis: '18.00' },
};

const completedInvoice = {
  ...invoiceWithTotal,
  status: 'COMPLETED' as const,
  number: 'FAC-000010',
  confirmedAt: '2026-09-09T13:00:00.000Z',
  paid: '0.00',
  refunded: '0.00',
  balance: '118.00',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('HTTP sales draft contract', () => {
  it('lists one API page for ALL without concatenating status filters', async () => {
    const completed = {
      ...invoiceWithTotal,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      status: 'COMPLETED' as const,
      balance: '118.00',
      number: 'FAC-000001',
      customer: { ...cashCustomer, name: 'Nombre al confirmar' },
      confirmedAt: '2026-09-09T13:00:00.000Z',
      createdAt: '2026-09-09T13:00:00.000Z',
    };
    const fetchMock = vi.fn(async (path: string) => {
      const url = String(path);
      if (url === '/api/sales?page=1&pageSize=10') {
        return json({
          items: [completed, invoiceWithTotal],
          total: 12,
          page: 1,
          pageSize: 10,
        });
      }
      if (url.startsWith('/api/sales?status=COMPLETED')) {
        return json({
          items: [completed],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (url.startsWith('/api/sales?status=CANCELLED')) {
        return json({ items: [], total: 0, page: 1, pageSize: 10 });
      }
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const all = await repository.listInvoices('ALL');
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value).toMatchObject({
        total: 12,
        page: 1,
        pageSize: 10,
      });
      expect(all.value.items.map((row) => row.number)).toEqual(['FAC-000001', 'Borrador']);
      expect(all.value.items[0]).toMatchObject({
        status: 'COMPLETED',
        href: '/sales/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        customerName: 'Nombre al confirmar',
        balance: 118,
      });
    }
    expect(fetchMock.mock.calls.map(([requestPath]) => requestPath)).toEqual([
      '/api/sales?page=1&pageSize=10',
    ]);

    fetchMock.mockClear();
    const completedPage = await repository.listInvoices('COMPLETED');
    expect(completedPage).toMatchObject({
      ok: true,
      value: { items: [{ number: 'FAC-000001', status: 'COMPLETED' }], total: 1 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sales?status=COMPLETED&page=1&pageSize=10');

    fetchMock.mockClear();
    expect(await repository.listInvoices('CANCELLED')).toEqual({
      ok: true,
      value: { items: [], total: 0, page: 1, pageSize: 10 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sales?status=CANCELLED&page=1&pageSize=10');
  });

  it('sends the search query so a match is not limited to the current page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        items: [
          {
            ...invoiceWithTotal,
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            status: 'COMPLETED',
            number: 'FAC-000099',
            customer: { ...cashCustomer, name: 'Flota Este' },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.listInvoices('ALL', 1, '  FAC-000099  ');
    expect(result).toMatchObject({
      ok: true,
      value: { items: [{ number: 'FAC-000099' }], total: 1 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sales?page=1&pageSize=10&q=FAC-000099');
  });

  it('sends the document date range so filtering happens before pagination', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ items: [], total: 0, page: 1, pageSize: 10 }));
    vi.stubGlobal('fetch', fetchMock);

    await repository.listInvoices('COMPLETED', 1, '', {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/sales?status=COMPLETED&page=1&pageSize=10&dateFrom=2026-09-01&dateTo=2026-09-30',
    );
  });

  it('sends the customer and invoice receivables filters in the HTTP query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        invoices: [],
        customers: [],
        total: 0,
        page: 2,
        pageSize: 10,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.listReceivables(2, {
      customerId: '11111111-1111-4111-8111-111111111111',
      invoice: 'FAC-000099',
    });

    expect(result).toEqual({
      ok: true,
      value: { invoices: [], customers: [], total: 0, page: 2, pageSize: 10 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/sales/receivables?page=2&pageSize=10&customerId=11111111-1111-4111-8111-111111111111&invoice=FAC-000099',
    );
  });

  it('downloads the selected customer account statement from the dedicated endpoint', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="estado-de-cuenta-flota-este.pdf"',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.getAccountStatementPdf(cashCustomer.id);

    expect(result).toMatchObject({
      ok: true,
      value: { filename: 'estado-de-cuenta-flota-este.pdf' },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/sales/receivables/${cashCustomer.id}/statement.pdf`,
    );
  });

  it('creates a draft with CSRF and loads lookups on getDraft', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === '/api/sales' && init?.method === 'POST') return json(emptyInvoice, 201);
      if (url === `/api/sales/${draftId}` && !init?.method) return json(emptyInvoice);
      if (url.startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (url === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await repository.createDraft()).toEqual({ ok: true, value: { draftId } });
    const createInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(createInit.headers).get('X-Requested-With')).toBe('XMLHttpRequest');

    const draft = await repository.getDraft(draftId);
    expect(draft).toMatchObject({
      ok: true,
      value: {
        id: draftId,
        customerIsDefault: true,
        customerType: 'CASH',
        currency: 'DOP',
        items: [],
        qtyProducts: [],
        blockers: [],
        services: [{ id: installation.id, name: 'Instalación' }],
      },
    });
  });

  it('omits acquisition cost from ordinary add-line bodies', () => {
    expect(
      toHttpAddLineBody({
        draftId,
        type: 'GENERIC',
        description: 'Filtro',
        quantity: 2,
        unitPrice: 100,
        notes: '  En bahía  ',
      }),
    ).toEqual({
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: '100.00',
      quantity: '2.00',
      notes: 'En bahía',
    });
    expect(
      toHttpAddLineBody({
        draftId,
        type: 'EXTERNAL',
        description: 'Bomba',
        unitPrice: 50,
      }),
    ).toEqual({
      type: 'EXTERNAL',
      description: 'Bomba',
      unitPrice: '50.00',
    });
    expect(
      toHttpAddLineBody({
        draftId,
        type: 'DELIVERY',
        unitPrice: 0,
      }),
    ).toEqual({
      type: 'DELIVERY',
      description: 'Entrega',
      unitPrice: '0.00',
    });
    expect(toHttpAddLineBody({ draftId, type: 'ITEM', itemId: 'x' })).toEqual({ type: 'ITEM' });
  });

  it.each([
    {
      name: 'blank notes and omitted optional service fields',
      input: { draftId, type: 'SERVICE' as const, serviceId: installation.id, notes: '   ' },
      expected: {
        type: 'SERVICE',
        serviceId: installation.id,
        unitPrice: '0.00',
        notes: null,
      },
    },
    {
      name: 'a custom delivery description',
      input: { draftId, type: 'DELIVERY' as const, description: '  Envío expreso  ' },
      expected: { type: 'DELIVERY', description: 'Envío expreso', unitPrice: '0.00' },
    },
    {
      name: 'a non-finite merchandise price as zero',
      input: {
        draftId,
        type: 'GENERIC' as const,
        description: undefined,
      },
      expected: {
        type: 'GENERIC',
        description: '',
        unitPrice: '0.00',
      },
    },
  ])('serializes $name', ({ input, expected }) => {
    expect(toHttpAddLineBody(input)).toEqual(expected);
  });

  it('adds a GENERIC line and discards with DELETE', async () => {
    const withLine = {
      ...emptyInvoice,
      lines: [
        {
          id: lineId,
          type: 'GENERIC',
          description: 'Filtro',
          quantity: '1.00',
          unitPrice: '100.00',
          taxable: true,
          gross: '100.00',
          base: '100.00',
          itbis: '0.00',
          acquisitionCostDop: null,
          costProvenance: 'UNKNOWN',
          serviceId: null,
        },
      ],
      totals: { gross: '100.00', base: '100.00', itbis: '0.00' },
    };
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === `/api/sales/${draftId}/lines` && init?.method === 'POST')
        return json(withLine, 201);
      if (url === `/api/sales/${draftId}` && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (url === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const added = await repository.addLine({
      draftId,
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: 100,
      quantity: 1,
    });
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.value.lines[0]?.description).toBe('Filtro');
      expect(added.value.totals.gross).toBe(100);
    }
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      type: 'GENERIC',
      unitPrice: '100.00',
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)),
    ).not.toHaveProperty('costProvenance');

    expect(await repository.discardDraft(draftId)).toEqual({ ok: true, value: undefined });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('updates all editable line fields in one PATCH', async () => {
    const updatedInvoice = {
      ...invoiceWithTotal,
      lines: [
        {
          id: lineId,
          type: 'GENERIC',
          description: 'Filtro de aire',
          notes: 'Para motor',
          quantity: '3.00',
          unitPrice: '125.00',
          taxable: true,
          gross: '375.00',
          base: '375.00',
          itbis: '0.00',
          acquisitionCostDop: '40.00',
          costProvenance: 'ESTIMATED',
          serviceId: null,
        },
      ],
    };
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/lines/${lineId}` && init?.method === 'PATCH') {
        return json(updatedInvoice);
      }
      if (String(path).startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (String(path) === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.setLinePrice({
      draftId,
      lineId,
      unitPrice: 125,
      quantity: 3,
      description: ' Filtro de aire ',
      notes: ' Para motor ',
    });

    expect(result.ok).toBe(true);
    const patchCalls = fetchMock.mock.calls.filter(
      ([path, init]) =>
        String(path) === `/api/sales/${draftId}/lines/${lineId}` && init?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(String((patchCalls[0]?.[1] as RequestInit).body))).toEqual({
      unitPrice: '125.00',
      quantity: '3.00',
      description: 'Filtro de aire',
      notes: 'Para motor',
    });
    if (result.ok) {
      expect(result.value.lines[0]?.description).toBe('Filtro de aire');
    }
  });

  it.each([
    {
      name: 'omits fields that were not supplied',
      input: { unitPrice: 125 },
      expectedBody: { unitPrice: '125.00' },
    },
    {
      name: 'normalizes blank notes',
      input: {
        unitPrice: 125.126,
        notes: '   ',
      },
      expectedBody: {
        unitPrice: '125.13',
        notes: null,
      },
    },
  ])('$name when PATCHing an editable line', async ({ input, expectedBody }) => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/lines/${lineId}` && init?.method === 'PATCH') {
        return json(invoiceWithTotal);
      }
      if (String(path).startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (String(path) === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.setLinePrice({ draftId, lineId, ...input });

    expect(result.ok).toBe(true);
    const patchInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(patchInit.body))).toEqual(expectedBody);
    expect(new Headers(patchInit.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it('serializes quantity and metadata PATCH requests with CSRF', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === `/api/sales/${draftId}/lines/${lineId}` && init?.method === 'PATCH') {
        return json(invoiceWithTotal);
      }
      if (url === `/api/sales/${draftId}` && init?.method === 'PATCH') {
        return json({ ...invoiceWithTotal, currency: 'USD', fiscal: true });
      }
      if (url.startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (url === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await repository.setLineQuantity({ draftId, lineId, quantity: 2.345 })).toMatchObject({
      ok: true,
    });
    expect(
      await repository.setDraftMeta({
        draftId,
        customerId: cashCustomer.id,
        currency: 'USD',
        fiscal: true,
      }),
    ).toMatchObject({ ok: true, value: { currency: 'USD', fiscal: true } });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String((patchCalls[0]?.[1] as RequestInit).body))).toEqual({
      quantity: '2.35',
    });
    expect(JSON.parse(String((patchCalls[1]?.[1] as RequestInit).body))).toEqual({
      customerId: cashCustomer.id,
      currency: 'USD',
      fiscal: true,
    });
    for (const [, init] of patchCalls) {
      expect(new Headers(init?.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    }
  });

  it('keeps a successful line mutation successful when auxiliary lookups fail', async () => {
    const withLine = {
      ...invoiceWithTotal,
      lines: [
        {
          id: lineId,
          type: 'GENERIC',
          description: 'Filtro',
          quantity: '1.00',
          unitPrice: '118.00',
          taxable: true,
          gross: '118.00',
          base: '100.00',
          itbis: '18.00',
          acquisitionCostDop: null,
          costProvenance: 'UNKNOWN',
          serviceId: null,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (String(path) === `/api/sales/${draftId}/lines` && init?.method === 'POST') {
          return json(withLine, 201);
        }
        return json({ error: { code: 'INTERNAL' } }, 503);
      }),
    );

    const result = await repository.addLine({
      draftId,
      type: 'GENERIC',
      description: 'Filtro',
      unitPrice: 118,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        customerId: cashCustomer.id,
        totals: { gross: 118 },
        customers: [{ id: cashCustomer.id }],
      },
    });
  });

  it('keeps a referenced service visible when it is absent from the active lookup', async () => {
    const invoiceWithMissingService = {
      ...emptyInvoice,
      lines: [
        {
          id: lineId,
          type: 'SERVICE',
          description: 'Servicio histórico',
          notes: null,
          quantity: '1.00',
          unitPrice: '100.00',
          taxable: true,
          gross: '100.00',
          base: '100.00',
          itbis: '0.00',
          acquisitionCostDop: null,
          costProvenance: null,
          serviceId: '99999999-9999-4999-8999-999999999999',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        const url = String(path);
        if (url === `/api/sales/${draftId}`) return json(invoiceWithMissingService);
        if (url.startsWith('/api/customers?')) {
          return json({
            items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
            total: 1,
            page: 1,
            pageSize: 10,
          });
        }
        if (url === '/api/catalogs/services') return json({ items: [] });
        throw new Error(`Unexpected ${path}`);
      }),
    );

    expect(await repository.getDraft(draftId)).toMatchObject({
      ok: true,
      value: {
        services: [{ id: '99999999-9999-4999-8999-999999999999', name: 'Servicio histórico' }],
      },
    });
  });

  it('maps an invoice fetch failure before attempting lookups', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await repository.getDraft(draftId)).toMatchObject({
      ok: false,
      error: { code: 'NETWORK' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'customers', failedPath: '/api/customers?' },
    { name: 'services', failedPath: '/api/catalogs/services' },
  ])(
    'returns an error when the $name lookup fails while loading a draft',
    async ({ failedPath }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string) => {
          const url = String(path);
          if (url === `/api/sales/${draftId}`) return json(emptyInvoice);
          if (url.startsWith('/api/customers?')) {
            return failedPath === '/api/customers?'
              ? json({ error: { code: 'INTERNAL' } }, 503)
              : json({
                  items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
                  total: 1,
                  page: 1,
                  pageSize: 10,
                });
          }
          if (url === '/api/catalogs/services') {
            return failedPath === url
              ? json({ error: { code: 'INTERNAL' } }, 503)
              : json({ items: [installation] });
          }
          throw new Error(`Unexpected ${path}`);
        }),
      );

      expect(await repository.getDraft(draftId)).toMatchObject({
        ok: false,
        error: { code: 'INTERNAL' },
      });
    },
  );

  it('translates a fiscal identity conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'CONFLICT',
              message: 'A fiscal invoice requires a customer with RNC or Cédula',
            },
          },
          409,
        ),
      ),
    );

    const result = await repository.setDraftMeta({ draftId, fiscal: true });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Una factura fiscal requiere un cliente con RNC o cédula.',
      },
    });
  });

  it('confirms with an empty CSRF body and maps FAC-', async () => {
    const confirmed = {
      ...invoiceWithTotal,
      status: 'COMPLETED',
      balance: '118.00',
      number: 'FAC-000001',
      customer: { ...cashCustomer, name: 'Nombre al confirmar' },
      confirmedAt: '2026-09-09T13:00:00.000Z',
      lines: [
        {
          id: lineId,
          type: 'GENERIC',
          description: 'Filtro',
          notes: null,
          quantity: '1.00',
          unitPrice: '118.00',
          taxable: true,
          gross: '118.00',
          base: '100.00',
          itbis: '18.00',
          acquisitionCostDop: null,
          costProvenance: 'UNKNOWN',
          serviceId: null,
        },
      ],
    };
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/confirm` && init?.method === 'POST') {
        return json(confirmed);
      }
      if (String(path).startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (String(path) === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.confirmInvoice(draftId, {
      amount: 50,
      method: 'CASH',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'COMPLETED',
        number: 'FAC-000001',
        customerName: 'Nombre al confirmar',
        currency: 'DOP',
        totals: { gross: 118, itbis: 18, taxableBase: 100 },
      },
    });
    const confirmInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(confirmInit.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(JSON.parse(String(confirmInit.body))).toEqual({
      payment: { amount: '50.00', method: 'CASH' },
    });
  });

  it.each([
    {
      name: 'without a payment',
      payment: undefined,
      expectedBody: {},
    },
    {
      name: 'with optional payment identity',
      payment: {
        amount: 50.126,
        method: 'TRANSFER' as const,
        reference: 'TRX-CONFIRM',
        idempotencyKey: 'confirm-key-1',
      },
      expectedBody: {
        payment: {
          amount: '50.13',
          method: 'TRANSFER',
          reference: 'TRX-CONFIRM',
          idempotencyKey: 'confirm-key-1',
        },
      },
    },
  ])('confirms $name using CSRF', async ({ payment, expectedBody }) => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/confirm` && init?.method === 'POST') {
        return json({ ...completedInvoice, number: 'FAC-000002' });
      }
      if (String(path).startsWith('/api/customers?')) {
        return json({
          items: [{ ...cashCustomer, address: null, notes: null, contacts: [] }],
          total: 1,
          page: 1,
          pageSize: 10,
        });
      }
      if (String(path) === '/api/catalogs/services') return json({ items: [installation] });
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await repository.confirmInvoice(draftId, payment)).toMatchObject({
      ok: true,
      value: { number: 'FAC-000002' },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(JSON.parse(String(init.body))).toEqual(expectedBody);
  });

  it.each([
    {
      name: 'with reference and idempotency key',
      input: {
        invoiceId: draftId,
        amount: 25.126,
        method: 'TRANSFER' as const,
        effectiveDate: '2026-09-10',
        reference: 'TRX-100',
        idempotencyKey: 'payment-key-1',
      },
      expectedBody: {
        amount: '25.13',
        method: 'TRANSFER',
        effectiveDate: '2026-09-10',
        reference: 'TRX-100',
        idempotencyKey: 'payment-key-1',
      },
    },
    {
      name: 'without optional fields',
      input: {
        invoiceId: draftId,
        amount: 18,
        method: 'CASH' as const,
        effectiveDate: '2026-09-11',
      },
      expectedBody: {
        amount: '18.00',
        method: 'CASH',
        effectiveDate: '2026-09-11',
      },
    },
  ])('adds a payment $name', async ({ input, expectedBody }) => {
    const payment = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      kind: 'PAYMENT',
      amount: expectedBody.amount,
      method: input.method,
      effectiveDate: input.effectiveDate,
      recordedAt: '2026-09-11T14:00:00.000Z',
      reference: input.reference ?? null,
      actorName: 'Ana Pérez',
    };
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/payments` && init?.method === 'POST') {
        return json({
          ...completedInvoice,
          payments: [payment],
          paid: expectedBody.amount,
          balance: '92.87',
        });
      }
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.addPayment(input);

    expect(result).toMatchObject({
      ok: true,
      value: {
        payments: [
          {
            amount: Number(expectedBody.amount),
            method: input.method,
            effectiveDate: input.effectiveDate,
            actorName: 'Ana Pérez',
          },
        ],
      },
    });
    if (result.ok) {
      expect(result.value.payments[0]?.reference).toBe(input.reference);
    }
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(expectedBody);
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it.each([
    {
      name: 'with refund data and idempotency key',
      input: {
        invoiceId: draftId,
        reason: 'Cliente devolvió las piezas',
        refundMethod: 'CHECK' as const,
        refundReference: 'CHK-200',
        idempotencyKey: 'cancel-key-1',
      },
      expectedBody: {
        reason: 'Cliente devolvió las piezas',
        refundMethod: 'CHECK',
        refundReference: 'CHK-200',
        idempotencyKey: 'cancel-key-1',
      },
    },
    {
      name: 'without optional refund fields',
      input: { invoiceId: draftId, reason: 'Factura duplicada' },
      expectedBody: { reason: 'Factura duplicada' },
    },
  ])('cancels an invoice $name', async ({ input, expectedBody }) => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/cancel` && init?.method === 'POST') {
        return json({
          ...completedInvoice,
          status: 'CANCELLED',
          paymentState: 'CANCELLED',
          cancelledAt: '2026-09-12T14:00:00.000Z',
          cancelReason: input.reason,
          cancelledByName: 'Ana Pérez',
          balance: '0.00',
        });
      }
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.cancelInvoice(input);

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'CANCELLED',
        paymentState: 'CANCELLED',
        cancelReason: input.reason,
        cancelledByName: 'Ana Pérez',
        actions: { canPay: false, canCancel: false },
      },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(expectedBody);
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it.each([
    [
      'payment',
      () =>
        repository.addPayment({
          invoiceId: draftId,
          amount: 10,
          method: 'CASH',
          effectiveDate: '2026-09-10',
        }),
    ],
    ['cancellation', () => repository.cancelInvoice({ invoiceId: draftId, reason: 'Duplicada' })],
  ])('maps a failed %s mutation to an application error', async (_name, mutate) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ error: { code: 'CONFLICT', message: 'Conflicto' } }, 409)),
    );

    expect(await mutate()).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('loads completed invoice detail from the snapshot with PDF ready and mapped profit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          ...invoiceWithTotal,
          status: 'COMPLETED',
          balance: '118.00',
          number: 'FAC-000002',
          currency: 'USD',
          customer: { ...cashCustomer, name: 'Snapshot', rnc: '131098765' },
          confirmedAt: '2026-09-09T13:00:00.000Z',
          profitability: {
            status: 'CALCULATED',
            reason: null,
            profitDop: '10.00',
            margin: '8.47',
          },
          document: { status: 'READY' },
          history: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              type: 'INVOICE_CONFIRMED',
              description: 'Factura FAC-000002 confirmada',
              createdAt: '2026-09-09T13:00:00.000Z',
              actorName: 'Ana Pérez',
            },
          ],
          lines: [
            {
              id: lineId,
              type: 'GENERIC',
              description: 'Filtro',
              notes: null,
              quantity: '1.00',
              unitPrice: '118.00',
              taxable: true,
              gross: '118.00',
              base: '100.00',
              itbis: '18.00',
              acquisitionCostDop: null,
              costProvenance: 'UNKNOWN',
              serviceId: null,
            },
          ],
        }),
      ),
    );

    const result = await repository.getInvoice(draftId);
    expect(result).toMatchObject({
      ok: true,
      value: {
        number: 'FAC-000002',
        status: 'COMPLETED',
        customerName: 'Snapshot',
        customerRnc: '131098765',
        currency: 'USD',
        total: 118,
        balance: 118,
        lines: [{ description: 'Filtro', itbis: 18, gross: 118 }],
        payments: [],
        history: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            type: 'INVOICE_CONFIRMED',
            description: 'Factura FAC-000002 confirmada',
            createdAt: '2026-09-09T13:00:00.000Z',
            actorName: 'Ana Pérez',
          },
        ],
        document: { status: 'READY' },
        profitability: {
          currency: 'DOP',
          profit: 10,
          pendingFx: false,
          source: 'CALCULATED',
        },
        actions: {
          canPay: true,
          canCancel: true,
          canCorrectCurrency: false,
          canViewPdf: true,
          canRegeneratePdf: false,
        },
      },
    });
    if (result.ok) {
      expect(result.value.profitability).toEqual({
        currency: 'DOP',
        profit: 10,
        pendingFx: false,
        source: 'CALCULATED',
      });
    }
  });

  it('maps a failed document so the seller can see the error and cannot download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          ...invoiceWithTotal,
          status: 'COMPLETED',
          balance: '118.00',
          number: 'FAC-000003',
          document: { status: 'FAILED', errorId: 'pdf-err-1' },
        }),
      ),
    );

    const result = await repository.getInvoice(draftId);
    expect(result).toMatchObject({
      ok: true,
      value: {
        document: { status: 'FAILED', errorId: 'pdf-err-1' },
        actions: { canViewPdf: false, canRegeneratePdf: true },
      },
    });
  });

  it('downloads invoice PDF bytes with the server filename', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn(
      async (_path: string, _init?: RequestInit) =>
        new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="FAC-000002.pdf"',
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.getInvoicePdf(draftId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filename).toBe('FAC-000002.pdf');
    expect(new Uint8Array(await result.value.blob.arrayBuffer())).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sales/${draftId}/pdf`,
      expect.objectContaining({ credentials: 'include' }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBeUndefined();
    expect(new Headers(init?.headers).get('X-Requested-With')).toBeNull();
  });

  it('surfaces a failed PDF download as a conflict without treating it as JSON success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'CONFLICT',
              message: 'La generación del PDF falló',
              errorId: 'pdf-err-1',
            },
          },
          409,
        ),
      ),
    );

    const result = await repository.getInvoicePdf(draftId);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'La generación del PDF falló', errorId: 'pdf-err-1' },
    });
  });

  it('regenerates a failed PDF with CSRF and an empty body', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (String(path) === `/api/sales/${draftId}/pdf/regenerate` && init?.method === 'POST') {
        return json({
          ...invoiceWithTotal,
          status: 'COMPLETED',
          balance: '118.00',
          number: 'FAC-000003',
          document: { status: 'READY' },
        });
      }
      throw new Error(`Unexpected ${path} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.regenerateInvoicePdf(draftId);
    expect(result).toMatchObject({
      ok: true,
      value: {
        number: 'FAC-000003',
        document: { status: 'READY' },
        actions: { canViewPdf: true, canRegeneratePdf: false },
      },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(JSON.parse(String(init.body))).toEqual({});
  });
});
