import type { AssistantSource, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import type { CreateSourceInput } from './types.js';

type SourceDatabase = Pick<Prisma.TransactionClient, 'assistantSource'>;

export class SourceRepository {
  constructor(private readonly database: SourceDatabase = prisma) {}

  create(input: CreateSourceInput): Promise<AssistantSource> {
    return this.database.assistantSource.create({
      data: {
        assistantMessageId: input.assistantMessageId,
        type: input.type,
        sourceKey: input.sourceKey,
        title: input.title,
        locator: input.locator,
        sortOrder: input.sortOrder,
        appPath: input.appPath,
        excerpt: input.excerpt,
        score: input.score,
        asOf: input.asOf,
      },
    });
  }

  createMany(inputs: CreateSourceInput[]): Promise<Prisma.BatchPayload> {
    return this.database.assistantSource.createMany({
      data: inputs.map((input) => ({
        assistantMessageId: input.assistantMessageId,
        type: input.type,
        sourceKey: input.sourceKey,
        title: input.title,
        locator: input.locator,
        sortOrder: input.sortOrder,
        appPath: input.appPath,
        excerpt: input.excerpt,
        score: input.score,
        asOf: input.asOf,
      })),
    });
  }

  listByAssistantMessageId(assistantMessageId: string): Promise<AssistantSource[]> {
    return this.database.assistantSource.findMany({
      where: { assistantMessageId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /** Batch load for message history pages (avoids N+1). */
  listByAssistantMessageIds(assistantMessageIds: string[]): Promise<AssistantSource[]> {
    if (assistantMessageIds.length === 0) return Promise.resolve([]);
    return this.database.assistantSource.findMany({
      where: { assistantMessageId: { in: assistantMessageIds } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }
}
