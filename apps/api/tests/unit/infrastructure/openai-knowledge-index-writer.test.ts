import { NotFoundError, RateLimitError } from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../../src/infrastructure/logging/index.js';
import {
  KNOWLEDGE_CORPUS_MARKER,
  OpenAiKnowledgeIndexWriter,
  createKnowledgeIndexWriter,
  parseKnowledgeSyncConfig,
  type KnowledgeIndexDocument,
  type OpenAiKnowledgeIndexClient,
} from '../../../src/infrastructure/openai/index.js';

const document: KnowledgeIndexDocument = {
  sourceKey: 'guia-pagos',
  title: 'Pagos y CxC',
  version: '1.0.0',
  locator: 'guias/pagos.md',
  sha256: 'a'.repeat(64),
  sourceRequirements: ['PAY-001', 'PAY-006'],
  content: '# Pagos\n\nContenido confidencial de la guía\n',
};

function createClient(
  overrides: {
    createAndPollStatus?: string;
    createAndPollError?: unknown;
    vectorDeleteError?: unknown;
    listed?: Array<{ id: string; attributes?: Record<string, string | number | boolean> | null }>;
  } = {},
) {
  const calls = {
    filesCreate: vi.fn(async () => ({ id: 'file_new' })),
    filesDelete: vi.fn(async () => ({})),
    createAndPoll: vi.fn(async () => {
      if (overrides.createAndPollError != null) throw overrides.createAndPollError;
      return { id: 'file_new', status: overrides.createAndPollStatus ?? 'completed' };
    }),
    vectorDelete: vi.fn(async () => {
      if (overrides.vectorDeleteError != null) throw overrides.vectorDeleteError;
      return {};
    }),
    list: vi.fn(async function* () {
      yield* overrides.listed ?? [];
    }),
  };
  const client: OpenAiKnowledgeIndexClient = {
    files: { create: calls.filesCreate, delete: calls.filesDelete },
    vectorStores: {
      files: {
        createAndPoll: calls.createAndPoll,
        delete: calls.vectorDelete,
        list: calls.list,
      },
    },
  };
  return { client, calls };
}

function notFound(): NotFoundError {
  return new NotFoundError(404, undefined, 'not found', new Headers());
}

describe('OpenAiKnowledgeIndexWriter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads normalized content and attaches traceability attributes before resolving', async () => {
    const { client, calls } = createClient();
    const writer = new OpenAiKnowledgeIndexWriter({ client, config: { vectorStoreId: 'vs_test' } });

    await expect(writer.indexDocument(document)).resolves.toEqual({ providerFileId: 'file_new' });

    expect(calls.filesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'assistants' }),
    );
    expect(calls.createAndPoll).toHaveBeenCalledWith(
      'vs_test',
      {
        file_id: 'file_new',
        attributes: {
          corpus: KNOWLEDGE_CORPUS_MARKER,
          approved: true,
          sourceKey: 'guia-pagos',
          title: 'Pagos y CxC',
          version: '1.0.0',
          locator: 'guias/pagos.md',
          sha256: 'a'.repeat(64),
          sourceRequirements: 'PAY-001,PAY-006',
        },
      },
      expect.objectContaining({ pollIntervalMs: expect.any(Number) }),
    );
  });

  it('discards the uploaded file when indexing does not complete', async () => {
    const { client, calls } = createClient({ createAndPollStatus: 'failed' });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const writer = new OpenAiKnowledgeIndexWriter({ client, config: { vectorStoreId: 'vs_test' } });

    await expect(writer.indexDocument(document)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(calls.vectorDelete).toHaveBeenCalledWith('file_new', { vector_store_id: 'vs_test' });
    expect(calls.filesDelete).toHaveBeenCalledWith('file_new');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Contenido confidencial');
  });

  it('maps provider errors during indexing', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { client } = createClient({
      createAndPollError: new RateLimitError(429, undefined, 'rate', new Headers()),
    });
    const writer = new OpenAiKnowledgeIndexWriter({ client, config: { vectorStoreId: 'vs_test' } });

    await expect(writer.indexDocument(document)).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('treats already-missing files as removed', async () => {
    const { client, calls } = createClient({ vectorDeleteError: notFound() });
    const writer = new OpenAiKnowledgeIndexWriter({ client, config: { vectorStoreId: 'vs_test' } });

    await expect(writer.removeDocument('file_old')).resolves.toBeUndefined();
    expect(calls.filesDelete).toHaveBeenCalledWith('file_old');
  });

  it('lists only files carrying the corpus marker', async () => {
    const { client } = createClient({
      listed: [
        { id: 'file_ours', attributes: { corpus: KNOWLEDGE_CORPUS_MARKER } },
        { id: 'file_foreign', attributes: { corpus: 'other' } },
        { id: 'file_plain', attributes: null },
      ],
    });
    const writer = new OpenAiKnowledgeIndexWriter({ client, config: { vectorStoreId: 'vs_test' } });

    await expect(writer.listCorpusFileIds()).resolves.toEqual(['file_ours']);
  });
});

describe('knowledge sync configuration', () => {
  it('works while ASSISTANT_ENABLED is false when key and vector store are present', () => {
    expect(
      parseKnowledgeSyncConfig({
        ASSISTANT_ENABLED: 'false',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_VECTOR_STORE_ID: 'vs_test',
      }),
    ).toEqual({ apiKey: 'sk-test', vectorStoreId: 'vs_test', requestTimeoutMs: 45_000 });
  });

  it('requires the API key and vector store id', () => {
    expect(() => parseKnowledgeSyncConfig({ OPENAI_VECTOR_STORE_ID: 'vs_test' })).toThrow(
      /OPENAI_API_KEY/,
    );
    expect(() => parseKnowledgeSyncConfig({ OPENAI_API_KEY: 'sk-test' })).toThrow(
      /OPENAI_VECTOR_STORE_ID/,
    );
  });

  it('builds a writer without requiring the feature flag', () => {
    const writer = createKnowledgeIndexWriter(
      { apiKey: 'sk-test', vectorStoreId: 'vs_test', requestTimeoutMs: 1_000 },
      { client: createClient().client as never },
    );
    expect(writer).toBeInstanceOf(OpenAiKnowledgeIndexWriter);
  });
});
