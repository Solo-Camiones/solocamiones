import { ASSISTANT_PURGE_BATCH_SIZE } from './constants.js';
import type { ConversationRepository } from './conversation-repository.js';
import type {
  PurgeExpiredConversationsInput,
  PurgeExpiredConversationsResult,
} from './types.js';

export async function purgeExpiredConversations(
  conversations: ConversationRepository,
  input: PurgeExpiredConversationsInput = {},
): Promise<PurgeExpiredConversationsResult> {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? ASSISTANT_PURGE_BATCH_SIZE;
  const dryRun = input.dryRun ?? false;

  const candidates = await conversations.listExpiredIds(now, batchSize);
  const conversationIds = candidates.map((row) => row.id);

  if (dryRun || conversationIds.length === 0) {
    return {
      dryRun,
      candidateCount: conversationIds.length,
      deletedCount: 0,
      conversationIds,
    };
  }

  const deletedCount = await conversations.deleteByIds(conversationIds);
  return {
    dryRun: false,
    candidateCount: conversationIds.length,
    deletedCount,
    conversationIds,
  };
}
