import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_KNOWLEDGE_DIRECTORY,
  FEATURE_SPECIFICATIONS_DIRECTORY,
  hashKnowledgeDocuments,
  parseKnowledgeCliArgs,
} from '../../../src/cli/assistant-knowledge-command.js';
import { computeKnowledgeSha256 } from '../../../src/features/assistant/knowledge-checksum.js';
import {
  createFileSystemKnowledgeCorpusReader,
  isKnowledgeCorpusValid,
  validateKnowledgeCorpus,
} from '../../../src/features/assistant/knowledge-corpus.js';

describe('parseKnowledgeCliArgs', () => {
  it('accepts --dry-run only where allowed', () => {
    expect(parseKnowledgeCliArgs(['--dry-run'], { allowDryRun: true })).toEqual({
      dryRun: true,
      help: false,
      unknown: [],
    });
    expect(parseKnowledgeCliArgs(['--dry-run'], { allowDryRun: false }).unknown).toEqual([
      '--dry-run',
    ]);
    expect(parseKnowledgeCliArgs(['-h'], { allowDryRun: false }).help).toBe(true);
  });
});

describe('hashKnowledgeDocuments', () => {
  const manifest = JSON.stringify({
    schemaVersion: 1,
    documents: [
      { sourceKey: 'guia-a', path: 'guias/a.md', status: 'approved', sha256: '' },
      { sourceKey: 'guia-b', path: 'guias/b.md', status: 'draft' },
      { sourceKey: 'escape', path: '../secret.md', status: 'draft' },
    ],
  });
  const files: Record<string, string> = { 'guias/a.md': '# A\r\n', 'guias/b.md': '# B\n' };
  const readDocument = async (relativePath: string) => {
    const content = files[relativePath];
    if (content == null) throw new Error('missing');
    return content;
  };

  it('hashes only the requested documents with the same normalization as the validator', async () => {
    const results = await hashKnowledgeDocuments(manifest, readDocument, ['guia-a']);

    expect(results).toEqual([{ sourceKey: 'guia-a', sha256: computeKnowledgeSha256('# A\n') }]);
  });

  it('works on a manifest that fails strict validation (empty sha256)', async () => {
    const results = await hashKnowledgeDocuments(manifest, readDocument, []);

    expect(results.filter((result) => 'sha256' in result).map((r) => r.sourceKey)).toEqual([
      'guia-a',
      'guia-b',
    ]);
  });

  it('reports unknown sourceKeys and refuses paths outside the corpus', async () => {
    const results = await hashKnowledgeDocuments(manifest, readDocument, ['missing', 'escape']);

    expect(results).toEqual([
      { sourceKey: 'missing', error: 'not found in manifest' },
      { sourceKey: 'escape', error: 'path must be a relative .md path inside the corpus' },
    ]);
  });
});

describe('repository assistant knowledge corpus', () => {
  it('keeps docs/assistant-knowledge consistent with its manifest and Feature IDs', async () => {
    const report = await validateKnowledgeCorpus(
      createFileSystemKnowledgeCorpusReader({
        corpusDirectory: ASSISTANT_KNOWLEDGE_DIRECTORY,
        featuresDirectory: FEATURE_SPECIFICATIONS_DIRECTORY,
      }),
    );

    expect([...report.manifestIssues, ...report.documentIssues]).toEqual([]);
    expect(isKnowledgeCorpusValid(report)).toBe(true);
    expect(report.checksums.length).toBeGreaterThanOrEqual(6);
  });
});
