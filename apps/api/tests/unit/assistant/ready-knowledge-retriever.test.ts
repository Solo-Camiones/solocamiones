import { describe, expect, it, vi } from 'vitest';

import { ReadyKnowledgeRetriever } from '../../../src/features/assistant/ready-knowledge-retriever.js';
import {
  createFakeKnowledgeRetriever,
  type KnowledgeChunk,
} from '../../../src/infrastructure/openai/index.js';

function chunk(providerFileId: string, score: number): KnowledgeChunk {
  return {
    providerFileId,
    sourceKey: `doc-${providerFileId}`,
    title: 'Doc',
    version: '1',
    locator: 'doc.md',
    excerpt: 'texto',
    score,
    sourceRequirements: ['PAY-001'],
  };
}

describe('ReadyKnowledgeRetriever', () => {
  it('keeps only chunks whose provider file is READY in the database', async () => {
    const findReadyProviderFileIds = vi.fn(async () => new Set(['file_ready']));
    const retriever = new ReadyKnowledgeRetriever(
      createFakeKnowledgeRetriever({
        chunks: [chunk('file_ready', 0.9), chunk('file_superseded', 0.8), chunk('file_ready', 0.7)],
      }),
      { findReadyProviderFileIds },
    );

    const chunks = await retriever.retrieve('q');

    expect(chunks.map((item) => [item.providerFileId, item.score])).toEqual([
      ['file_ready', 0.9],
      ['file_ready', 0.7],
    ]);
    expect(findReadyProviderFileIds).toHaveBeenCalledWith(['file_ready', 'file_superseded']);
  });

  it('skips the database lookup when the provider returns nothing', async () => {
    const findReadyProviderFileIds = vi.fn(async () => new Set<string>());
    const retriever = new ReadyKnowledgeRetriever(createFakeKnowledgeRetriever(), {
      findReadyProviderFileIds,
    });

    await expect(retriever.retrieve('q')).resolves.toEqual([]);
    expect(findReadyProviderFileIds).not.toHaveBeenCalled();
  });

  it('forwards retrieval limits to the provider retriever', async () => {
    const retriever = new ReadyKnowledgeRetriever(
      createFakeKnowledgeRetriever({ chunks: [chunk('a', 0.9), chunk('b', 0.4)] }),
      { findReadyProviderFileIds: async (ids) => new Set(ids) },
    );

    const chunks = await retriever.retrieve('q', { scoreThreshold: 0.55, maxResults: 6 });
    expect(chunks.map((item) => item.providerFileId)).toEqual(['a']);
  });
});
