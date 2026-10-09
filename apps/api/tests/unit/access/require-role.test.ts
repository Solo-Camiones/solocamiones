import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { INSUFFICIENT_PERMISSIONS_MESSAGE } from '../../../src/features/access/constants.js';
import { requireAdministrator, requireRole } from '../../../src/features/access/require-role.js';
import { AppError } from '../../../src/infrastructure/errors/app-error.js';

function authRequest(role: 'ADMINISTRATOR' | 'SELLER' | 'MECHANIC'): Request {
  return { auth: { role } } as Request;
}

describe('requireRole', () => {
  it('rejects a missing session with 401 before evaluating the role', () => {
    const next = vi.fn();
    requireRole('ADMINISTRATOR')({} as Request, {} as Response, next as NextFunction);

    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects Seller and Mechanic on an administrator-only gate with 403', () => {
    for (const role of ['SELLER', 'MECHANIC'] as const) {
      const next = vi.fn();
      requireAdministrator(authRequest(role), {} as Response, next as NextFunction);

      expect(next.mock.calls[0][0]).toMatchObject({
        code: 'FORBIDDEN',
        message: INSUFFICIENT_PERMISSIONS_MESSAGE,
      });
    }
  });

  it('allows an Administrator through requireAdministrator', () => {
    const next = vi.fn();
    requireAdministrator(authRequest('ADMINISTRATOR'), {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows any listed role', () => {
    const next = vi.fn();
    requireRole('SELLER', 'ADMINISTRATOR')(
      authRequest('SELLER'),
      {} as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledWith();
  });
});
