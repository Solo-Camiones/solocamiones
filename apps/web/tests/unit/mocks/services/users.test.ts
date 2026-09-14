import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInitialState } from '../../../../src/mocks/data/seed';
import {
  getInitialPassword,
  nextUserId,
  prepareUserSave,
  toManagedUser,
} from '../../../../src/mocks/services/users';

describe('prepareUserSave', () => {
  const seedUsers = createInitialState().users;
  const adminId = 'U-ADMIN';

  it('creates a seller with a generated id and server-assigned password', () => {
    expect(nextUserId(seedUsers, 'maria')).toBe('U-MARIA');

    const result = prepareUserSave(
      seedUsers,
      {
        name: '  María López  ',
        username: 'Maria',
        role: 'SELLER',
        active: true,
        phone: '809-555-0900',
      },
      adminId,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        id: 'U-MARIA',
        name: 'María López',
        username: 'maria',
        password: getInitialPassword(),
        mustChangePassword: true,
        role: 'SELLER',
        active: true,
        phone: '809-555-0900',
      });
      expect(toManagedUser(result.value)).not.toHaveProperty('password');
    }
  });

  it('creates without accepting a password from the administrator', () => {
    const created = prepareUserSave(
      seedUsers,
      {
        name: 'Ana',
        username: 'ana',
        role: 'SELLER',
        active: true,
      },
      adminId,
    );

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.password).toBe(getInitialPassword());
      expect(created.value.mustChangePassword).toBe(true);
    }
  });

  it('rejects a duplicate username regardless of case', () => {
    const result = prepareUserSave(
      seedUsers,
      {
        name: 'Otro',
        username: 'LAURA',
        role: 'SELLER',
        active: true,
      },
      adminId,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('keeps the current password when editing without a new one', () => {
    const result = prepareUserSave(
      seedUsers,
      {
        id: 'U-LAURA',
        name: 'Laura Pérez',
        username: 'laura',
        role: 'SELLER',
        active: true,
        phone: '809-555-0109',
      },
      adminId,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.password).toBe('demo1234');
      expect(result.value.phone).toBe('809-555-0109');
    }
  });

  it('prevents self-deactivation and leaving the last active administrator', () => {
    const self = prepareUserSave(
      seedUsers,
      {
        id: 'U-ADMIN',
        name: 'Administrador Demo',
        username: 'admin',
        role: 'ADMINISTRATOR',
        active: false,
      },
      adminId,
    );

    expect(self.ok).toBe(false);
    if (!self.ok) {
      expect(self.error.message).toContain('propia cuenta');
    }

    const demote = prepareUserSave(
      seedUsers,
      {
        id: 'U-ADMIN',
        name: 'Administrador Demo',
        username: 'admin',
        role: 'SELLER',
        active: true,
      },
      'U-LAURA',
    );

    expect(demote.ok).toBe(false);
    if (!demote.ok) {
      expect(demote.error.message).toContain('administrador activo');
    }
  });

  it('reactivates Carlos without inventing a password change', () => {
    const result = prepareUserSave(
      seedUsers,
      {
        id: 'U-CARLOS',
        name: 'Carlos Méndez',
        username: 'carlos',
        role: 'MECHANIC',
        active: true,
      },
      adminId,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.active).toBe(true);
      expect(result.value.password).toBe('demo1234');
    }
  });
});

describe('INITIAL_PASSWORD configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the value when creating users, not when the module is imported', () => {
    vi.stubEnv('INITIAL_PASSWORD', 'assigned-once');
    expect(getInitialPassword()).toBe('assigned-once');
  });

  it('fails only when the password is actually needed', () => {
    vi.stubEnv('INITIAL_PASSWORD', '');
    expect(() => getInitialPassword()).toThrow('INITIAL_PASSWORD is required');
  });
});
