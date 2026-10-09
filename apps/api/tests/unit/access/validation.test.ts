import { describe, expect, it } from 'vitest';

import {
  loginBodySchema,
  updateOwnProfileBodySchema,
} from '../../../src/features/access/validation.js';

describe('loginBodySchema', () => {
  it('normalizes username and keeps the password unmodified', () => {
    expect(loginBodySchema.parse({ username: '  Ana.Perez ', password: ' AbC12 ' })).toEqual({
      username: 'ana.perez',
      password: ' AbC12 ',
    });
  });

  it('accepts a short password so failed logins stay generic', () => {
    expect(loginBodySchema.parse({ username: 'seller', password: '123' }).password).toBe('123');
  });

  it.each([
    { username: 'seller', password: 'secret', role: 'ADMINISTRATOR' },
    { username: '' },
    {},
  ])('rejects extra or invalid fields: %j', (body) => {
    expect(loginBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('updateOwnProfileBodySchema', () => {
  it('accepts contact updates and rejects account-administration fields', () => {
    expect(
      updateOwnProfileBodySchema.parse({
        name: '  Ana  ',
        phone: ' ',
        email: 'ana@example.com',
      }),
    ).toEqual({
      name: 'Ana',
      phone: null,
      email: 'ana@example.com',
    });

    expect(
      updateOwnProfileBodySchema.safeParse({
        name: 'Ana',
        username: 'injected',
        role: 'ADMINISTRATOR',
        active: false,
      }).success,
    ).toBe(false);
  });

  it('requires current and new password together and enforces minimum length', () => {
    expect(updateOwnProfileBodySchema.safeParse({ name: 'Ana', password: '123456' }).success).toBe(
      false,
    );
    expect(
      updateOwnProfileBodySchema.safeParse({ name: 'Ana', currentPassword: 'old-password' })
        .success,
    ).toBe(false);
    expect(
      updateOwnProfileBodySchema.safeParse({
        name: 'Ana',
        currentPassword: 'old-password',
        password: '12345',
      }).success,
    ).toBe(false);
    expect(
      updateOwnProfileBodySchema.parse({
        name: 'Ana',
        currentPassword: 'old-password',
        password: '123456',
      }),
    ).toMatchObject({ password: '123456', currentPassword: 'old-password' });
  });
});
