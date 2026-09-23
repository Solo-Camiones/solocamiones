import { type AssistantKnowledgeDocument, Prisma } from '@prisma/client';

import { prisma } from '../../infrastructure/database/index.js';
import type {
  UpdateKnowledgeDocumentStatusInput,
  UpsertKnowledgeDocumentInput,
} from './types.js';

type KnowledgeDatabase = Pick<Prisma.TransactionClient, 'assistantKnowledgeDocument'>;

export class KnowledgeDocumentRepository {
  constructor(private readonly database: KnowledgeDatabase = prisma) {}

  findBySourceKey(sourceKey: string): Promise<AssistantKnowledgeDocument | null> {
    return this.database.assistantKnowledgeDocument.findUnique({ where: { sourceKey } });
  }

  list(): Promise<AssistantKnowledgeDocument[]> {
    return this.database.assistantKnowledgeDocument.findMany({
      orderBy: [{ sourceKey: 'asc' }],
    });
  }

  upsertBySourceKey(input: UpsertKnowledgeDocumentInput): Promise<AssistantKnowledgeDocument> {
    const now = new Date();
    return this.database.assistantKnowledgeDocument.upsert({
      where: { sourceKey: input.sourceKey },
      create: {
        sourceKey: input.sourceKey,
        title: input.title,
        version: input.version,
        contentSha256: input.contentSha256,
        status: input.status ?? 'SYNC_PENDING',
        providerFileId: input.providerFileId,
        approvedAt: input.approvedAt,
        indexedAt: input.indexedAt,
        lastSyncedAt: input.lastSyncedAt,
        metadata: input.metadata ?? undefined,
        errorCode: input.errorCode,
        errorId: input.errorId,
        updatedAt: now,
      },
      update: {
        title: input.title,
        version: input.version,
        contentSha256: input.contentSha256,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.providerFileId !== undefined ? { providerFileId: input.providerFileId } : {}),
        ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
        ...(input.indexedAt !== undefined ? { indexedAt: input.indexedAt } : {}),
        ...(input.lastSyncedAt !== undefined ? { lastSyncedAt: input.lastSyncedAt } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata ?? Prisma.JsonNull } : {}),
        ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
        ...(input.errorId !== undefined ? { errorId: input.errorId } : {}),
        updatedAt: now,
      },
    });
  }

  async updateStatus(
    input: UpdateKnowledgeDocumentStatusInput,
  ): Promise<AssistantKnowledgeDocument | null> {
    const existing = await this.findBySourceKey(input.sourceKey);
    if (!existing) return null;

    return this.database.assistantKnowledgeDocument.update({
      where: { sourceKey: input.sourceKey },
      data: {
        status: input.status,
        ...(input.providerFileId !== undefined ? { providerFileId: input.providerFileId } : {}),
        ...(input.indexedAt !== undefined ? { indexedAt: input.indexedAt } : {}),
        ...(input.lastSyncedAt !== undefined ? { lastSyncedAt: input.lastSyncedAt } : {}),
        ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
        ...(input.errorId !== undefined ? { errorId: input.errorId } : {}),
      },
    });
  }
}
