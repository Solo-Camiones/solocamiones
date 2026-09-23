import { describe, expect, it } from 'vitest';

import type { ApprovedKnowledgeDocument } from '../../../src/features/assistant/knowledge-corpus.js';
import {
  buildKnowledgeDocumentMetadata,
  planKnowledgeSync,
  type IndexedKnowledgeState,
} from '../../../src/features/assistant/knowledge-sync-plan.js';

function approved(overrides: Partial<ApprovedKnowledgeDocument> = {}): ApprovedKnowledgeDocument {
  return {
    sourceKey: 'guia-pagos',
    title: 'Pagos',
    version: '1.0.0',
    path: 'guias/pagos.md',
    sha256: 'a'.repeat(64),
    sourceRequirements: ['PAY-001'],
    updatedAt: '2026-09-23',
    content: '# Pagos\n',
    ...overrides,
  };
}

function indexedFrom(
  document: ApprovedKnowledgeDocument,
  overrides: Partial<IndexedKnowledgeState> = {},
): IndexedKnowledgeState {
  return {
    sourceKey: document.sourceKey,
    title: document.title,
    version: document.version,
    contentSha256: document.sha256,
    status: 'READY',
    providerFileId: 'file_1',
    metadata: buildKnowledgeDocumentMetadata(document),
    ...overrides,
  };
}

const noProtection = new Set<string>();

describe('planKnowledgeSync', () => {
  it('uploads new documents and leaves identical READY documents unchanged', () => {
    const existing = approved();
    const fresh = approved({ sourceKey: 'guia-clientes', path: 'guias/clientes.md' });

    expect(
      planKnowledgeSync({
        approved: [existing, fresh],
        protectedSourceKeys: noProtection,
        indexed: [indexedFrom(existing)],
      }).map((action) => [action.type, action.sourceKey]),
    ).toEqual([
      ['unchanged', 'guia-pagos'],
      ['upload', 'guia-clientes'],
    ]);
  });

  it('replaces when content, version, title, path, or requirements change', () => {
    const base = approved();
    const variants: Partial<ApprovedKnowledgeDocument>[] = [
      { sha256: 'b'.repeat(64) },
      { version: '1.1.0' },
      { title: 'Pagos y CxC' },
      { path: 'guias/pagos-v2.md' },
      { sourceRequirements: ['PAY-001', 'PAY-006'] },
    ];

    for (const change of variants) {
      const [action] = planKnowledgeSync({
        approved: [approved(change)],
        protectedSourceKeys: noProtection,
        indexed: [indexedFrom(base)],
      });
      expect(action, JSON.stringify(change)).toMatchObject({
        type: 'replace',
        previousProviderFileId: 'file_1',
      });
    }
  });

  it('re-uploads documents that never reached READY', () => {
    const document = approved();
    for (const status of ['SYNC_PENDING', 'INDEXING', 'FAILED', 'REMOVED'] as const) {
      const [action] = planKnowledgeSync({
        approved: [document],
        protectedSourceKeys: noProtection,
        indexed: [indexedFrom(document, { status, providerFileId: null })],
      });
      expect(action.type, status).toBe('upload');
    }
  });

  it('removes documents no longer approved, including drafts, but never protected ones', () => {
    const draftedBack = approved({ sourceKey: 'guia-borrador' });
    const brokenEdit = approved({ sourceKey: 'guia-editada' });

    expect(
      planKnowledgeSync({
        approved: [],
        protectedSourceKeys: new Set(['guia-editada']),
        indexed: [indexedFrom(draftedBack), indexedFrom(brokenEdit, { providerFileId: 'file_2' })],
      }),
    ).toEqual([{ type: 'remove', sourceKey: 'guia-borrador', providerFileId: 'file_1' }]);
  });

  it('retries remote cleanup for REMOVED rows that still hold a file and ignores finished ones', () => {
    const document = approved();

    expect(
      planKnowledgeSync({
        approved: [],
        protectedSourceKeys: noProtection,
        indexed: [
          indexedFrom(document, { status: 'REMOVED', providerFileId: 'file_stuck' }),
          indexedFrom(approved({ sourceKey: 'guia-vieja' }), {
            status: 'REMOVED',
            providerFileId: null,
          }),
        ],
      }),
    ).toEqual([{ type: 'remove', sourceKey: 'guia-pagos', providerFileId: 'file_stuck' }]);
  });
});
