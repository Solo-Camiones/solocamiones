import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  CSRF_REQUEST_HEADER,
  CSRF_REQUEST_HEADER_VALUE,
} from '../../../src/features/access/constants.js';
import { requireCsrfHeader } from '../../../src/features/access/require-csrf.js';
import { AppError } from '../../../src/infrastructure/errors/app-error.js';

describe('requireCsrfHeader', () => {
  it('accepts the configured header and rejects a missing value with 403', () => {
    const next = vi.fn();
    requireCsrfHeader(
      { get: () => CSRF_REQUEST_HEADER_VALUE } as unknown as Request,
      {} as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledWith();

    const rejected = vi.fn();
    requireCsrfHeader(
      {
        get: (name: string) => (name === CSRF_REQUEST_HEADER ? undefined : 'nope'),
      } as unknown as Request,
      {} as Response,
      rejected as NextFunction,
    );
    expect(rejected.mock.calls[0][0]).toMatchObject({
      code: 'FORBIDDEN',
      message: 'CSRF validation failed',
    });
    expect(rejected.mock.calls[0][0]).toBeInstanceOf(AppError);
  });
});
