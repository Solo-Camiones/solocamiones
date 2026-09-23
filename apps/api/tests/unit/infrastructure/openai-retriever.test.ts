import { APIUserAbortError, RateLimitError } from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../../src/infrastructure/logging/index.js';
import {
  AssistantProviderError,
  OpenAiKnowledgeRetriever,
  createFakeKnowledgeRetriever,
  createKnowledgeRetriever,
  parseAssistantConfig,
  type OpenAiVectorStoreSearchClient,
} from '../../../src/infrastructure/openai/index.js';

describe('OpenAiKnowledgeRetriever', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searches the configured vector store and filters by score threshold', async () => {
    const search = vi.fn(async (vectorStoreId: string, body: Record<string, unknown>) => {
      expect(vectorStoreId).toBe('vs_test');
      expect(body.query).toBe('how to invoice');
      expect(body.max_num_results).toBe(6);
      expect(body.ranking_options).toEqual({ score_threshold: 0.55 });
      return {
        data: [
          {
            file_id: 'file_low',
            filename: 'low.md',
            score: 0.2,
            attributes: { sourceKey: 'doc-low', title: 'Low' },
            content: [{ type: 'text', text: 'low score' }],
          },
          {
            file_id: 'file_high',
            filename: 'high.md',
            score: 0.9,
            attributes: { sourceKey: 'doc-high', title: 'High', locator: 'guides/high.md' },
            content: [{ type: 'text', text: 'relevant chunk' }],
          },
        ],
      };
    });

    const client = { vectorStores: { search } } as unknown as OpenAiVectorStoreSearchClient;
    const retriever = new OpenAiKnowledgeRetriever({
      client,
      config: {
        vectorStoreId: 'vs_test',
        maxRetrievalResults: 6,
        retrievalScoreThreshold: 0.55,
        apiKey: 'sk-test',
      },
    });

    const chunks = await retriever.retrieve('how to invoice');
    expect(chunks).toEqual([
      {
        sourceKey: 'doc-high',
        title: 'High',
        locator: 'guides/high.md',
        excerpt: 'relevant chunk',
        score: 0.9,
      },
    ]);
  });

  it('propagates AbortSignal and maps abort to TIMEOUT', async () => {
    const controller = new AbortController();
    controller.abort();
    const search = vi.fn(async (_id: string, _body: unknown, options?: { signal?: AbortSignal }) => {
      expect(options?.signal?.aborted).toBe(true);
      throw new APIUserAbortError();
    });

    const retriever = new OpenAiKnowledgeRetriever({
      client: { vectorStores: { search } },
      config: {
        vectorStoreId: 'vs_test',
        maxRetrievalResults: 3,
        retrievalScoreThreshold: 0.5,
        apiKey: undefined,
      },
    });

    await expect(retriever.retrieve('q', undefined, controller.signal)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('maps provider failures without logging retrieval payloads', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const search = vi.fn(async () => {
      throw new RateLimitError(429, undefined, 'rate', new Headers());
    });

    const retriever = new OpenAiKnowledgeRetriever({
      client: { vectorStores: { search } },
      config: {
        vectorStoreId: 'vs_test',
        maxRetrievalResults: 3,
        retrievalScoreThreshold: 0.5,
        apiKey: 'sk-secret',
      },
    });

    await expect(retriever.retrieve('sensitive-query-body')).rejects.toMatchObject({
      code: 'RATE_LIMIT',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive-query-body');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sk-secret');
  });

  it('rejects invalid search payloads', async () => {
    const search = vi.fn(async () => ({ data: null }));
    const retriever = new OpenAiKnowledgeRetriever({
      client: { vectorStores: { search: search as never } },
      config: {
        vectorStoreId: 'vs_test',
        maxRetrievalResults: 3,
        retrievalScoreThreshold: 0.5,
        apiKey: undefined,
      },
    });

    await expect(retriever.retrieve('q')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('knowledge retriever fakes and factories', () => {
  it('filters fake chunks deterministically', async () => {
    const retriever = createFakeKnowledgeRetriever({
      chunks: [
        {
          sourceKey: 'a',
          title: 'A',
          locator: 'a.md',
          excerpt: 'a',
          score: 0.9,
        },
        {
          sourceKey: 'b',
          title: 'B',
          locator: 'b.md',
          excerpt: 'b',
          score: 0.2,
        },
      ],
    });

    await expect(retriever.retrieve('q', { scoreThreshold: 0.5, maxResults: 1 })).resolves.toEqual([
      {
        sourceKey: 'a',
        title: 'A',
        locator: 'a.md',
        excerpt: 'a',
        score: 0.9,
      },
    ]);
  });

  it('returns disabled retriever when feature is off', async () => {
    const retriever = createKnowledgeRetriever(parseAssistantConfig({}));
    await expect(retriever.retrieve('q')).rejects.toBeInstanceOf(AssistantProviderError);
    await expect(retriever.retrieve('q')).rejects.toMatchObject({ code: 'DISABLED' });
  });
});
