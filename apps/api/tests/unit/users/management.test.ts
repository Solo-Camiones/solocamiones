import { afterEach, describe, expect, it, vi } from 'vitest';

import { getInitialPassword } from '../../../src/features/users/service.js';
import {
  assertAdministrator,
  assertPasswordChanged,
} from '../../../src/features/users/policies.js';
import {
  createAdministrativeUserSchema,
  createUserSchema,
  paginationSchema,
  recoveryResolutionSchema,
  updateAdministrativeUserSchema,
} from '../../../src/features/users/validation.js';

describe('M8 input boundaries and service policies', () => {
  it('keeps bootstrap password input separate from administrative creation', () => {
    const profile = { name: ' Name ', username: ' USER ', role: 'SELLER' };
    expect(createAdministrativeUserSchema.parse(profile)).toMatchObject({
      name: 'Name',
      username: 'user',
    });
    expect(createUserSchema.safeParse(profile).success).toBe(false);
    expect(createUserSchema.safeParse({ ...profile, password: 'secret-password' }).success).toBe(
      true,
    );
  });

  it.each(['password', 'currentPassword', 'passwordHash', 'mustChangePassword', 'id', 'createdAt'])(
    'rejects administrative injection of %s',
    (field) => {
      const input = { name: 'N', username: 'u', role: 'SELLER', [field]: 'injected' };
      expect(createAdministrativeUserSchema.safeParse(input).success).toBe(false);
      expect(updateAdministrativeUserSchema.safeParse({ [field]: 'injected' }).success).toBe(false);
    },
  );

  it('preserves omitted patch fields and normalizes explicit contact clearing', () => {
    expect(updateAdministrativeUserSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateAdministrativeUserSchema.parse({ phone: ' ', email: '' })).toEqual({
      phone: null,
      email: null,
    });
    expect(updateAdministrativeUserSchema.safeParse({}).success).toBe(false);
    expect(updateAdministrativeUserSchema.safeParse({ email: 'invalid' }).success).toBe(false);
  });

  it('bounds pagination and requires explicit verification only for approval', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    for (const input of [{ page: 0 }, { page: 'NaN' }, { page: 1.5 }, { pageSize: 101 }]) {
      expect(paginationSchema.safeParse(input).success).toBe(false);
    }
    expect(recoveryResolutionSchema.safeParse({ action: 'approve' }).success).toBe(false);
    expect(
      recoveryResolutionSchema.safeParse({ action: 'approve', identityVerified: false }).success,
    ).toBe(false);
    expect(
      recoveryResolutionSchema.safeParse({ action: 'approve', identityVerified: true }).success,
    ).toBe(true);
    expect(recoveryResolutionSchema.safeParse({ action: 'reject' }).success).toBe(true);
  });

  it('rejects inactive and wrong-role actors, and checks change-required state independently of role', () => {
    expect(() => assertAdministrator(null)).toThrow('Authentication required');
    expect(() =>
      assertAdministrator({ active: false, role: 'ADMINISTRATOR', mustChangePassword: false }),
    ).toThrow('Authentication required');
    for (const role of ['SELLER', 'MECHANIC'] as const) {
      expect(() => assertAdministrator({ active: true, role, mustChangePassword: false })).toThrow(
        'Insufficient permissions',
      );
    }
    expect(() =>
      assertAdministrator({ active: true, role: 'ADMINISTRATOR', mustChangePassword: true }),
    ).toThrow('Password change required');
    expect(() => assertPasswordChanged({ mustChangePassword: false })).not.toThrow();
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
    delete process.env.INITIAL_PASSWORD;
    expect(() => getInitialPassword()).toThrow('INITIAL_PASSWORD is required');
  });
});
