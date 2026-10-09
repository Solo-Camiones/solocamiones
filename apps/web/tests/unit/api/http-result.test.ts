import { describe, expect, it } from 'vitest';

import { moneyString, request } from '../../../src/api/client/http-result';
import { HttpError } from '../../../src/api/client/http-client';

describe('moneyString', () => {
  it('formats amounts with two fixed decimals', () => {
    expect(moneyString(10)).toBe('10.00');
    expect(moneyString(10.5)).toBe('10.50');
    expect(moneyString(10.456)).toBe('10.46');
  });
});

describe('request', () => {
  it('wraps a successful operation in ok', async () => {
    const result = await request(async () => 42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('maps thrown HttpError into err', async () => {
    const result = await request(async () => {
      throw new HttpError(400, { code: 'VALIDATION', message: 'Boom' });
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Boom' },
    });
  });

  it('maps unexpected errors into a generic AppError', async () => {
    const result = await request(async () => {
      throw new Error('unexpected');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
  });
});
