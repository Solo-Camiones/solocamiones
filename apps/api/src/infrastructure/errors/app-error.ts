export const APP_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const HTTP_STATUS_BY_ERROR_CODE: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('VALIDATION', message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, details);
  }

  static payloadTooLarge(message = 'Payload too large'): AppError {
    return new AppError('PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMediaType(message = 'Unsupported media type'): AppError {
    return new AppError('UNSUPPORTED_MEDIA_TYPE', message);
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError('TOO_MANY_REQUESTS', message);
  }

  static serviceUnavailable(
    message = 'Service temporarily unavailable',
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError('SERVICE_UNAVAILABLE', message, details);
  }

  static internal(message = 'An unexpected error occurred'): AppError {
    return new AppError('INTERNAL', message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
