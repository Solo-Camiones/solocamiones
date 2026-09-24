import type { AssistantConversation, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import {
  ASSISTANT_CONVERSATION_PAGE_SIZE,
  ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH,
} from './constants.js';
import type {
  CreateConversationInput,
  ListOwnedConversationsQuery,
  PaginatedResult,
} from './types.js';

type ConversationDatabase = Pick<Prisma.TransactionClient, 'assistantConversation'>;

function addRetentionDays(from: Date, retentionDays: number): Date {
  const expiresAt = new Date(from.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
  return expiresAt;
}

export class ConversationRepository {
  constructor(private readonly database: ConversationDatabase = prisma) {}

  create(input: CreateConversationInput): Promise<AssistantConversation> {
    const now = input.now ?? new Date();
    const title = input.title ?? '';
    if (title.length > ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH) {
      throw new Error(
        `Conversation title exceeds ${ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH} characters`,
      );
    }

    return this.database.assistantConversation.create({
      data: {
        userId: input.userId,
        title,
        lastMessageAt: now,
        expiresAt: addRetentionDays(now, input.retentionDays),
        updatedAt: now,
      },
    });
  }

  findOwned(id: string, userId: string): Promise<AssistantConversation | null> {
    return this.database.assistantConversation.findFirst({
      where: { id, userId },
    });
  }

  async listOwned(
    query: ListOwnedConversationsQuery,
  ): Promise<PaginatedResult<AssistantConversation>> {
    const pageSize = query.pageSize ?? ASSISTANT_CONVERSATION_PAGE_SIZE;
    const where = { userId: query.userId };
    const [items, total] = await Promise.all([
      this.database.assistantConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.assistantConversation.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize };
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const result = await this.database.assistantConversation.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  }

  // Sliding retention: each turn extends expiresAt from lastMessageAt.
  touch(conversationId: string, retentionDays: number, now: Date = new Date()) {
    return this.database.assistantConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: now,
        expiresAt: addRetentionDays(now, retentionDays),
        updatedAt: now,
      },
    });
  }

  /** Sets title only when still empty (first user message of the conversation). */
  async updateTitleIfEmpty(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<boolean> {
    if (title.length > ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH) {
      throw new Error(
        `Conversation title exceeds ${ASSISTANT_CONVERSATION_TITLE_MAX_LENGTH} characters`,
      );
    }
    const result = await this.database.assistantConversation.updateMany({
      where: { id: conversationId, userId, title: '' },
      data: { title },
    });
    return result.count > 0;
  }

  listExpiredIds(now: Date, batchSize: number): Promise<Array<{ id: string }>> {
    return this.database.assistantConversation.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      select: { id: true },
    });
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.database.assistantConversation.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }
}

export { addRetentionDays };
