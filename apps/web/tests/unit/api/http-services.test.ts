import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpServiceRepository as repository } from '../../../src/api/http/repositories';

const installation = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Instalación',
  description: 'En bahía',
  active: true,
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

const diagnosis = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Diagnóstico',
  description: null,
  active: false,
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('HTTP mechanical service catalog contract', () => {
  it('lists services and drops catalog description from the UI model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ items: [installation, diagnosis] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.list();

    expect(result).toEqual({
      ok: true,
      value: [
        { id: installation.id, name: 'Instalación', active: true },
        { id: diagnosis.id, name: 'Diagnóstico', active: false },
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/catalogs/services');
    expect(fetchMock.mock.calls[0]?.[1].credentials).toBe('include');
    if (result.ok) {
      expect(result.value[0]).not.toHaveProperty('description');
      expect(result.value[0]).not.toHaveProperty('price');
    }
  });

  it('creates with POST and sends only changed fields in PATCH requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(installation, 201));
    vi.stubGlobal('fetch', fetchMock);

    await repository.save({ name: 'Instalación', active: true });
    await repository.save({ id: installation.id, name: 'Instalación mecánica' });
    await repository.save({ id: installation.id, active: false });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/catalogs/services');
    expect(fetchMock.mock.calls[0]?.[1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      name: 'Instalación',
      active: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/catalogs/services/${installation.id}`);
    expect(fetchMock.mock.calls[1]?.[1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toEqual({
      name: 'Instalación mecánica',
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/catalogs/services/${installation.id}`);
    expect(fetchMock.mock.calls[2]?.[1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1].body)).toEqual({ active: false });
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(JSON.parse(init.body)).not.toHaveProperty('id');
      expect(JSON.parse(init.body)).not.toHaveProperty('description');
    }
  });

  it('translates a missing name without exposing the English envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'VALIDATION',
              message: 'Request validation failed',
              details: { issues: [{ path: 'name', message: 'Name is required' }] },
            },
          },
          400,
        ),
      ),
    );

    const result = await repository.save({ name: '   ', active: true });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'El nombre es obligatorio.',
        details: { issues: [{ path: 'name' }] },
      },
    });
    if (!result.ok) {
      expect(result.error.message).not.toMatch(/Name is required|Request validation/i);
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
