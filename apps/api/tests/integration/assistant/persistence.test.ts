import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE,
  ASSISTANT_PURGE_BATCH_SIZE,
} from '../../../src/features/assistant/constants.js';
import { ConversationRepository } from '../../../src/features/assistant/conversation-repository.js';
import { createUserMessageWithRun } from '../../../src/features/assistant/create-user-message.js';
import { KnowledgeDocumentRepository } from '../../../src/features/assistant/knowledge-document-repository.js';
import { MessageRepository } from '../../../src/features/assistant/message-repository.js';
import { purgeExpiredConversations } from '../../../src/features/assistant/purge.js';
import { RunRepository } from '../../../src/features/assistant/run-repository.js';
import { SourceRepository } from '../../../src/features/assistant/source-repository.js';
import { assistantTransaction } from '../../../src/features/assistant/transaction.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import { AppError } from '../../../src/infrastructure/errors/app-error.js';

const users = new UserRepository();
const conversations = new ConversationRepository();
const messages = new MessageRepository();
const runs = new RunRepository();
const sources = new SourceRepository();
const knowledgeDocuments = new KnowledgeDocumentRepository();

async function createAdministrator() {
  return users.create({
    name: 'Assistant admin',
    username: `assistant-${randomUUID()}`,
    role: 'ADMINISTRATOR',
    passwordHash: 'assistant-test-fixture',
  });
}

