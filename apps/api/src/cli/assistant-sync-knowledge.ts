import '../infrastructure/config/load-env.js';

import {
  createFileSystemKnowledgeCorpusReader,
  isKnowledgeCorpusValid,
  validateKnowledgeCorpus,
} from '../features/assistant/knowledge-corpus.js';
import { KnowledgeDocumentRepository } from '../features/assistant/knowledge-document-repository.js';
import {
  syncKnowledgeCorpus,
  type KnowledgeSyncOutcome,
} from '../features/assistant/knowledge-sync.js';
import { disconnectPrisma } from '../infrastructure/database/index.js';
import { createKnowledgeIndexWriter } from '../infrastructure/openai/create-providers.js';
import { parseKnowledgeSyncConfig } from '../infrastructure/openai/config.js';
import {
  ASSISTANT_KNOWLEDGE_DIRECTORY,
  FEATURE_SPECIFICATIONS_DIRECTORY,
  formatCorpusReport,
  parseKnowledgeCliArgs,
} from './assistant-knowledge-command.js';

const USAGE = 'Usage: assistant:sync-knowledge [--dry-run]';

function formatOutcome(outcome: KnowledgeSyncOutcome): string {
  const subject = outcome.sourceKey ?? outcome.providerFileId ?? '-';
  const failure =
    outcome.status === 'failed' ? ` errorCode=${outcome.errorCode} errorId=${outcome.errorId}` : '';
  return `[${outcome.status.toUpperCase()}] ${outcome.action} ${subject}${failure}`;
}

async function main(): Promise<void> {
  const args = parseKnowledgeCliArgs(process.argv.slice(2), { allowDryRun: true });

  if (args.help) {
    console.log(USAGE);
    console.log(
      'Syncs approved assistant knowledge to the OpenAI vector store of this environment.',
    );
    console.log(
      '--dry-run lists planned upload/replace/remove/orphan actions without mutating anything.',
    );
    process.exitCode = 0;
    return;
  }

  if (args.unknown.length > 0) {
    console.error(`Unknown arguments: ${args.unknown.join(', ')}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const corpus = await validateKnowledgeCorpus(
      createFileSystemKnowledgeCorpusReader({
        corpusDirectory: ASSISTANT_KNOWLEDGE_DIRECTORY,
        featuresDirectory: FEATURE_SPECIFICATIONS_DIRECTORY,
      }),
    );
    for (const line of formatCorpusReport(corpus)) {
      console.log(line);
    }
    if (corpus.manifestIssues.length > 0) {
      console.error('Manifest is invalid; nothing was synced.');
      process.exitCode = 1;
      return;
    }

    const writer = createKnowledgeIndexWriter(parseKnowledgeSyncConfig());
    const result = await syncKnowledgeCorpus(
      { documents: new KnowledgeDocumentRepository(), writer },
      { corpus, dryRun: args.dryRun },
    );

    console.log(args.dryRun ? 'Dry-run: no changes were made.' : 'Sync finished.');
    for (const outcome of result.outcomes) {
      console.log(formatOutcome(outcome));
    }
    process.exitCode = result.failed || !isKnowledgeCorpusValid(corpus) ? 1 : 0;
  } catch (error) {
    console.error('Assistant knowledge sync failed.');
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

void main();
