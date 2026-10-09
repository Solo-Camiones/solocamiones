import type { AssistantMessage, AssistantRun } from '@prisma/client';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  assistantGlobalQuotaExceededError,
  assistantQuotaExceededError,
} from './classify-error.js';
import { ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE } from './constants.js';
import { createUserMessageWithRun } from './create-user-message.js';
import type { AssistantRepositories } from './transaction.js';
import type { CreateUserMessageWithRunInput } from './types.js';

export type ReserveAssistantTurnInput = CreateUserMessageWithRunInput & {
  title: string;
  dailyMessageLimit: number;
  globalDailyMessageLimit: number;
};

export type ReserveAssistantTurnResult =
  | { created: false; message: AssistantMessage; run: AssistantRun }
  | {
      created: true;
      message: AssistantMessage;
      run: AssistantRun;
      assistantMessage: AssistantMessage;
    };

/**
 * Atomically reserves quota and creates every pending row required by a turn.
 * The caller must execute this function in the Serializable assistant transaction.
 */
export async function reserveAssistantTurn(
  repositories: AssistantRepositories,
  input: ReserveAssistantTurnInput,
): Promise<ReserveAssistantTurnResult> {
  const existingMessage = await repositories.messages.findByClientRequestId(
    input.conversationId,
    input.clientRequestId,
  );
  if (existingMessage) {
    const existingRun = await repositories.runs.findByUserMessageId(existingMessage.id);
    if (!existingRun) {
      throw AppError.internal('Idempotent assistant message is missing its run');
    }
    return { created: false, message: existingMessage, run: existingRun };
  }

  const pendingRun = await repositories.runs.findPendingByConversationId(input.conversationId);
  if (pendingRun) {
    throw AppError.conflict(ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE);
  }

  const now = input.now ?? new Date();
  const usedToday = await repositories.messages.countUserMessagesForActorOnBusinessDay(
    input.userId,
    now,
  );
  if (usedToday >= input.dailyMessageLimit) {
    throw assistantQuotaExceededError();
  }

  const usedGlobally = await repositories.messages.countUserMessagesOnBusinessDay(now);
  if (usedGlobally >= input.globalDailyMessageLimit) {
    throw assistantGlobalQuotaExceededError();
  }

  const created = await createUserMessageWithRun(repositories, input);
  if (!created.created) {
    return { created: false, message: created.message, run: created.run };
  }

  if (input.title.length > 0) {
    await repositories.conversations.updateTitleIfEmpty(
      input.conversationId,
      input.userId,
      input.title,
    );
  }

  const assistantMessage = await repositories.messages.createAssistantMessage({
    conversationId: input.conversationId,
    content: '',
    status: 'PENDING',
  });

  return { ...created, assistantMessage };
}
