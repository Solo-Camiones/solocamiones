import '../infrastructure/config/load-env.js';

import { ConversationRepository } from '../features/assistant/conversation-repository.js';
import { purgeExpiredConversations } from '../features/assistant/purge.js';
import { disconnectPrisma } from '../infrastructure/database/index.js';
import { parseAssistantPurgeArgs } from './assistant-purge-command.js';

async function main(): Promise<void> {
  const args = parseAssistantPurgeArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: assistant:purge [--dry-run]');
    console.log('Deletes expired assistant conversations in batches of 100.');
    process.exitCode = 0;
    return;
  }

  if (args.unknown.length > 0) {
    console.error(`Unknown arguments: ${args.unknown.join(', ')}`);
    console.error('Usage: assistant:purge [--dry-run]');
    process.exitCode = 1;
    return;
  }

  try {
    const conversations = new ConversationRepository();
    const result = await purgeExpiredConversations(conversations, {
      dryRun: args.dryRun,
    });

    if (args.dryRun) {
      console.log(
        `Dry-run: ${result.candidateCount} expired conversation(s) would be deleted in this batch.`,
      );
    } else {
      console.log(
        `Purged ${result.deletedCount} expired conversation(s) in this batch (candidates: ${result.candidateCount}).`,
      );
    }
    process.exitCode = 0;
  } catch (error) {
    console.error('Assistant purge failed.');
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

void main();
