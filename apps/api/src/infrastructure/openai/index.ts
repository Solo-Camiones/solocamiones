export {
  DEFAULT_ASSISTANT_DAILY_MESSAGE_LIMIT,
  DEFAULT_ASSISTANT_MAX_INPUT_CHARS,
  DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
  DEFAULT_ASSISTANT_MAX_RETRIEVAL_RESULTS,
  DEFAULT_ASSISTANT_MAX_TOOL_CALLS,
  DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS,
  DEFAULT_ASSISTANT_RETENTION_DAYS,
  DEFAULT_ASSISTANT_RETRIEVAL_SCORE_THRESHOLD,
  DEFAULT_OPENAI_CHAT_MODEL,
  parseAssistantConfig,
  parseKnowledgeSyncConfig,
} from './config.js';
export type { AssistantConfig, KnowledgeSyncConfig } from './config.js';

export { createOpenAiClient, createOpenAiKnowledgeSyncClient } from './client-factory.js';
export type { OpenAiClientFactoryOptions } from './client-factory.js';

export {
  createKnowledgeIndexWriter,
  createKnowledgeRetriever,
  createLanguageModelGateway,
} from './create-providers.js';
export type {
  CreateKnowledgeIndexWriterOptions,
  CreateKnowledgeRetrieverOptions,
  CreateLanguageModelGatewayOptions,
} from './create-providers.js';

export {
  KNOWLEDGE_ATTRIBUTE_KEYS,
  KNOWLEDGE_CORPUS_MARKER,
  buildApprovedCorpusFilter,
  buildKnowledgeFileAttributes,
  isCorpusFile,
  parseSourceRequirementsAttribute,
} from './knowledge-attributes.js';
export type {
  KnowledgeComparisonFilter,
  KnowledgeCompoundFilter,
  KnowledgeFileAttributes,
} from './knowledge-attributes.js';

export { OpenAiKnowledgeIndexWriter } from './knowledge-index-writer.js';
export type {
  OpenAiKnowledgeIndexClient,
  OpenAiKnowledgeIndexWriterOptions,
} from './knowledge-index-writer.js';

export {
  ASSISTANT_PROVIDER_ERROR_CODES,
  AssistantProviderError,
  isAssistantProviderError,
} from './errors.js';
export type { AssistantProviderErrorCode } from './errors.js';

export {
  FakeKnowledgeIndexWriter,
  createDisabledKnowledgeRetriever,
  createDisabledLanguageModelGateway,
  createFakeKnowledgeRetriever,
  createFakeLanguageModelGateway,
} from './fakes.js';
export type { FakeKnowledgeRetrieverOptions, FakeLanguageModelGatewayOptions, FakeLanguageModelScriptStep } from './fakes.js';

export { OpenAiKnowledgeRetriever } from './knowledge-retriever.js';
export type {
  OpenAiKnowledgeRetrieverOptions,
  OpenAiVectorStoreSearchClient,
} from './knowledge-retriever.js';

export { OpenAiLanguageModelGateway } from './language-model-gateway.js';
export type {
  OpenAiLanguageModelGatewayOptions,
  OpenAiResponsesClient,
} from './language-model-gateway.js';

export { mapOpenAiError, redactSecret } from './map-error.js';

export type {
  KnowledgeChunk,
  KnowledgeIndexDocument,
  KnowledgeIndexedFile,
  KnowledgeIndexWriter,
  KnowledgeRetrieveOptions,
  KnowledgeRetriever,
  LanguageModelEvent,
  LanguageModelGateway,
  LanguageModelMessage,
  LanguageModelRequest,
  LanguageModelRole,
  LanguageModelToolDefinition,
  LanguageModelUsage,
} from './types.js';
