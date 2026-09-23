import { Prisma, type AssistantRun } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import type { CompleteRunInput, FailOrCancelRunInput } from './types.js';

type RunDatabase = Pick<Prisma.TransactionClient, 'assistantRun'>;

export class RunRepository {
  constructor(private readonly database: RunDatabase = prisma) {}

  createPending(input: {
    conversationId: string;
    userMessageId: string;
    model: string;
    promptVersion: string;
    startedAt?: Date;
  }): Promise<AssistantRun> {
    return this.database.assistantRun.create({
      data: {
        conversationId: input.conversationId,
        userMessageId: input.userMessageId,
        status: 'PENDING',
        model: input.model,
        promptVersion: input.promptVersion,
        startedAt: input.startedAt ?? new Date(),
      },
    });
  }

  findById(id: string): Promise<AssistantRun | null> {
    return this.database.assistantRun.findUnique({ where: { id } });
  }

  findByUserMessageId(userMessageId: string): Promise<AssistantRun | null> {
    return this.database.assistantRun.findUnique({ where: { userMessageId } });
  }

  findPendingByConversationId(conversationId: string): Promise<AssistantRun | null> {
    return this.database.assistantRun.findFirst({
      where: { conversationId, status: 'PENDING' },
    });
  }

  // Conditional update: only a PENDING run may complete (M2-T11).
  async complete(input: CompleteRunInput): Promise<AssistantRun | null> {
    const completedAt = input.completedAt ?? new Date();
    const data: Prisma.AssistantRunUncheckedUpdateManyInput = {
      status: 'COMPLETED',
      completedAt,
      latencyMs: input.latencyMs ?? null,
      providerResponseId: input.providerResponseId ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
    };
    if (input.assistantMessageId !== undefined) {
      data.assistantMessageId = input.assistantMessageId;
    }
    if (input.toolCallCount !== undefined) {
      data.toolCallCount = input.toolCallCount;
    }
    if (input.toolCalls !== undefined) {
      data.toolCalls = input.toolCalls === null ? Prisma.DbNull : input.toolCalls;
    }

    const result = await this.database.assistantRun.updateMany({
      where: { id: input.runId, status: 'PENDING' },
      data,
    });
    if (result.count === 0) return null;
    return this.findById(input.runId);
  }

  async fail(input: FailOrCancelRunInput): Promise<AssistantRun | null> {
    return this.finishUnsuccessfully('FAILED', input);
  }

  async cancel(input: FailOrCancelRunInput): Promise<AssistantRun | null> {
    return this.finishUnsuccessfully('CANCELLED', input);
  }

  private async finishUnsuccessfully(
    status: 'FAILED' | 'CANCELLED',
    input: FailOrCancelRunInput,
  ): Promise<AssistantRun | null> {
    const completedAt = input.completedAt ?? new Date();
    const data: Prisma.AssistantRunUncheckedUpdateManyInput = {
      status,
      completedAt,
      errorCode: input.errorCode,
      errorId: input.errorId ?? null,
      latencyMs: input.latencyMs ?? null,
      providerResponseId: input.providerResponseId ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
    };
    if (input.assistantMessageId !== undefined) {
      data.assistantMessageId = input.assistantMessageId;
    }
    if (input.toolCallCount !== undefined) {
      data.toolCallCount = input.toolCallCount;
    }
    if (input.toolCalls !== undefined) {
      data.toolCalls = input.toolCalls === null ? Prisma.DbNull : input.toolCalls;
    }

    const result = await this.database.assistantRun.updateMany({
      where: { id: input.runId, status: 'PENDING' },
      data,
    });
    if (result.count === 0) return null;
    return this.findById(input.runId);
  }
}
