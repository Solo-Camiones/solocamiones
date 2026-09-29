import { APIUserAbortError, RateLimitError } from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../../src/infrastructure/logging/index.js';
import {
  AssistantProviderError,
  KNOWLEDGE_CORPUS_MARKER,
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
      expect(body.filters).toEqual({
        type: 'and',
        filters: [
          { type: 'eq', key: 'corpus', value: KNOWLEDGE_CORPUS_MARKER },
          { type: 'eq', key: 'approved', value: true },
        ],
      });
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
            attributes: {
              sourceKey: 'doc-high',
              title: 'High',
              locator: 'guides/high.md',
              version: '1.2.0',
              sourceRequirements: 'SALE-005, PAY-001',
            },
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
        providerFileId: 'file_high',
        sourceKey: 'doc-high',
        title: 'High',
        version: '1.2.0',
        locator: 'guides/high.md',
        excerpt: 'relevant chunk',
        score: 0.9,
        sourceRequirements: ['SALE-005', 'PAY-001'],
      },
    ]);
  });

  it('caps results at maxResults and tolerates missing traceability attributes', async () => {
    const search = vi.fn(async () => ({
      data: [0.9, 0.8, 0.7].map((score, index) => ({
        file_id: `file_${index}`,
        filename: `doc-${index}.md`,
        score,
        attributes: {},
        content: [{ type: 'text', text: `chunk ${index}` }],
      })),
    }));
    const retriever = new OpenAiKnowledgeRetriever({
      client: { vectorStores: { search: search as never } },
      config: {
        vectorStoreId: 'vs_test',
        maxRetrievalResults: 2,
        retrievalScoreThreshold: 0.55,
        apiKey: undefined,
      },
    });

    const chunks = await retriever.retrieve('q');
    expect(chunks.map((chunk) => chunk.providerFileId)).toEqual(['file_0', 'file_1']);
    expect(chunks[0]).toMatchObject({ version: null, sourceRequirements: [], locator: 'doc-0.md' });
  });

  it('propagates AbortSignal and maps abort to TIMEOUT', async () => {
    const controller = new AbortController();
    controller.abort();
    const search = vi.fn(
      async (_id: string, _body: unknown, options?: { signal?: AbortSignal }) => {
        expect(options?.signal?.aborted).toBe(true);
        throw new APIUserAbortError();
      },
    );

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
    const chunkA = {
      providerFileId: 'file_a',
      sourceKey: 'a',
      title: 'A',
      version: '1',
      locator: 'a.md',
      excerpt: 'a',
      score: 0.9,
      sourceRequirements: ['SALE-001'],
    };
    const retriever = createFakeKnowledgeRetriever({
      chunks: [
        chunkA,
        { ...chunkA, providerFileId: 'file_b', sourceKey: 'b', locator: 'b.md', score: 0.2 },
      ],
    });

    await expect(retriever.retrieve('q', { scoreThreshold: 0.5, maxResults: 1 })).resolves.toEqual([
      chunkA,
    ]);
  });

  it('returns disabled retriever when feature is off', async () => {
    const retriever = createKnowledgeRetriever(parseAssistantConfig({}));
    await expect(retriever.retrieve('q')).rejects.toBeInstanceOf(AssistantProviderError);
    await expect(retriever.retrieve('q')).rejects.toMatchObject({ code: 'DISABLED' });
  });
});
