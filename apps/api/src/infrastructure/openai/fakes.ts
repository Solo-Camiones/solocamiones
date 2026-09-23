import { AssistantProviderError } from './errors.js';
import type {
  KnowledgeChunk,
  KnowledgeRetrieveOptions,
  KnowledgeRetriever,
  LanguageModelEvent,
  LanguageModelGateway,
  LanguageModelRequest,
} from './types.js';

export type FakeLanguageModelGatewayOptions = {
  events?: LanguageModelEvent[];
  error?: AssistantProviderError;
};

/**
 * Deterministic double for unit tests and disabled composition.
 * Never touches the network.
 */
export function createFakeLanguageModelGateway(
  options: FakeLanguageModelGatewayOptions = {},
): LanguageModelGateway {
  return {
    async *streamCompletion(
      _request: LanguageModelRequest,
      signal?: AbortSignal,
    ): AsyncIterable<LanguageModelEvent> {
      if (signal?.aborted) {
        throw AssistantProviderError.timeout('OpenAI request was aborted');
      }
      if (options.error != null) {
        throw options.error;
      }
      const events = options.events ?? [
        { type: 'delta', text: 'fake-response' },
        {
          type: 'usage',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        { type: 'done', providerResponseId: 'fake-response-id' },
      ];
      for (const event of events) {
        if (signal?.aborted) {
          throw AssistantProviderError.timeout('OpenAI request was aborted');
        }
        yield event;
      }
    },
  };
}

export type FakeKnowledgeRetrieverOptions = {
  chunks?: KnowledgeChunk[];
  error?: AssistantProviderError;
};

export function createFakeKnowledgeRetriever(
  options: FakeKnowledgeRetrieverOptions = {},
): KnowledgeRetriever {
  return {
    async retrieve(
      _query: string,
      retrieveOptions?: KnowledgeRetrieveOptions,
      signal?: AbortSignal,
    ): Promise<KnowledgeChunk[]> {
      if (signal?.aborted) {
        throw AssistantProviderError.timeout('OpenAI request was aborted');
      }
      if (options.error != null) {
        throw options.error;
      }
      const chunks = options.chunks ?? [];
      const threshold = retrieveOptions?.scoreThreshold ?? 0;
      const maxResults = retrieveOptions?.maxResults ?? chunks.length;
      return chunks.filter((chunk) => chunk.score >= threshold).slice(0, maxResults);
    },
  };
}

export function createDisabledLanguageModelGateway(): LanguageModelGateway {
  return createFakeLanguageModelGateway({
    error: AssistantProviderError.disabled(),
  });
}

export function createDisabledKnowledgeRetriever(): KnowledgeRetriever {
  return createFakeKnowledgeRetriever({
    error: AssistantProviderError.disabled(),
  });
}
