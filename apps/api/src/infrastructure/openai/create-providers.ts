import type OpenAI from 'openai';

import type { AssistantConfig } from './config.js';
import { createOpenAiClient } from './client-factory.js';
import {
  createDisabledKnowledgeRetriever,
  createDisabledLanguageModelGateway,
} from './fakes.js';
import { OpenAiKnowledgeRetriever } from './knowledge-retriever.js';
import { OpenAiLanguageModelGateway } from './language-model-gateway.js';
import type { KnowledgeRetriever, LanguageModelGateway } from './types.js';

export type CreateLanguageModelGatewayOptions = {
  client?: OpenAI;
};

export type CreateKnowledgeRetrieverOptions = {
  client?: OpenAI;
};

/**
 * Returns a live OpenAI gateway when enabled; otherwise a disabled fake.
 * Callers (M5+) inject this; createApp is not wired in M1.
 */
export function createLanguageModelGateway(
  config: AssistantConfig,
  options: CreateLanguageModelGatewayOptions = {},
): LanguageModelGateway {
  if (!config.enabled) {
    return createDisabledLanguageModelGateway();
  }
  const client = options.client ?? createOpenAiClient(config);
  return new OpenAiLanguageModelGateway({ client, config });
}

export function createKnowledgeRetriever(
  config: AssistantConfig,
  options: CreateKnowledgeRetrieverOptions = {},
): KnowledgeRetriever {
  if (!config.enabled) {
    return createDisabledKnowledgeRetriever();
  }
  const client = options.client ?? createOpenAiClient(config);
  return new OpenAiKnowledgeRetriever({ client, config });
}
