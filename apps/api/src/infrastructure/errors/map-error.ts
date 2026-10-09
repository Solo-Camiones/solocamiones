import { z } from 'zod';

import { HTTP_STATUS_BY_ERROR_CODE, type AppErrorCode, isAppError } from './app-error.js';

export const UNEXPECTED_ERROR_CLIENT_MESSAGE = 'An unexpected error occurred';
export const VALIDATION_ERROR_CLIENT_MESSAGE = 'Request validation failed';
export const INVALID_JSON_CLIENT_MESSAGE = 'Invalid JSON payload';
export const PAYLOAD_TOO_LARGE_CLIENT_MESSAGE = 'Payload too large';
export const UNSUPPORTED_MEDIA_TYPE_CLIENT_MESSAGE = 'Unsupported media type';

const BODY_PARSER_PAYLOAD_TOO_LARGE_TYPE = 'entity.too.large';
const BODY_PARSER_UNSUPPORTED_MEDIA_TYPES = new Set([
  'charset.unsupported',
  'encoding.unsupported',
]);

export type MappedErrorResponse = {
  status: number;
  body: {
    error: {
      code: AppErrorCode;
      message: string;
      errorId?: string;
      details?: Record<string, unknown>;
    };
  };
  isUnexpected: boolean;
};

function validationDetailsFromZod(error: z.ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

function isExpressJsonSyntaxError(error: unknown): boolean {
  return error instanceof SyntaxError && 'body' in error;
}

function readErrorType(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return undefined;
  }

  return typeof error.type === 'string' ? error.type : undefined;
}

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  return undefined;
}

function clientErrorResponse(code: AppErrorCode, message: string): MappedErrorResponse {
  return {
    status: HTTP_STATUS_BY_ERROR_CODE[code],
    body: {
      error: {
        code,
        message,
      },
    },
    isUnexpected: false,
  };
}

function mapBodyParserClientError(error: unknown): MappedErrorResponse | undefined {
  const type = readErrorType(error);
  const status = readErrorStatus(error);

  if (
    type === BODY_PARSER_PAYLOAD_TOO_LARGE_TYPE ||
    status === HTTP_STATUS_BY_ERROR_CODE.PAYLOAD_TOO_LARGE
  ) {
    return clientErrorResponse('PAYLOAD_TOO_LARGE', PAYLOAD_TOO_LARGE_CLIENT_MESSAGE);
  }

  if (
    (type !== undefined && BODY_PARSER_UNSUPPORTED_MEDIA_TYPES.has(type)) ||
    status === HTTP_STATUS_BY_ERROR_CODE.UNSUPPORTED_MEDIA_TYPE
  ) {
    return clientErrorResponse('UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED_MEDIA_TYPE_CLIENT_MESSAGE);
  }

  return undefined;
}

/**
 * Maps unknown failures to a client-safe HTTP envelope.
 * Only unexpected (500) responses include errorId; 4xx never leak stacks.
 */
export function mapErrorToHttp(error: unknown, errorId: string): MappedErrorResponse {
  if (error instanceof z.ZodError) {
    return {
      status: HTTP_STATUS_BY_ERROR_CODE.VALIDATION,
      body: {
        error: {
          code: 'VALIDATION',
          message: VALIDATION_ERROR_CLIENT_MESSAGE,
          details: validationDetailsFromZod(error),
        },
      },
      isUnexpected: false,
    };
  }

  if (isExpressJsonSyntaxError(error)) {
    return clientErrorResponse('VALIDATION', INVALID_JSON_CLIENT_MESSAGE);
  }

  const bodyParserClientError = mapBodyParserClientError(error);
  if (bodyParserClientError) {
    return bodyParserClientError;
  }

  if (isAppError(error) && error.code !== 'INTERNAL') {
    return {
      status: HTTP_STATUS_BY_ERROR_CODE[error.code],
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      isUnexpected: false,
    };
  }

  return {
    status: HTTP_STATUS_BY_ERROR_CODE.INTERNAL,
    body: {
      error: {
        code: 'INTERNAL',
        message: UNEXPECTED_ERROR_CLIENT_MESSAGE,
        errorId,
      },
    },
    isUnexpected: true,
  };
}
