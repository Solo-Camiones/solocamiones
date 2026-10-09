import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disconnectPrisma: vi.fn(async () => undefined),
  runAssistantEval: vi.fn(),
  defaultEvalPaths: vi.fn(() => ({
    datasetPath: 'dataset.json',
    pricingPath: 'pricing.json',
    reportPath: 'report.json',
  })),
  validateKnowledgeCorpus: vi.fn(),
  isKnowledgeCorpusValid: vi.fn(() => true),
  syncKnowledgeCorpus: vi.fn(),
  createKnowledgeIndexWriter: vi.fn(() => ({})),
  parseKnowledgeSyncConfig: vi.fn(() => ({})),
  hashKnowledgeDocuments: vi.fn(),
  purgeExpiredConversations: vi.fn(),
  readFile: vi.fn(async () => '{}'),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: mocks.readFile };
});

vi.mock('../../../src/infrastructure/database/index.js', () => ({
  disconnectPrisma: mocks.disconnectPrisma,
}));

vi.mock('../../../src/features/assistant/eval/index.js', () => ({
  defaultEvalPaths: mocks.defaultEvalPaths,
  runAssistantEval: mocks.runAssistantEval,
}));

vi.mock('../../../src/features/assistant/knowledge-corpus.js', () => ({
  createFileSystemKnowledgeCorpusReader: vi.fn(() => ({})),
  isKnowledgeCorpusValid: mocks.isKnowledgeCorpusValid,
  validateKnowledgeCorpus: mocks.validateKnowledgeCorpus,
}));

vi.mock('../../../src/features/assistant/knowledge-sync.js', () => ({
  syncKnowledgeCorpus: mocks.syncKnowledgeCorpus,
}));

vi.mock('../../../src/infrastructure/openai/create-providers.js', () => ({
  createKnowledgeIndexWriter: mocks.createKnowledgeIndexWriter,
}));

vi.mock('../../../src/infrastructure/openai/config.js', () => ({
  parseKnowledgeSyncConfig: mocks.parseKnowledgeSyncConfig,
}));

vi.mock('../../../src/features/assistant/purge.js', () => ({
  purgeExpiredConversations: mocks.purgeExpiredConversations,
}));

vi.mock('../../../src/features/assistant/conversation-repository.js', () => ({
  ConversationRepository: class {},
}));

vi.mock('../../../src/features/assistant/knowledge-document-repository.js', () => ({
  KnowledgeDocumentRepository: class {},
}));

vi.mock('../../../src/cli/assistant-knowledge-command.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/cli/assistant-knowledge-command.js')>();
  return {
    ...actual,
    formatCorpusReport: vi.fn(() => ['corpus report']),
    hashKnowledgeDocuments: mocks.hashKnowledgeDocuments,
  };
});

import { runAssistantEvalCli } from '../../../src/cli/assistant-eval.js';
import { runAssistantHashKnowledgeCli } from '../../../src/cli/assistant-hash-knowledge.js';
import { runAssistantPurgeCli } from '../../../src/cli/assistant-purge.js';
import { runAssistantSyncKnowledgeCli } from '../../../src/cli/assistant-sync-knowledge.js';
import { runAssistantValidateKnowledgeCli } from '../../../src/cli/assistant-validate-knowledge.js';

const validCorpus = {
  manifestIssues: [],
  documentIssues: [],
  checksums: [],
  approved: [],
  draftSourceKeys: [],
  invalidSourceKeys: [],
};

