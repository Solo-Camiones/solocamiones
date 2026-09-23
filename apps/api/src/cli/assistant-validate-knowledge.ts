import {
  createFileSystemKnowledgeCorpusReader,
  isKnowledgeCorpusValid,
  validateKnowledgeCorpus,
} from '../features/assistant/knowledge-corpus.js';
import {
  ASSISTANT_KNOWLEDGE_DIRECTORY,
  FEATURE_SPECIFICATIONS_DIRECTORY,
  formatCorpusReport,
  parseKnowledgeCliArgs,
} from './assistant-knowledge-command.js';

const USAGE = 'Usage: assistant:validate-knowledge';

async function main(): Promise<void> {
  const args = parseKnowledgeCliArgs(process.argv.slice(2), { allowDryRun: false });

  if (args.help) {
    console.log(USAGE);
    console.log(
      'Validates docs/assistant-knowledge/manifest.json offline (schema, files, checksums, requirement IDs).',
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
    const report = await validateKnowledgeCorpus(
      createFileSystemKnowledgeCorpusReader({
        corpusDirectory: ASSISTANT_KNOWLEDGE_DIRECTORY,
        featuresDirectory: FEATURE_SPECIFICATIONS_DIRECTORY,
      }),
    );
    for (const line of formatCorpusReport(report)) {
      console.log(line);
    }
    process.exitCode = isKnowledgeCorpusValid(report) ? 0 : 1;
  } catch (error) {
    console.error('Assistant knowledge validation failed.');
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}

void main();
