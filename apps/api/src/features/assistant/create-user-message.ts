import { Prisma } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE } from './constants.js';
import type { AssistantRepositories } from './transaction.js';
import type {
  CreateUserMessageWithRunInput,
  CreateUserMessageWithRunResult,
} from './types.js';

/**
 * Atomically creates a USER message + PENDING run and slides conversation retention.
 * Idempotent on (conversationId, clientRequestId): returns the existing pair when present.
 */
export async function createUserMessageWithRun(
  repositories: AssistantRepositories,
  input: CreateUserMessageWithRunInput,
): Promise<CreateUserMessageWithRunResult> {
  const conversation = await repositories.conversations.findOwned(
    input.conversationId,
    input.userId,
  );
  if (!conversation) {
    throw AppError.notFound();
  }

  const existingMessage = await repositories.messages.findByClientRequestId(
    input.conversationId,
    input.clientRequestId,
  );
  if (existingMessage) {
    const existingRun = await repositories.runs.findByUserMessageId(existingMessage.id);
    if (!existingRun) {
      throw AppError.internal('Idempotent assistant message is missing its run');
    }
    return { message: existingMessage, run: existingRun, created: false };
  }

  const pendingRun = await repositories.runs.findPendingByConversationId(input.conversationId);
  if (pendingRun) {
    throw AppError.conflict(ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE);
  }

  const now = input.now ?? new Date();

  try {
    const message = await repositories.messages.createUserMessage({
      conversationId: input.conversationId,
      content: input.content,
      clientRequestId: input.clientRequestId,
      now,
    });
    const run = await repositories.runs.createPending({
      conversationId: input.conversationId,
      userMessageId: message.id,
      model: input.model,
      promptVersion: input.promptVersion,
      startedAt: now,
    });
    await repositories.conversations.touch(input.conversationId, input.retentionDays, now);
    return { message, run, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const racedMessage = await repositories.messages.findByClientRequestId(
        input.conversationId,
        input.clientRequestId,
      );
      if (racedMessage) {
        const racedRun = await repositories.runs.findByUserMessageId(racedMessage.id);
        if (racedRun) {
          return { message: racedMessage, run: racedRun, created: false };
        }
      }
      throw AppError.conflict(ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE);
    }
    throw error;
  }
}
