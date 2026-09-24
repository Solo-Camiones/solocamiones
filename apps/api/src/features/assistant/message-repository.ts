import type { AssistantMessage, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import { businessDateString, businessDayRange } from '../payments/dates.js';
import { ASSISTANT_MESSAGE_PAGE_SIZE } from './constants.js';
import type {
  CreateAssistantMessageInput,
  ListMessagesQuery,
  PaginatedResult,
} from './types.js';

type MessageDatabase = Pick<
  Prisma.TransactionClient,
  'assistantMessage' | 'assistantConversation'
>;

export class MessageRepository {
  constructor(private readonly database: MessageDatabase = prisma) {}

  async listByConversation(
    query: ListMessagesQuery,
  ): Promise<PaginatedResult<AssistantMessage>> {
    const pageSize = query.pageSize ?? ASSISTANT_MESSAGE_PAGE_SIZE;
    const where = { conversationId: query.conversationId };
    const [items, total] = await Promise.all([
      this.database.assistantMessage.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.assistantMessage.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize };
  }

  /**
   * Newest COMPLETED messages for provider context (caller reverses/truncates).
   * Excludes the current turn when `excludeMessageId` is set.
   */
  async listRecentCompleted(
    conversationId: string,
    limit: number,
    excludeMessageId?: string,
  ): Promise<AssistantMessage[]> {
    const items = await this.database.assistantMessage.findMany({
      where: {
        conversationId,
        status: 'COMPLETED',
        ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return items.reverse();
  }

  /** USER messages owned by the actor created on the business calendar day. */
  countUserMessagesForActorOnBusinessDay(userId: string, now: Date): Promise<number> {
    const day = businessDateString(now);
    const range = businessDayRange(day, day);
    return this.database.assistantMessage.count({
      where: {
        role: 'USER',
        createdAt: { gte: range.gte, lte: range.lte },
        conversation: { userId },
      },
    });
  }

  findByClientRequestId(
    conversationId: string,
    clientRequestId: string,
  ): Promise<AssistantMessage | null> {
    return this.database.assistantMessage.findUnique({
      where: {
        conversationId_clientRequestId: { conversationId, clientRequestId },
      },
    });
  }

  findById(id: string): Promise<AssistantMessage | null> {
    return this.database.assistantMessage.findUnique({ where: { id } });
  }

  createUserMessage(input: {
    conversationId: string;
    content: string;
    clientRequestId: string;
    now?: Date;
  }): Promise<AssistantMessage> {
    const now = input.now ?? new Date();
    return this.database.assistantMessage.create({
      data: {
        conversationId: input.conversationId,
        role: 'USER',
        status: 'COMPLETED',
        content: input.content,
        clientRequestId: input.clientRequestId,
        createdAt: now,
        completedAt: now,
      },
    });
  }

  createAssistantMessage(input: CreateAssistantMessageInput): Promise<AssistantMessage> {
    const status = input.status ?? 'PENDING';
    const completedAt =
      status === 'PENDING' ? null : (input.completedAt ?? new Date());

    return this.database.assistantMessage.create({
      data: {
        conversationId: input.conversationId,
        role: 'ASSISTANT',
        status,
        content: input.content,
        clientRequestId: null,
        completedAt,
      },
    });
  }

  async completeAssistantMessage(
    id: string,
    content: string,
    completedAt: Date = new Date(),
  ): Promise<AssistantMessage | null> {
    const result = await this.database.assistantMessage.updateMany({
      where: { id, role: 'ASSISTANT', status: 'PENDING' },
      data: { status: 'COMPLETED', content, completedAt },
    });
    if (result.count === 0) return null;
    return this.database.assistantMessage.findUnique({ where: { id } });
  }

  async failOrCancelAssistantMessage(
    id: string,
    status: 'FAILED' | 'CANCELLED',
    content: string,
    completedAt: Date = new Date(),
  ): Promise<AssistantMessage | null> {
    const result = await this.database.assistantMessage.updateMany({
      where: { id, role: 'ASSISTANT', status: 'PENDING' },
      data: { status, content, completedAt },
    });
    if (result.count === 0) return null;
    return this.database.assistantMessage.findUnique({ where: { id } });
  }
}