describe('assistant CLI entrypoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
    mocks.isKnowledgeCorpusValid.mockReturnValue(true);
    mocks.validateKnowledgeCorpus.mockResolvedValue(validCorpus);
  });

  it('handles eval help, invalid arguments, success, failed gates, and runtime errors', async () => {
    await runAssistantEvalCli(['--help']);
    expect(process.exitCode).toBe(0);

    await runAssistantEvalCli(['--unknown']);
    expect(process.exitCode).toBe(1);

    await runAssistantEvalCli([]);
    expect(process.exitCode).toBe(1);

    mocks.runAssistantEval
      .mockResolvedValueOnce({
        mode: 'fake',
        environment: 'local-fake',
        datasetVersion: 'v1',
        aggregate: { passedCases: 39, totalCases: 39, estimatedCostUsd: 0.001 },
        hardGates: { passed: true, failures: [] },
      })
      .mockResolvedValueOnce({
        mode: 'fake',
        environment: 'local-fake',
        datasetVersion: 'v1',
        aggregate: { passedCases: 38, totalCases: 39, estimatedCostUsd: 0.001 },
        hardGates: { passed: false, failures: ['mutation gate'] },
      })
      .mockRejectedValueOnce(new Error('eval failed'));

    await runAssistantEvalCli(['--mode=fake']);
    expect(process.exitCode).toBe(0);
    await runAssistantEvalCli(['--mode=fake']);
    expect(process.exitCode).toBe(1);
    await runAssistantEvalCli(['--mode=fake']);
    expect(process.exitCode).toBe(1);
    expect(mocks.disconnectPrisma).toHaveBeenCalledTimes(3);
  });

  it('handles knowledge validation and hashing outcomes', async () => {
    await runAssistantValidateKnowledgeCli(['--help']);
    await runAssistantValidateKnowledgeCli(['--bad']);
    await runAssistantValidateKnowledgeCli([]);
    expect(process.exitCode).toBe(0);

    mocks.isKnowledgeCorpusValid.mockReturnValueOnce(false);
    await runAssistantValidateKnowledgeCli([]);
    expect(process.exitCode).toBe(1);

    mocks.validateKnowledgeCorpus.mockRejectedValueOnce(new Error('invalid corpus'));
    await runAssistantValidateKnowledgeCli([]);
    expect(process.exitCode).toBe(1);

    await runAssistantHashKnowledgeCli(['--help']);
    await runAssistantHashKnowledgeCli(['--bad']);
    mocks.hashKnowledgeDocuments.mockResolvedValueOnce([
      { sourceKey: 'guide', sha256: 'abc' },
      { sourceKey: 'missing', error: 'not found' },
    ]);
    await runAssistantHashKnowledgeCli(['guide', 'missing']);
    expect(process.exitCode).toBe(1);

    mocks.readFile.mockRejectedValueOnce(new Error('manifest missing'));
    await runAssistantHashKnowledgeCli([]);
    expect(process.exitCode).toBe(1);
  });

  it('handles sync dry-runs, invalid manifests, failures, and exceptions', async () => {
    await runAssistantSyncKnowledgeCli(['--help']);
    await runAssistantSyncKnowledgeCli(['--bad']);

    mocks.validateKnowledgeCorpus.mockResolvedValueOnce({
      ...validCorpus,
      manifestIssues: [{ message: 'bad manifest' }],
    });
    await runAssistantSyncKnowledgeCli([]);
    expect(process.exitCode).toBe(1);

    mocks.syncKnowledgeCorpus.mockResolvedValueOnce({
      failed: false,
      outcomes: [{ status: 'unchanged', action: 'keep', sourceKey: 'guide' }],
    });
    await runAssistantSyncKnowledgeCli(['--dry-run']);
    expect(process.exitCode).toBe(0);

    mocks.syncKnowledgeCorpus.mockResolvedValueOnce({
      failed: true,
      outcomes: [
        {
          status: 'failed',
          action: 'upload',
          sourceKey: null,
          providerFileId: 'file-1',
          errorCode: 'FAILED',
          errorId: 'error-1',
        },
      ],
    });
    await runAssistantSyncKnowledgeCli([]);
    expect(process.exitCode).toBe(1);

    mocks.validateKnowledgeCorpus.mockRejectedValueOnce(new Error('sync failed'));
    await runAssistantSyncKnowledgeCli([]);
    expect(process.exitCode).toBe(1);
    expect(mocks.disconnectPrisma).toHaveBeenCalledTimes(4);
  });

  it('handles purge help, invalid arguments, dry-run, deletion, and failures', async () => {
    await runAssistantPurgeCli(['--help']);
    await runAssistantPurgeCli(['--bad']);

    mocks.purgeExpiredConversations
      .mockResolvedValueOnce({
        dryRun: true,
        candidateCount: 2,
        deletedCount: 0,
        conversationIds: ['c1', 'c2'],
      })
      .mockResolvedValueOnce({
        dryRun: false,
        candidateCount: 2,
        deletedCount: 2,
        conversationIds: ['c1', 'c2'],
      })
      .mockRejectedValueOnce(new Error('database unavailable'));

    await runAssistantPurgeCli(['--dry-run']);
    expect(process.exitCode).toBe(0);
    await runAssistantPurgeCli([]);
    expect(process.exitCode).toBe(0);
    await runAssistantPurgeCli([]);
    expect(process.exitCode).toBe(1);
    expect(mocks.disconnectPrisma).toHaveBeenCalledTimes(3);
  });
});
