import type OpenAI from 'openai';

import type { AssistantConfig, KnowledgeSyncConfig } from './config.js';
import { createOpenAiClient, createOpenAiKnowledgeSyncClient } from './client-factory.js';
import { createDisabledKnowledgeRetriever, createDisabledLanguageModelGateway } from './fakes.js';
import { OpenAiKnowledgeIndexWriter } from './knowledge-index-writer.js';
import { OpenAiKnowledgeRetriever } from './knowledge-retriever.js';
import { OpenAiLanguageModelGateway } from './language-model-gateway.js';
import type { KnowledgeIndexWriter, KnowledgeRetriever, LanguageModelGateway } from './types.js';

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

export type CreateKnowledgeIndexWriterOptions = {
  client?: OpenAI;
};

export function createKnowledgeIndexWriter(
  config: KnowledgeSyncConfig,
  options: CreateKnowledgeIndexWriterOptions = {},
): KnowledgeIndexWriter {
  const client = options.client ?? createOpenAiKnowledgeSyncClient(config);
  return new OpenAiKnowledgeIndexWriter({ client, config });
}
