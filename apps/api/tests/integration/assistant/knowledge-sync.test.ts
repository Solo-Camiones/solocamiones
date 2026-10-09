import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { computeKnowledgeSha256 } from '../../../src/features/assistant/knowledge-checksum.js';
import {
  validateKnowledgeCorpus,
  type KnowledgeCorpusReport,
} from '../../../src/features/assistant/knowledge-corpus.js';
import { KnowledgeDocumentRepository } from '../../../src/features/assistant/knowledge-document-repository.js';
import {
  KnowledgeManifestInvalidError,
  syncKnowledgeCorpus,
} from '../../../src/features/assistant/knowledge-sync.js';
import { ReadyKnowledgeRetriever } from '../../../src/features/assistant/ready-knowledge-retriever.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import {
  FakeKnowledgeIndexWriter,
  createFakeKnowledgeRetriever,
  type KnowledgeChunk,
} from '../../../src/infrastructure/openai/index.js';

const documents = new KnowledgeDocumentRepository();

type CorpusEntry = {
  sourceKey: string;
  content: string;
  status?: 'approved' | 'draft';
  version?: string;
  sha256?: string;
};

async function corpusOf(...entries: CorpusEntry[]): Promise<KnowledgeCorpusReport> {
  const files = Object.fromEntries(entries.map((item) => [`${item.sourceKey}.md`, item.content]));
  return validateKnowledgeCorpus({
    readManifest: async () =>
      JSON.stringify({
        schemaVersion: 1,
        documents: entries.map((item) => ({
          sourceKey: item.sourceKey,
          title: `Guía ${item.sourceKey}`,
          version: item.version ?? '1.0.0',
          status: item.status ?? 'approved',
          audience: 'ADMINISTRATOR',
          sourceRequirements: ['PAY-001'],
          path: `${item.sourceKey}.md`,
          updatedAt: '2026-09-23',
          sha256: item.sha256 ?? computeKnowledgeSha256(item.content),
        })),
      }),
    readDocument: async (relativePath) => files[relativePath],
    readKnownRequirementIds: async () => new Set(['PAY-001']),
  });
}

function sync(writer: FakeKnowledgeIndexWriter, corpus: KnowledgeCorpusReport, dryRun = false) {
  return syncKnowledgeCorpus({ documents, writer }, { corpus, dryRun });
}

function chunkFor(providerFileId: string): KnowledgeChunk {
  return {
    providerFileId,
    sourceKey: 'guia-pagos',
    title: 'Guía',
    version: '1.0.0',
    locator: 'guia-pagos.md',
    excerpt: 'texto',
    score: 0.9,
    sourceRequirements: ['PAY-001'],
  };
}

