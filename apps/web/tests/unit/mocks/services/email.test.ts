import { describe, expect, it } from 'vitest';

import { isValidEmail } from '../../../../src/mocks/services/email';

describe('isValidEmail', () => {
  it('accepts a local part, one @, and a domain with an internal dot', () => {
    expect(isValidEmail('maria@example.com')).toBe(true);
    expect(isValidEmail('a@b.c.d')).toBe(true);
  });

  it('rejects missing @, extra @, whitespace, and domains without an internal dot', () => {
    expect(isValidEmail('no-es-correo')).toBe(false);
    expect(isValidEmail('a@b@c.com')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a@b.')).toBe(false);
    expect(isValidEmail('a@.b')).toBe(false);
  });
});
