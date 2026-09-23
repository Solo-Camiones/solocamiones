import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from 'openai';

import { AssistantProviderError } from './errors.js';

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
    return AssistantProviderError.rateLimit(undefined, error);
  }

  if (error instanceof InternalServerError) {
    return AssistantProviderError.unavailable('OpenAI returned a server error', error);
  }

  if (error instanceof APIError) {
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
