import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '../../../src/infrastructure/errors/app-error.js';
import {
  INVALID_JSON_CLIENT_MESSAGE,
  PAYLOAD_TOO_LARGE_CLIENT_MESSAGE,
  UNEXPECTED_ERROR_CLIENT_MESSAGE,
  UNSUPPORTED_MEDIA_TYPE_CLIENT_MESSAGE,
  VALIDATION_ERROR_CLIENT_MESSAGE,
  mapErrorToHttp,
} from '../../../src/infrastructure/errors/map-error.js';

const ERROR_ID = 'error-id-for-tests';

describe('mapErrorToHttp', () => {
  it('maps ZodError to 400 VALIDATION without errorId', () => {
    const schema = z.object({ name: z.string() }).strict();
    const parsed = schema.safeParse({ name: 1 });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    const mapped = mapErrorToHttp(parsed.error, ERROR_ID);

    expect(mapped.status).toBe(400);
    expect(mapped.isUnexpected).toBe(false);
    expect(mapped.body.error.code).toBe('VALIDATION');
    expect(mapped.body.error.message).toBe(VALIDATION_ERROR_CLIENT_MESSAGE);
    expect(mapped.body.error.errorId).toBeUndefined();
    expect(mapped.body.error.details).toEqual({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'name', message: expect.any(String) }),
      ]),
    });
  });

  it('maps invalid JSON SyntaxError to 400 VALIDATION', () => {
    const error = new SyntaxError('Unexpected token');
    Object.assign(error, { body: 'not-json', status: 400 });

    const mapped = mapErrorToHttp(error, ERROR_ID);

    expect(mapped).toEqual({
      status: 400,
      isUnexpected: false,
      body: {
        error: {
          code: 'VALIDATION',
          message: INVALID_JSON_CLIENT_MESSAGE,
        },
      },
    });
  });

  it('maps body-parser entity.too.large to 413 PAYLOAD_TOO_LARGE', () => {
    const error = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
      statusCode: 413,
    });

    const mapped = mapErrorToHttp(error, ERROR_ID);

    expect(mapped.status).toBe(413);
    expect(mapped.isUnexpected).toBe(false);
    expect(mapped.body.error).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: PAYLOAD_TOO_LARGE_CLIENT_MESSAGE,
    });
  });

  it.each(['charset.unsupported', 'encoding.unsupported'] as const)(
    'maps body-parser %s to 415 UNSUPPORTED_MEDIA_TYPE',
    (type) => {
      const error = Object.assign(new Error(type), {
        type,
        status: 415,
        statusCode: 415,
      });

      const mapped = mapErrorToHttp(error, ERROR_ID);

      expect(mapped.status).toBe(415);
      expect(mapped.isUnexpected).toBe(false);
      expect(mapped.body.error).toEqual({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: UNSUPPORTED_MEDIA_TYPE_CLIENT_MESSAGE,
      });
    },
  );

  it.each([
    {
      error: AppError.unauthorized(),
      status: 401,
      code: 'UNAUTHORIZED',
    },
    {
      error: AppError.forbidden(),
      status: 403,
      code: 'FORBIDDEN',
    },
    {
      error: AppError.notFound(),
      status: 404,
      code: 'NOT_FOUND',
    },
    {
      error: AppError.conflict('Username already exists'),
      status: 409,
      code: 'CONFLICT',
    },
    {
      error: AppError.validation('Invalid payload', { field: 'name' }),
      status: 400,
      code: 'VALIDATION',
    },
    {
      error: AppError.payloadTooLarge(),
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    },
    {
      error: AppError.unsupportedMediaType(),
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
    {
      error: AppError.tooManyRequests(),
      status: 429,
      code: 'TOO_MANY_REQUESTS',
    },
    {
      error: AppError.serviceUnavailable('Assistant is disabled', {
        reason: 'ASSISTANT_DISABLED',
      }),
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    },
  ] as const)('maps $code to HTTP $status without errorId', ({ error, status, code }) => {
    const mapped = mapErrorToHttp(error, ERROR_ID);

    expect(mapped.status).toBe(status);
    expect(mapped.isUnexpected).toBe(false);
    expect(mapped.body.error.code).toBe(code);
    expect(mapped.body.error.message).toBe(error.message);
    expect(mapped.body.error.errorId).toBeUndefined();
    expect(mapped.body.error.details).toEqual(error.details);
  });

  it('maps unexpected Error to 500 INTERNAL with errorId and generic message', () => {
    const mapped = mapErrorToHttp(new Error('secret database url leaked'), ERROR_ID);

    expect(mapped.status).toBe(500);
    expect(mapped.isUnexpected).toBe(true);
    expect(mapped.body).toEqual({
      error: {
        code: 'INTERNAL',
        message: UNEXPECTED_ERROR_CLIENT_MESSAGE,
        errorId: ERROR_ID,
      },
    });
  });

  it('maps AppError INTERNAL to generic 500 with errorId', () => {
    const mapped = mapErrorToHttp(AppError.internal('prisma timeout'), ERROR_ID);

    expect(mapped.body.error.message).toBe(UNEXPECTED_ERROR_CLIENT_MESSAGE);
    expect(mapped.body.error.errorId).toBe(ERROR_ID);
    expect(mapped.status).toBe(500);
  });
});
