import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpCustomerRepository as repository } from '../../../src/api/http/repositories';

const cashCustomer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cliente contado',
  rnc: null,
  address: null,
  notes: null,
  isDefault: true,
  contacts: [],
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const namedCustomer = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Flota Este',
  rnc: '131456789',
  address: 'Av. Principal',
  notes: null,
  isDefault: false,
  contacts: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'María Reyes',
      phone: '809-555-0100',
      email: 'maria@example.com',
      title: 'Compras',
      isPrimary: true,
    },
  ],
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('HTTP customer management contract', () => {
  it('loads every API page and maps null optional fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [cashCustomer], total: 2, page: 1, pageSize: 10 }))
      .mockResolvedValueOnce(json({ items: [namedCustomer], total: 2, page: 2, pageSize: 10 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.list();

    expect(result).toMatchObject({
      ok: true,
      value: [
        { id: cashCustomer.id, name: 'Cliente contado', isDefault: true, contacts: [] },
        { id: namedCustomer.id, name: 'Flota Este', rnc: '131456789' },
      ],
    });
    if (result.ok) {
      expect(result.value[0]).not.toHaveProperty('invoiceCount');
      expect(result.value[0]?.rnc).toBeUndefined();
    }
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/customers?page=1&pageSize=10',
      '/api/customers?page=2&pageSize=10',
    ]);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('searches with q and loads a customer by id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [namedCustomer], total: 1, page: 1, pageSize: 10 }))
      .mockResolvedValueOnce(json(namedCustomer));
    vi.stubGlobal('fetch', fetchMock);

    expect(await repository.search('  Este  ')).toMatchObject({
      ok: true,
      value: { items: [{ id: namedCustomer.id }], total: 1, page: 1 },
    });
    expect(await repository.getById(namedCustomer.id)).toMatchObject({
      ok: true,
      value: { id: namedCustomer.id, name: 'Flota Este' },
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/customers?page=1&pageSize=10&q=Este');
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/customers/${namedCustomer.id}`);
  });

  it('creates with POST and updates with PATCH plus CSRF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(namedCustomer, 201));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      name: 'Flota Este',
      rnc: '131-45678-9',
      contacts: [
        {
          name: 'María Reyes',
          phone: '809-555-0100',
          email: 'maria@example.com',
          title: 'Compras',
          isPrimary: true,
        },
      ],
    };

    await repository.save(input);
    await repository.save({ ...input, id: namedCustomer.id, notes: 'Cuenta corporativa' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/customers');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Flota Este',
      rnc: '131-45678-9',
      contacts: [
        {
          name: 'María Reyes',
          phone: '809-555-0100',
          email: 'maria@example.com',
          title: 'Compras',
          isPrimary: true,
        },
      ],
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/customers/${namedCustomer.id}`);
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(JSON.parse(init.body)).not.toHaveProperty('id');
      expect(JSON.parse(init.body)).not.toHaveProperty('isDefault');
    }
  });

  it('translates fiscal validation issues without exposing the English envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'VALIDATION',
              message: 'Request validation failed',
              details: {
                issues: [
                  {
                    path: 'rnc',
                    message: 'Fiscal identifier must be a 9-digit RNC or 11-digit Cédula',
                  },
                ],
              },
            },
          },
          400,
        ),
      ),
    );

    const result = await repository.save({ name: 'Flota Este', rnc: '123' });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Debe ser un RNC de 9 dígitos o una cédula de 11 dígitos.',
        details: {
          issues: [{ path: 'rnc' }],
        },
      },
    });
    if (!result.ok) {
      expect(result.error.message).not.toMatch(/Fiscal|Request validation/i);
    }
  });

  it.each([400, 403, 409, 500])('preserves a structured failure with status %i', async (status) => {
    const code = (
      { 400: 'VALIDATION', 403: 'FORBIDDEN', 409: 'CONFLICT', 500: 'INTERNAL' } as Record<
        number,
        string
      >
    )[status];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ error: { code, errorId: 'reference' } }, status)),
    );

    expect(await repository.list()).toMatchObject({ ok: false, error: { code } });
  });
});