describe('Assistant knowledge sync (PostgreSQL + fake vector store)', () => {
  afterEach(async () => {
    await prisma.assistantKnowledgeDocument.deleteMany();
  });

  afterAll(disconnectPrisma);

  it('dry-run reports the plan and orphans without mutating anything', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    const orphanId = writer.addOrphan({
      sourceKey: 'viejo',
      title: 'Viejo',
      version: '0',
      locator: 'viejo.md',
      sha256: 'a'.repeat(64),
      sourceRequirements: [],
      content: 'x',
    });

    const result = await sync(
      writer,
      await corpusOf({ sourceKey: 'guia-pagos', content: '# Pagos\n' }),
      true,
    );

    expect(result.outcomes).toEqual([
      { action: 'upload', sourceKey: 'guia-pagos', status: 'planned' },
      { action: 'orphan', providerFileId: orphanId, status: 'planned' },
    ]);
    expect(await documents.list()).toEqual([]);
    expect(writer.indexCalls).toBe(0);
    expect(writer.removeCalls).toBe(0);
  });

  it('uploads approved documents as READY with traceability metadata and is idempotent', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    const corpus = await corpusOf({ sourceKey: 'guia-pagos', content: '# Pagos\r\n' });

    const first = await sync(writer, corpus);
    expect(first.failed).toBe(false);

    const row = await documents.findBySourceKey('guia-pagos');
    expect(row).toMatchObject({
      status: 'READY',
      version: '1.0.0',
      contentSha256: computeKnowledgeSha256('# Pagos\n'),
      metadata: { path: 'guia-pagos.md', sourceRequirements: ['PAY-001'], updatedAt: '2026-09-23' },
      errorCode: null,
    });
    expect(row?.indexedAt).toBeInstanceOf(Date);
    expect(writer.files.get(row!.providerFileId!)).toMatchObject({
      sourceKey: 'guia-pagos',
      locator: 'guia-pagos.md',
      content: '# Pagos\n',
    });

    const second = await sync(writer, corpus);
    expect(second.outcomes).toEqual([
      { action: 'unchanged', sourceKey: 'guia-pagos', status: 'done' },
    ]);
    expect(writer.indexCalls).toBe(1);
  });

  it('re-uploads when DB is READY but the provider file is absent from the current store', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    const corpus = await corpusOf({ sourceKey: 'guia-pagos', content: '# Pagos\n' });
    await sync(writer, corpus);
    const previous = await documents.findBySourceKey('guia-pagos');
    expect(previous?.status).toBe('READY');
    expect(previous?.providerFileId).toBeTruthy();

    // Simulate OPENAI_VECTOR_STORE_ID replacement: empty remote store, stale READY rows.
    writer.files.clear();

    const result = await sync(writer, corpus);
    const row = await documents.findBySourceKey('guia-pagos');

    expect(result.outcomes).toEqual([
      {
        action: 'upload',
        sourceKey: 'guia-pagos',
        providerFileId: row!.providerFileId,
        status: 'done',
      },
    ]);
    expect(row).toMatchObject({ status: 'READY' });
    expect(row!.providerFileId).not.toBe(previous!.providerFileId);
    expect(writer.files.has(row!.providerFileId!)).toBe(true);
  });

  it('replaces a new version and deletes the superseded file only after the new one is READY', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));
    const previousFileId = (await documents.findBySourceKey('guia-pagos'))!.providerFileId!;

    const result = await sync(
      writer,
      await corpusOf({ sourceKey: 'guia-pagos', content: 'v2\n', version: '1.1.0' }),
    );

    const row = await documents.findBySourceKey('guia-pagos');
    expect(result.outcomes[0]).toMatchObject({ action: 'replace', status: 'done' });
    expect(row).toMatchObject({ status: 'READY', version: '1.1.0' });
    expect(row!.providerFileId).not.toBe(previousFileId);
    expect([...writer.files.keys()]).toEqual([row!.providerFileId]);
  });

  it('keeps serving the previous approved version when a replacement fails', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));
    const previous = (await documents.findBySourceKey('guia-pagos'))!;

    writer.failIndexingFor.add('guia-pagos');
    const result = await sync(
      writer,
      await corpusOf({ sourceKey: 'guia-pagos', content: 'v2\n', version: '1.1.0' }),
    );

    const row = await documents.findBySourceKey('guia-pagos');
    expect(result.failed).toBe(true);
    expect(result.outcomes[0]).toMatchObject({
      action: 'replace',
      status: 'failed',
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
    expect(row).toMatchObject({
      status: 'READY',
      version: '1.0.0',
      providerFileId: previous.providerFileId,
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
    expect(row?.errorId).toEqual(expect.any(String));

    const retriever = new ReadyKnowledgeRetriever(
      createFakeKnowledgeRetriever({ chunks: [chunkFor(previous.providerFileId!)] }),
      documents,
    );
    await expect(retriever.retrieve('q')).resolves.toHaveLength(1);
  });

  it('marks failed first uploads as FAILED so they are never retrievable', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    writer.failIndexingFor.add('guia-pagos');

    const result = await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));

    expect(result.failed).toBe(true);
    expect(await documents.findBySourceKey('guia-pagos')).toMatchObject({
      status: 'FAILED',
      providerFileId: null,
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('removes documents moved back to draft and makes them unretrievable', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));
    const removedFileId = (await documents.findBySourceKey('guia-pagos'))!.providerFileId!;

    await sync(
      writer,
      await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n', status: 'draft' }),
    );

    expect(await documents.findBySourceKey('guia-pagos')).toMatchObject({
      status: 'REMOVED',
      providerFileId: null,
    });
    expect(writer.files.size).toBe(0);

    const retriever = new ReadyKnowledgeRetriever(
      createFakeKnowledgeRetriever({ chunks: [chunkFor(removedFileId)] }),
      documents,
    );
    await expect(retriever.retrieve('q')).resolves.toEqual([]);
  });

  it('marks REMOVED before remote deletion and retries a failed deletion on the next sync', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));
    const fileId = (await documents.findBySourceKey('guia-pagos'))!.providerFileId!;
    const emptyCorpus = await corpusOf();

    writer.failRemovalFor.add(fileId);
    const failed = await sync(writer, emptyCorpus);
    expect(failed.failed).toBe(true);
    expect(await documents.findBySourceKey('guia-pagos')).toMatchObject({
      status: 'REMOVED',
      providerFileId: fileId,
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
    expect(await documents.findReadyProviderFileIds([fileId])).toEqual(new Set());

    writer.failRemovalFor.clear();
    const retried = await sync(writer, emptyCorpus);
    expect(retried.failed).toBe(false);
    expect(await documents.findBySourceKey('guia-pagos')).toMatchObject({ providerFileId: null });
    expect(writer.files.size).toBe(0);
  });

  it('keeps an invalid listed document untouched instead of unpublishing it', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));
    const before = await documents.findBySourceKey('guia-pagos');

    const editedWithoutApproval = await corpusOf({
      sourceKey: 'guia-pagos',
      content: 'v1 editada\n',
      sha256: computeKnowledgeSha256('v1\n'),
    });
    expect(editedWithoutApproval.invalidSourceKeys).toEqual(['guia-pagos']);

    const result = await sync(writer, editedWithoutApproval);

    expect(result.outcomes).toEqual([]);
    expect(await documents.findBySourceKey('guia-pagos')).toMatchObject({
      status: 'READY',
      providerFileId: before?.providerFileId,
    });
  });

  it('deletes unreferenced corpus files left by interrupted syncs', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    const orphanId = writer.addOrphan({
      sourceKey: 'guia-pagos',
      title: 'Guía',
      version: '1.0.0',
      locator: 'guia-pagos.md',
      sha256: 'a'.repeat(64),
      sourceRequirements: ['PAY-001'],
      content: 'v1\n',
    });

    const result = await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));

    expect(result.outcomes).toContainEqual({
      action: 'orphan',
      providerFileId: orphanId,
      status: 'done',
    });
    expect(writer.files.has(orphanId)).toBe(false);
    expect(writer.files.size).toBe(1);
  });

  it('aborts without changes when the manifest itself is invalid', async () => {
    const writer = new FakeKnowledgeIndexWriter();
    await sync(writer, await corpusOf({ sourceKey: 'guia-pagos', content: 'v1\n' }));
    const invalid = await validateKnowledgeCorpus({
      readManifest: async () => '{ broken',
      readDocument: async () => undefined,
      readKnownRequirementIds: async () => new Set(),
    });

    await expect(sync(writer, invalid)).rejects.toBeInstanceOf(KnowledgeManifestInvalidError);
    expect(await documents.findBySourceKey('guia-pagos')).toMatchObject({ status: 'READY' });
    expect(writer.files.size).toBe(1);
  });
});
