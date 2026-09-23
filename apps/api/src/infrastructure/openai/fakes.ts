import { AssistantProviderError } from './errors.js';
import type {
  KnowledgeChunk,
  KnowledgeIndexDocument,
  KnowledgeIndexedFile,
  KnowledgeIndexWriter,
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

/**
 * In-memory vector store double for sync tests. `files` holds corpus files by
 * provider id; `foreignFileIds` simulates files uploaded outside the sync.
 */
export class FakeKnowledgeIndexWriter implements KnowledgeIndexWriter {
  readonly files = new Map<string, KnowledgeIndexDocument>();
  readonly foreignFileIds = new Set<string>();
  readonly failIndexingFor = new Set<string>();
  readonly failRemovalFor = new Set<string>();
  indexCalls = 0;
  removeCalls = 0;
  private nextFileNumber = 1;

  async indexDocument(document: KnowledgeIndexDocument): Promise<KnowledgeIndexedFile> {
    this.indexCalls += 1;
    if (this.failIndexingFor.has(document.sourceKey)) {
      throw AssistantProviderError.unavailable('Fake indexing failure');
    }
    const providerFileId = `file_fake_${this.nextFileNumber}`;
    this.nextFileNumber += 1;
    this.files.set(providerFileId, { ...document });
    return { providerFileId };
  }

  async removeDocument(providerFileId: string): Promise<void> {
    this.removeCalls += 1;
    if (this.failRemovalFor.has(providerFileId)) {
      throw AssistantProviderError.unavailable('Fake removal failure');
    }
    this.files.delete(providerFileId);
  }

  async listCorpusFileIds(): Promise<string[]> {
    return [...this.files.keys()];
  }

  /** Simulates a file left behind by an interrupted sync. */
  addOrphan(document: KnowledgeIndexDocument): string {
    const providerFileId = `file_orphan_${this.nextFileNumber}`;
    this.nextFileNumber += 1;
    this.files.set(providerFileId, { ...document });
    return providerFileId;
  }
}
