import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_KNOWLEDGE_DIRECTORY,
  FEATURE_SPECIFICATIONS_DIRECTORY,
  parseKnowledgeCliArgs,
} from '../../../src/cli/assistant-knowledge-command.js';
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
