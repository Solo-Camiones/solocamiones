import OpenAI from 'openai';

import type { AssistantConfig, KnowledgeSyncConfig } from './config.js';
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

  return buildOpenAiClient({ apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs }, options);
}

/** Client for the explicit knowledge sync, which runs while the feature flag is still off. */
export function createOpenAiKnowledgeSyncClient(
  config: KnowledgeSyncConfig,
  options: OpenAiClientFactoryOptions = {},
): OpenAI {
  return buildOpenAiClient({ apiKey: config.apiKey, timeoutMs: config.requestTimeoutMs }, options);
}

function buildOpenAiClient(
  clientOptions: { apiKey: string; timeoutMs: number },
  options: OpenAiClientFactoryOptions,
): OpenAI {
  const createClient =
    options.createClient ??
    ((resolved: { apiKey: string; timeoutMs: number }) =>
      new OpenAI({
        apiKey: resolved.apiKey,
        timeout: resolved.timeoutMs,
        maxRetries: 0,
      }));

  return createClient(clientOptions);
}
