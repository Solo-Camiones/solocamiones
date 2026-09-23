export const ASSISTANT_PROVIDER_ERROR_CODES = [
  'AUTH',
  'RATE_LIMIT',
  'TIMEOUT',
  'UNAVAILABLE',
  'INVALID_RESPONSE',
  'DISABLED',
] as const;

export type AssistantProviderErrorCode = (typeof ASSISTANT_PROVIDER_ERROR_CODES)[number];

/**
 * Provider-facing failures stay inside the OpenAI adapter boundary.
 * HTTP mapping (503 ASSISTANT_DISABLED, etc.) belongs to later milestones.
 */
export class AssistantProviderError extends Error {
  readonly code: AssistantProviderErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: AssistantProviderErrorCode,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = 'AssistantProviderError';
    this.code = code;
    this.retryable = options?.retryable ?? isRetryableByDefault(code);
    this.cause = options?.cause;
  }

  static auth(message = 'OpenAI authentication failed', cause?: unknown): AssistantProviderError {
    return new AssistantProviderError('AUTH', message, { retryable: false, cause });
  }

  static rateLimit(message = 'OpenAI rate limit exceeded', cause?: unknown): AssistantProviderError {
    return new AssistantProviderError('RATE_LIMIT', message, { retryable: true, cause });
  }

  static timeout(message = 'OpenAI request timed out', cause?: unknown): AssistantProviderError {
    return new AssistantProviderError('TIMEOUT', message, { retryable: true, cause });
  }

  static unavailable(message = 'OpenAI unavailable', cause?: unknown): AssistantProviderError {
    return new AssistantProviderError('UNAVAILABLE', message, { retryable: true, cause });
  }

  static invalidResponse(
    message = 'OpenAI returned an invalid response',
    cause?: unknown,
  ): AssistantProviderError {
    return new AssistantProviderError('INVALID_RESPONSE', message, { retryable: false, cause });
  }

  static disabled(message = 'Assistant is disabled'): AssistantProviderError {
    return new AssistantProviderError('DISABLED', message, { retryable: false });
  }
}

export function isAssistantProviderError(error: unknown): error is AssistantProviderError {
  return error instanceof AssistantProviderError;
}

function isRetryableByDefault(code: AssistantProviderErrorCode): boolean {
  return code === 'RATE_LIMIT' || code === 'TIMEOUT' || code === 'UNAVAILABLE';
}