describe('Assistant persistence (PostgreSQL)', () => {
  afterEach(async () => {
    await prisma.assistantKnowledgeDocument.deleteMany();
    await prisma.assistantConversation.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(disconnectPrisma);

  it('creates owned conversations with sliding expiresAt and isolates foreign ownership', async () => {
    const owner = await createAdministrator();
    const other = await createAdministrator();
    const now = new Date('2026-09-23T12:00:00.000Z');

    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
      now,
    });

    expect(conversation.title).toBe('');
    expect(conversation.expiresAt.toISOString()).toBe('2026-12-22T12:00:00.000Z');
    expect(await conversations.findOwned(conversation.id, owner.id)).toMatchObject({
      id: conversation.id,
    });
    expect(await conversations.findOwned(conversation.id, other.id)).toBeNull();
    expect(await conversations.deleteOwned(conversation.id, other.id)).toBe(false);
    expect(await conversations.deleteOwned(conversation.id, owner.id)).toBe(true);
  });

  it('creates user message + run atomically, touches retention, and is idempotent', async () => {
    const owner = await createAdministrator();
    const now = new Date('2026-09-23T12:00:00.000Z');
    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
      now,
    });
    const clientRequestId = randomUUID();

    const first = await assistantTransaction((repos) =>
      createUserMessageWithRun(repos, {
        conversationId: conversation.id,
        userId: owner.id,
        content: 'Busca FAC-000123',
        clientRequestId,
        model: 'gpt-test',
        promptVersion: 'assistant-v1',
        retentionDays: 90,
        now: new Date('2026-09-24T12:00:00.000Z'),
      }),
    );

    expect(first.created).toBe(true);
    expect(first.message.role).toBe('USER');
    expect(first.message.status).toBe('COMPLETED');
    expect(first.run.status).toBe('PENDING');

    const touched = await conversations.findOwned(conversation.id, owner.id);
    expect(touched?.lastMessageAt.toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(touched?.expiresAt.toISOString()).toBe('2026-12-23T12:00:00.000Z');

    const second = await assistantTransaction((repos) =>
      createUserMessageWithRun(repos, {
        conversationId: conversation.id,
        userId: owner.id,
        content: 'contenido distinto ignorado',
        clientRequestId,
        model: 'gpt-other',
        promptVersion: 'assistant-v2',
        retentionDays: 90,
      }),
    );

    expect(second.created).toBe(false);
    expect(second.message.id).toBe(first.message.id);
    expect(second.run.id).toBe(first.run.id);
    expect(second.message.content).toBe('Busca FAC-000123');
  });

  it('rejects a second pending run on the same conversation', async () => {
    const owner = await createAdministrator();
    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
    });

    await assistantTransaction((repos) =>
      createUserMessageWithRun(repos, {
        conversationId: conversation.id,
        userId: owner.id,
        content: 'primera',
        clientRequestId: randomUUID(),
        model: 'gpt-test',
        promptVersion: 'assistant-v1',
        retentionDays: 90,
      }),
    );

    await expect(
      assistantTransaction((repos) =>
        createUserMessageWithRun(repos, {
          conversationId: conversation.id,
          userId: owner.id,
          content: 'segunda',
          clientRequestId: randomUUID(),
          model: 'gpt-test',
          promptVersion: 'assistant-v1',
          retentionDays: 90,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: ASSISTANT_ACTIVE_RUN_CONFLICT_MESSAGE,
    } satisfies Partial<AppError>);
  });

  it('completes or fails a run only once', async () => {
    const owner = await createAdministrator();
    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
    });
    const turn = await assistantTransaction((repos) =>
      createUserMessageWithRun(repos, {
        conversationId: conversation.id,
        userId: owner.id,
        content: 'pregunta',
        clientRequestId: randomUUID(),
        model: 'gpt-test',
        promptVersion: 'assistant-v1',
        retentionDays: 90,
      }),
    );

    const assistantMessage = await messages.createAssistantMessage({
      conversationId: conversation.id,
      content: 'respuesta',
      status: 'COMPLETED',
    });

    const completed = await runs.complete({
      runId: turn.run.id,
      assistantMessageId: assistantMessage.id,
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 100,
    });
    expect(completed?.status).toBe('COMPLETED');

    const secondComplete = await runs.complete({
      runId: turn.run.id,
      assistantMessageId: assistantMessage.id,
      latencyMs: 200,
    });
    expect(secondComplete).toBeNull();

    const failed = await runs.fail({
      runId: turn.run.id,
      errorCode: 'PROVIDER_TIMEOUT',
    });
    expect(failed).toBeNull();

    await sources.createMany([
      {
        assistantMessageId: assistantMessage.id,
        type: 'DOCUMENT',
        sourceKey: 'guide-payments',
        title: 'Pagos',
        sortOrder: 0,
        excerpt: 'CxC',
      },
    ]);
    const listed = await sources.listByAssistantMessageId(assistantMessage.id);
    expect(listed).toHaveLength(1);
  });

  it('paginates conversations and messages deterministically', async () => {
    const owner = await createAdministrator();
    const base = new Date('2026-09-23T10:00:00.000Z');

    const created = [];
    for (let index = 0; index < 3; index += 1) {
      const conversation = await conversations.create({
        userId: owner.id,
        retentionDays: 90,
        now: new Date(base.getTime() + index * 60_000),
      });
      created.push(conversation);
      for (let messageIndex = 0; messageIndex < 2; messageIndex += 1) {
        await messages.createUserMessage({
          conversationId: conversation.id,
          content: `m-${index}-${messageIndex}`,
          clientRequestId: randomUUID(),
          now: new Date(base.getTime() + index * 60_000 + messageIndex),
        });
      }
    }

    const page = await conversations.listOwned({ userId: owner.id, page: 1, pageSize: 2 });
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.id).toBe(created[2]?.id);
    expect(page.items[1]?.id).toBe(created[1]?.id);

    const messagePage = await messages.listByConversation({
      conversationId: created[0]!.id,
      page: 1,
      pageSize: 1,
    });
    expect(messagePage.total).toBe(2);
    expect(messagePage.items).toHaveLength(1);
    expect(messagePage.items[0]?.content).toBe('m-0-0');
  });

  it('cascades assistant rows from conversation without deleting the user', async () => {
    const owner = await createAdministrator();
    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
    });
    const turn = await assistantTransaction((repos) =>
      createUserMessageWithRun(repos, {
        conversationId: conversation.id,
        userId: owner.id,
        content: 'cascade',
        clientRequestId: randomUUID(),
        model: 'gpt-test',
        promptVersion: 'assistant-v1',
        retentionDays: 90,
      }),
    );

    await conversations.deleteByIds([conversation.id]);

    expect(await runs.findById(turn.run.id)).toBeNull();
    expect(await messages.findByClientRequestId(conversation.id, turn.message.clientRequestId!)).toBeNull();
    expect(await users.findById(owner.id)).not.toBeNull();
  });

  it('cascades assistant conversations when the owning user is deleted', async () => {
    const owner = await createAdministrator();
    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
    });

    await prisma.user.delete({ where: { id: owner.id } });

    expect(await conversations.findOwned(conversation.id, owner.id)).toBeNull();
    expect(await prisma.assistantConversation.count()).toBe(0);
  });

  it('purges expired conversations with dry-run and batch delete', async () => {
    const owner = await createAdministrator();
    const expiredNow = new Date('2026-09-23T12:00:00.000Z');

    const expired = await conversations.create({
      userId: owner.id,
      retentionDays: 1,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const active = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
      now: expiredNow,
    });

    const dryRun = await purgeExpiredConversations(conversations, {
      now: expiredNow,
      dryRun: true,
      batchSize: ASSISTANT_PURGE_BATCH_SIZE,
    });
    expect(dryRun.candidateCount).toBe(1);
    expect(dryRun.deletedCount).toBe(0);
    expect(dryRun.conversationIds).toEqual([expired.id]);
    expect(await conversations.findOwned(expired.id, owner.id)).not.toBeNull();

    const purged = await purgeExpiredConversations(conversations, {
      now: expiredNow,
      dryRun: false,
    });
    expect(purged.deletedCount).toBe(1);
    expect(await conversations.findOwned(expired.id, owner.id)).toBeNull();
    expect(await conversations.findOwned(active.id, owner.id)).not.toBeNull();
  });

  it('upserts knowledge documents by sourceKey without provider calls', async () => {
    const created = await knowledgeDocuments.upsertBySourceKey({
      sourceKey: 'guide-cxc',
      title: 'CxC',
      version: '1',
      contentSha256: 'abc',
      status: 'SYNC_PENDING',
    });
    expect(created.status).toBe('SYNC_PENDING');

    const updated = await knowledgeDocuments.updateStatus({
      sourceKey: 'guide-cxc',
      status: 'READY',
      indexedAt: new Date('2026-09-23T12:00:00.000Z'),
    });
    expect(updated?.status).toBe('READY');
    expect(await knowledgeDocuments.findBySourceKey('missing')).toBeNull();
  });

  it('enforces SQL checks for assistant message clientRequestId rules', async () => {
    const owner = await createAdministrator();
    const conversation = await conversations.create({
      userId: owner.id,
      retentionDays: 90,
    });

    await expect(
      prisma.assistantMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          status: 'COMPLETED',
          content: 'sin client request',
          clientRequestId: null,
          completedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
