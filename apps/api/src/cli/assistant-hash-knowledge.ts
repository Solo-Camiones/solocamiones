import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ASSISTANT_KNOWLEDGE_DIRECTORY,
  hashKnowledgeDocuments,
  parseKnowledgeCliArgs,
} from './assistant-knowledge-command.js';

const USAGE = 'Usage: assistant:hash-knowledge [sourceKey ...]';
const MANIFEST_FILE_NAME = 'manifest.json';

async function main(): Promise<void> {
  const args = parseKnowledgeCliArgs(process.argv.slice(2), { allowDryRun: false });

  if (args.help) {
    console.log(USAGE);
    console.log(
      'Prints the normalized SHA-256 of each manifest document (or only the given sourceKeys) to paste into manifest.json when approving it.',
    );
    process.exitCode = 0;
    return;
  }

  // Everything that is not a flag is a sourceKey; unknown flags are still rejected.
  const unknownFlags = args.unknown.filter((arg) => arg.startsWith('-'));
  if (unknownFlags.length > 0) {
    console.error(`Unknown arguments: ${unknownFlags.join(', ')}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const rawManifest = await readFile(
      path.join(ASSISTANT_KNOWLEDGE_DIRECTORY, MANIFEST_FILE_NAME),
      'utf8',
    );
    const results = await hashKnowledgeDocuments(
      rawManifest,
      (relativePath) => readFile(path.join(ASSISTANT_KNOWLEDGE_DIRECTORY, relativePath), 'utf8'),
      args.unknown,
    );

    for (const result of results) {
      if ('sha256' in result) {
        console.log(`${result.sourceKey} ${result.sha256}`);
      } else {
        console.error(`[ERROR] ${result.sourceKey}: ${result.error}`);
      }
    }
    process.exitCode = results.some((result) => 'error' in result) ? 1 : 0;
  } catch (error) {
    console.error('Assistant knowledge hashing failed.');
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}

void main();
