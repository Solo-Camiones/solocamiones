import type OpenAI from 'openai';
import type { VectorStoreSearchResponse } from 'openai/resources/vector-stores/vector-stores.js';

import type { AssistantConfig } from './config.js';
import { AssistantProviderError } from './errors.js';
import { mapOpenAiError } from './map-error.js';
import { logger } from '../logging/index.js';
import type {
  KnowledgeChunk,
  KnowledgeRetrieveOptions,
  KnowledgeRetriever,
} from './types.js';

export type OpenAiVectorStoreSearchClient = {
  vectorStores: {
    search: (
      vectorStoreId: string,
      body: {
        query: string;
        max_num_results?: number;
        ranking_options?: { score_threshold?: number };
      },
      options?: { signal?: AbortSignal },
    ) => Promise<{ data: VectorStoreSearchResponse[] }>;
  };
};

export type OpenAiKnowledgeRetrieverOptions = {
  client: OpenAiVectorStoreSearchClient | OpenAI;
  config: Pick<
    AssistantConfig,
    'vectorStoreId' | 'maxRetrievalResults' | 'retrievalScoreThreshold' | 'apiKey'
  >;
};

export class OpenAiKnowledgeRetriever implements KnowledgeRetriever {
  private readonly client: OpenAiVectorStoreSearchClient;
  private readonly vectorStoreId: string;
  private readonly maxRetrievalResults: number;
  private readonly retrievalScoreThreshold: number;

  constructor(options: OpenAiKnowledgeRetrieverOptions) {
    if (options.config.vectorStoreId == null) {
      throw AssistantProviderError.invalidResponse('OPENAI_VECTOR_STORE_ID is missing');
    }
    this.client = options.client as OpenAiVectorStoreSearchClient;
    this.vectorStoreId = options.config.vectorStoreId;
    this.maxRetrievalResults = options.config.maxRetrievalResults;
    this.retrievalScoreThreshold = options.config.retrievalScoreThreshold;
  }

  async retrieve(
    query: string,
    options?: KnowledgeRetrieveOptions,
    signal?: AbortSignal,
  ): Promise<KnowledgeChunk[]> {
    const maxResults = options?.maxResults ?? this.maxRetrievalResults;
    const scoreThreshold = options?.scoreThreshold ?? this.retrievalScoreThreshold;

    try {
      const page = await this.client.vectorStores.search(
        this.vectorStoreId,
        {
          query,
          max_num_results: maxResults,
          ranking_options: { score_threshold: scoreThreshold },
        },
        { signal },
      );

      if (!Array.isArray(page?.data)) {
        throw AssistantProviderError.invalidResponse('OpenAI vector store search returned invalid data');
      }

      return page.data
        .filter((item) => typeof item.score === 'number' && item.score >= scoreThreshold)
        .slice(0, maxResults)
        .map(mapSearchResultToChunk);
    } catch (error) {
      if (error instanceof AssistantProviderError) {
        logger.warn({ code: error.code, retryable: error.retryable }, 'OpenAI knowledge retrieval failed');
        throw error;
      }
      const mapped = mapOpenAiError(error);
      logger.warn({ code: mapped.code, retryable: mapped.retryable }, 'OpenAI knowledge retrieval failed');
      throw mapped;
    }
  }
}

function mapSearchResultToChunk(item: VectorStoreSearchResponse): KnowledgeChunk {
  const attributes = item.attributes ?? {};
  const sourceKey =
    readStringAttribute(attributes, 'sourceKey') ??
    readStringAttribute(attributes, 'source_key') ??
    item.file_id;
  const title =
    readStringAttribute(attributes, 'title') ?? item.filename ?? sourceKey;
  const locator =
    readStringAttribute(attributes, 'locator') ?? item.filename ?? item.file_id;
  const excerpt = item.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();

  return {
    sourceKey,
    title,
    locator,
    excerpt,
    score: item.score,
  };
}

function readStringAttribute(
  attributes: { [key: string]: string | number | boolean },
  key: string,
): string | undefined {
  const value = attributes[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
