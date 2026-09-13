import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpUserRepository as repository } from '../../../src/api/http/repositories';

const userResponse = {
  id: 'user-id',
  name: 'María López',
  username: 'maria',
  role: 'SELLER',
  active: true,
  mustChangePassword: true,
  phone: null,
  email: 'maria@example.com',
  createdAt: '2026-09-07T01:00:00.000Z',
  updatedAt: '2026-09-07T01:00:00.000Z',
  passwordHash: 'must-not-cross-the-adapter',
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('HTTP user management contract', () => {
  it('loads one API page and maps only public user fields', async () => {
    const second = { ...userResponse, id: 'second-id', username: 'ana', name: 'Ana' };
    const fetchMock = vi.fn().mockResolvedValue(
      json({ items: [userResponse, second], total: 12, page: 1, pageSize: 10 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await repository.list();

    expect(result).toMatchObject({
      ok: true,
      value: { items: [{ id: 'user-id' }, { id: 'second-id' }], total: 12, page: 1, pageSize: 10 },
    });
    if (result.ok) expect(result.value.items[0]).not.toHaveProperty('passwordHash');
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/admin/users?page=1&pageSize=10',
    ]);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('creates without credentials and updates with PATCH', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ ...userResponse, initialPassword: 'assigned-once' }))
      .mockResolvedValueOnce(json(userResponse));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      name: 'María López',
      username: 'maria',
      role: 'SELLER' as const,
      active: true,
      phone: '',
      email: 'maria@example.com',
    };

    const created = await repository.save(input);
    expect(created).toMatchObject({
      ok: true,
      value: { id: 'user-id', initialPassword: 'assigned-once' },
    });
    if (created.ok) expect(created.value).not.toHaveProperty('passwordHash');
    const patched = await repository.save({ ...input, id: 'user-id', active: false });
    expect(patched).toMatchObject({ ok: true, value: { id: 'user-id' } });
    if (patched.ok) expect(patched.value.initialPassword).toBeUndefined();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/users');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'María López',
      username: 'maria',
      role: 'SELLER',
      phone: '',
      email: 'maria@example.com',
    });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/users/user-id');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(JSON.parse(init.body)).not.toHaveProperty('id');
      expect(JSON.parse(init.body)).not.toHaveProperty('password');
    }
  });

  it('lists pending recoveries without copying unexpected user fields', async () => {
    const recovery = {
      id: 'request-id',
      userId: 'user-id',
      status: 'PENDING',
      createdAt: '2026-09-07T01:00:00.000Z',
      expiresAt: '2026-09-08T01:00:00.000Z',
      resolvedAt: null,
      resolvedById: null,
      identityVerified: false,
      user: { ...userResponse, passwordHash: 'must-not-cross-the-adapter' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ items: [recovery], total: 1, page: 1, pageSize: 10 })),
    );

    const result = await repository.listRecoveryRequests();

    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 'request-id', user: { id: 'user-id' } }],
    });
    if (result.ok) expect(result.value[0]?.user).not.toHaveProperty('passwordHash');
  });

  it('approves with verified identity, returns the temporary password once, and rejects without it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ request: { id: 'request-id' }, temporaryPassword: 'temporary' }),
      )
      .mockResolvedValueOnce(json({ request: { id: 'request-id' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await repository.resolveRecovery({
        requestId: 'request-id',
        action: 'approve',
        identityVerified: true,
      }),
    ).toEqual({ ok: true, value: { temporaryPassword: 'temporary' } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'approve',
      identityVerified: true,
    });

    expect(await repository.resolveRecovery({ requestId: 'request-id', action: 'reject' })).toEqual(
      { ok: true, value: {} },
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'reject' });
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
