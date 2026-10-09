import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockAuthRepository } from '../../../../src/mocks/repositories/MockAuthRepository';
import { getSession, setSession } from '../../../../src/mocks/session';
import { getMockState, resetMockState } from '../../../../src/mocks/state';

describe('MockAuthRepository', () => {
  beforeEach(() => {
    resetMockState();
  });

  afterEach(() => {
    resetMockState();
  });

  it('normalizes the username and creates a session for valid credentials', async () => {
    const result = await mockAuthRepository.login('  ADMIN  ', 'demo1234');

    expect(result.ok).toBe(true);
    expect(getSession()?.userId).toBe('U-ADMIN');
    const currentUser = await mockAuthRepository.getCurrentUser();
    expect(currentUser.ok && currentUser.value?.role).toBe('ADMINISTRATOR');
  });

  it('rejects invalid credentials without creating a session', async () => {
    const result = await mockAuthRepository.login('admin', 'incorrecta');

    expect(result.ok).toBe(false);
    expect(getSession()).toBeNull();
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects an inactive account', async () => {
    const result = await mockAuthRepository.login('carlos', 'demo1234');

    expect(result.ok).toBe(false);
    expect(getSession()).toBeNull();
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('clears an invalid session while resolving the current user', async () => {
    setSession({ userId: 'U-NOT-FOUND', createdAt: '2026-08-25T16:00:00.000Z' });

    const result = await mockAuthRepository.getCurrentUser();

    expect(result).toEqual({ ok: true, value: null });
    expect(getSession()).toBeNull();
  });

  it('clears the session on logout', async () => {
    await mockAuthRepository.login('laura', 'demo1234');

    await mockAuthRepository.logout();

    expect(getSession()).toBeNull();
  });

  it('lets a logged-in seller update their own phone', async () => {
    await mockAuthRepository.login('laura', 'demo1234');

    const result = await mockAuthRepository.updateOwnProfile({
      name: 'Laura Pérez',
      phone: '809-555-7777',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phone).toBe('809-555-7777');
      expect(result.value).not.toHaveProperty('password');
      expect(result.value.id).toBe('U-LAURA');
    }
  });

  it('lets a mechanic update their own profile', async () => {
    await mockAuthRepository.login('pedro', 'demo1234');

    const result = await mockAuthRepository.updateOwnProfile({
      name: 'Pedro S.',
      email: 'pedro@example.com',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Pedro S.');
      expect(result.value.email).toBe('pedro@example.com');
      expect(result.value.role).toBe('MECHANIC');
    }
  });

  it('rejects an unauthenticated profile update', async () => {
    const result = await mockAuthRepository.updateOwnProfile({
      name: 'Intruso',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('ignores a client-supplied userId and only mutates the session user', async () => {
    await mockAuthRepository.login('laura', 'demo1234');

    const result = await mockAuthRepository.updateOwnProfile({
      name: 'Laura Actualizada',
      userId: 'U-ADMIN',
    } as never);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('U-LAURA');
      expect(result.value.name).toBe('Laura Actualizada');
    }

    const admin = getMockState().users.find((entry) => entry.id === 'U-ADMIN');
    expect(admin?.name).toBe('Administrador Demo');
  });
});
