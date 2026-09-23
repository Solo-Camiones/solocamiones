import OpenAI from 'openai';

import type { AssistantConfig } from './config.js';
import { AssistantProviderError } from './errors.js';

export type OpenAiClientFactoryOptions = {
  /** Override for tests. Production uses the official OpenAI SDK client. */
  createClient?: (options: { apiKey: string; timeoutMs: number }) => OpenAI;
};

/**
 * Builds a server-side OpenAI client with timeout and no automatic retries
 * so ASSISTANT_REQUEST_TIMEOUT_MS remains the effective bound.
 */
export function createOpenAiClient(
  config: AssistantConfig,
  options: OpenAiClientFactoryOptions = {},
): OpenAI {
  if (!config.enabled) {
    throw AssistantProviderError.disabled();
  }
  if (config.apiKey == null) {
    throw AssistantProviderError.auth('OPENAI_API_KEY is missing');
  }

  const createClient =
    options.createClient ??
    ((clientOptions: { apiKey: string; timeoutMs: number }) =>
      new OpenAI({
        apiKey: clientOptions.apiKey,
        timeout: clientOptions.timeoutMs,
        maxRetries: 0,
      }));

  return createClient({
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
  });
}
