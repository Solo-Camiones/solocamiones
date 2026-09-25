import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from 'openai';

import { AssistantProviderError } from './errors.js';

/**
 * Streaming Responses can surface billing exhaustion as a bare APIError
 * without HTTP status (create() succeeds, then the stream fails mid-flight).
 * Non-streaming uses RateLimitError/429 for the same condition.
 */
const OPENAI_INSUFFICIENT_QUOTA_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted']);

export function mapOpenAiError(error: unknown): AssistantProviderError {
  if (error instanceof AssistantProviderError) {
    return error;
  }

  if (error instanceof APIUserAbortError) {
    return AssistantProviderError.timeout('OpenAI request was aborted', error);
  }

  if (error instanceof APIConnectionTimeoutError) {
    return AssistantProviderError.timeout('OpenAI request timed out', error);
  }

  if (error instanceof AuthenticationError) {
    return AssistantProviderError.auth(undefined, error);
  }

  if (error instanceof RateLimitError) {
    if (isOpenAiInsufficientQuotaError(error)) {
      return openAiQuotaExhaustedError(error);
    }
    return AssistantProviderError.rateLimit(undefined, error);
  }

  if (error instanceof InternalServerError) {
    return AssistantProviderError.unavailable('OpenAI returned a server error', error);
  }

  if (error instanceof APIError) {
    if (isOpenAiInsufficientQuotaError(error)) {
      return openAiQuotaExhaustedError(error);
    }
    if (error.status === 401 || error.status === 403) {
      return AssistantProviderError.auth(undefined, error);
    }
    if (error.status === 429) {
      return AssistantProviderError.rateLimit(undefined, error);
    }
    if (error.status != null && error.status >= 500) {
      return AssistantProviderError.unavailable('OpenAI returned a server error', error);
    }
    return AssistantProviderError.invalidResponse('OpenAI returned an unexpected error', error);
  }

  if (isAbortLike(error)) {
    return AssistantProviderError.timeout('OpenAI request was aborted', error);
  }

  return AssistantProviderError.unavailable('OpenAI request failed', error);
}

function isOpenAiInsufficientQuotaError(error: APIError): boolean {
  return (
    OPENAI_INSUFFICIENT_QUOTA_CODES.has(String(error.code ?? '')) ||
    OPENAI_INSUFFICIENT_QUOTA_CODES.has(String(error.type ?? ''))
  );
}

function openAiQuotaExhaustedError(cause: APIError): AssistantProviderError {
  // Not retryable: adding credits / raising org quota is required before retry helps.
  return new AssistantProviderError('RATE_LIMIT', 'OpenAI quota or credits exhausted', {
    retryable: false,
    cause,
  });
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'APIUserAbortError')
  );
}

/** Strip secrets from free-text before logging. Never log prompts or payloads. */
export function redactSecret(text: string, secret: string | undefined): string {
  if (secret == null || secret.length === 0) return text;
  return text.split(secret).join('[Redacted]');
}
