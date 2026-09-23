import { describe, expect, it } from 'vitest';

import { computeKnowledgeSha256 } from '../../../src/features/assistant/knowledge-checksum.js';
import {
  isKnowledgeCorpusValid,
  validateKnowledgeCorpus,
  type KnowledgeCorpusReader,
} from '../../../src/features/assistant/knowledge-corpus.js';

const KNOWN_REQUIREMENTS = new Set(['PAY-001', 'PAY-006', 'CUST-005']);
const PAGOS_CONTENT = '# Pagos\r\n\r\nLos pagos son aditivos.\r\n';

type ManifestEntry = Record<string, unknown>;

function entry(overrides: ManifestEntry = {}): ManifestEntry {
  return {
    sourceKey: 'guia-pagos',
    title: 'Pagos y CxC',
    version: '1.0.0',
    status: 'approved',
    audience: 'ADMINISTRATOR',
    sourceRequirements: ['PAY-001'],
    path: 'guias/pagos.md',
    updatedAt: '2026-09-23',
    sha256: computeKnowledgeSha256(PAGOS_CONTENT),
    ...overrides,
  };
}

function reader(
  manifest: unknown,
  files: Record<string, string> = { 'guias/pagos.md': PAGOS_CONTENT },
): KnowledgeCorpusReader {
  return {
    readManifest: async () => (typeof manifest === 'string' ? manifest : JSON.stringify(manifest)),
    readDocument: async (relativePath) => files[relativePath],
    readKnownRequirementIds: async () => KNOWN_REQUIREMENTS,
  };
}

function manifestWith(...documents: ManifestEntry[]) {
  return { schemaVersion: 1, documents };
}

describe('validateKnowledgeCorpus', () => {
  it('admits an approved document whose checksum matches after line-ending normalization', async () => {
    const report = await validateKnowledgeCorpus(reader(manifestWith(entry())));

    expect(isKnowledgeCorpusValid(report)).toBe(true);
    expect(report.approved).toEqual([
      expect.objectContaining({
        sourceKey: 'guia-pagos',
        version: '1.0.0',
        sourceRequirements: ['PAY-001'],
        content: '# Pagos\n\nLos pagos son aditivos.\n',
      }),
    ]);
  });

  it('reports drafts without indexing them and without requiring a checksum', async () => {
    const report = await validateKnowledgeCorpus(
      reader(manifestWith(entry({ status: 'draft', sha256: undefined }))),
    );

    expect(isKnowledgeCorpusValid(report)).toBe(true);
    expect(report.approved).toEqual([]);
    expect(report.draftSourceKeys).toEqual(['guia-pagos']);
    expect(report.checksums[0]).toMatchObject({ status: 'draft', sha256: expect.any(String) });
  });

  it('blocks an approved document edited after approval and shows the new checksum', async () => {
    const report = await validateKnowledgeCorpus(
      reader(manifestWith(entry({ sha256: 'b'.repeat(64) }))),
    );

    expect(report.approved).toEqual([]);
    expect(report.invalidSourceKeys).toEqual(['guia-pagos']);
    expect(report.documentIssues[0].message).toContain(computeKnowledgeSha256(PAGOS_CONTENT));
    expect(report.manifestIssues).toEqual([]);
  });

  it('requires sha256 on approved entries', async () => {
    const report = await validateKnowledgeCorpus(
      reader(manifestWith(entry({ sha256: undefined }))),
    );

    expect(report.manifestIssues[0].message).toMatch(/sha256.*required when status is approved/);
  });

  it('rejects audiences other than Administrator', async () => {
    const report = await validateKnowledgeCorpus(
      reader(manifestWith(entry({ audience: 'SELLER' }))),
    );

    expect(report.manifestIssues[0].message).toMatch(/audience/);
    expect(report.approved).toEqual([]);
  });

  it('rejects duplicate source keys and paths as manifest-level problems', async () => {
    const report = await validateKnowledgeCorpus(reader(manifestWith(entry(), entry())));

    expect(report.manifestIssues.map((issue) => issue.message)).toEqual([
      'duplicate sourceKey "guia-pagos"',
      'duplicate path "guias/pagos.md"',
    ]);
  });

  it('rejects invalid JSON and paths that escape the corpus directory', async () => {
    const invalidJson = await validateKnowledgeCorpus(reader('{ not json'));
    expect(invalidJson.manifestIssues[0].message).toMatch(/not valid JSON/);

    for (const path of [
      '../FEATURES/10_SALES_AND_INVOICES.md',
      '/etc/passwd.md',
      'guias\\pagos.md',
      'notas.txt',
    ]) {
      const report = await validateKnowledgeCorpus(reader(manifestWith(entry({ path }))));
      expect(report.manifestIssues[0]?.message, path).toMatch(/path/);
    }
  });

  it('flags missing files and unknown requirement IDs per document', async () => {
    const report = await validateKnowledgeCorpus(
      reader(
        manifestWith(
          entry({ sourceKey: 'guia-faltante', path: 'guias/faltante.md' }),
          entry({ sourceRequirements: ['PAY-999'] }),
        ),
      ),
    );

    expect(report.manifestIssues).toEqual([]);
    expect(report.invalidSourceKeys).toEqual(['guia-faltante', 'guia-pagos']);
    expect(report.documentIssues.map((issue) => issue.message)).toEqual([
      'file not found: guias/faltante.md',
      'unknown requirement IDs in docs/FEATURES: PAY-999',
    ]);
  });

  it('rejects empty documents', async () => {
    const report = await validateKnowledgeCorpus(
      reader(manifestWith(entry({ status: 'draft', sha256: undefined })), {
        'guias/pagos.md': '\r\n  \n',
      }),
    );

    expect(report.documentIssues[0].message).toBe('file is empty');
  });
});
