import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  ASSISTANT_DISABLED_MESSAGE,
  ASSISTANT_RUN_ERROR_CODES,
  AssistantService,
  createAssistantToolRegistry,
  resetAssistantRateLimit,
} from '../../../src/features/assistant/index.js';
import { ConversationRepository } from '../../../src/features/assistant/conversation-repository.js';
import { KnowledgeDocumentRepository } from '../../../src/features/assistant/knowledge-document-repository.js';
import { MessageRepository } from '../../../src/features/assistant/message-repository.js';
import { RunRepository } from '../../../src/features/assistant/run-repository.js';
import { SourceRepository } from '../../../src/features/assistant/source-repository.js';
import { assistantTransaction } from '../../../src/features/assistant/transaction.js';
import { hashPassword } from '../../../src/features/access/password.js';
import { UserRepository } from '../../../src/features/users/repository.js';
import { disconnectPrisma, prisma } from '../../../src/infrastructure/database/index.js';
import {
  createFakeKnowledgeRetriever,
  createFakeLanguageModelGateway,
  type AssistantConfig,
} from '../../../src/infrastructure/openai/index.js';
import { createTestApp } from '../../helpers/app.js';

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const ROOT = '/api/assistant';
const PASSWORD = 'assistant-http-password';
const users = new UserRepository();

function assistantConfig(overrides: Partial<AssistantConfig> = {}): AssistantConfig {
  return {
    enabled: true,
    apiKey: 'test-key',
    chatModel: 'gpt-test',
    vectorStoreId: 'vs_test',
    retentionDays: 90,
    dailyMessageLimit: 50,
    maxInputChars: 2000,
    maxOutputTokens: 1200,
    maxToolCalls: 3,
    maxRetrievalResults: 6,
    retrievalScoreThreshold: 0.55,
    requestTimeoutMs: 45_000,
    ...overrides,
  };
}

function createAssistantApp(config: AssistantConfig = assistantConfig()) {
  const repositories = {
    conversations: new ConversationRepository(),
    messages: new MessageRepository(),
    runs: new RunRepository(),
    sources: new SourceRepository(),
    knowledgeDocuments: new KnowledgeDocumentRepository(),
  };
  const service = new AssistantService({
    config,
    languageModel: createFakeLanguageModelGateway({
      events: [
        { type: 'delta', text: 'Respuesta de prueba.' },
        { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
        { type: 'done', providerResponseId: 'resp_http' },
      ],
    }),
    knowledgeRetriever: createFakeKnowledgeRetriever({
      chunks: [
        {
          sourceKey: 'guia-test',
          title: 'Guia test',
          version: '1',
          locator: 'Seccion',
          excerpt: 'Contenido aprobado.',
          score: 0.9,
          providerFileId: 'file_test',
          sourceRequirements: ['AI-002'],
        },
      ],
    }),
    toolRegistry: createAssistantToolRegistry([]),
    repositories,
    runTransaction: assistantTransaction,
  });
  return createTestApp({ assistantConfig: config, assistantService: service });
}

async function fixture(role: Role = 'ADMINISTRATOR', app = createAssistantApp()) {
  const user = await users.create({
    name: 'Assistant HTTP',
    username: randomUUID(),
    role,
    passwordHash: await hashPassword(PASSWORD),
  });
  const agent = request.agent(app);
  expect(
    (await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }))
      .status,
  ).toBe(200);
  return { user, agent, app };
}

function parseSseFrames(body: string): Array<{ event: string; data: unknown }> {
  const frames: Array<{ event: string; data: unknown }> = [];
  const blocks = body.split('\n\n').filter((block) => block.trim().length > 0);
  for (const block of blocks) {
    if (block.startsWith(':')) continue;
    const lines = block.split('\n');
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
      if (line.startsWith('data:')) data += line.slice('data:'.length).trim();
    }
    if (data.length > 0) {
      frames.push({ event, data: JSON.parse(data) as unknown });
    }
  }
  return frames;
}

describe('Assistant HTTP and SSE', () => {
  afterEach(async () => {
    await resetAssistantRateLimit();
    await prisma.assistantConversation.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(disconnectPrisma);

  it('returns 401 without authentication', async () => {
    const app = createAssistantApp();
    const response = await request(app).get(`${ROOT}/conversations`);
    expect(response.status).toBe(401);
  });

  it.each(['SELLER', 'MECHANIC'] as const)('returns 403 for %s', async (role) => {
    const { agent } = await fixture(role);
    const response = await agent.get(`${ROOT}/conversations`);
    expect(response.status).toBe(403);
  });

  it('returns 403 CSRF on POST without header', async () => {
    const { agent } = await fixture();
    const response = await agent.post(`${ROOT}/conversations`).send({});
    expect(response.status).toBe(403);
  });

  it('returns 503 ASSISTANT_DISABLED when the feature is off', async () => {
    const { agent } = await fixture(
      'ADMINISTRATOR',
      createAssistantApp(assistantConfig({ enabled: false })),
    );
    const response = await agent.post(`${ROOT}/conversations`).set(CSRF).send({});
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body.error.message).toBe(ASSISTANT_DISABLED_MESSAGE);
    expect(response.body.error.details).toEqual({
      reason: ASSISTANT_RUN_ERROR_CODES.DISABLED,
    });
  });

  it('creates, lists, streams with sources, and deletes conversations', async () => {
    const { agent } = await fixture();

    const created = await agent.post(`${ROOT}/conversations`).set(CSRF).send({});
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toMatchObject({
      id: expect.any(String),
      title: '',
    });

    const listed = await agent.get(`${ROOT}/conversations`);
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [expect.objectContaining({ id: created.body.id })],
    });

    const clientRequestId = randomUUID();
    const streamed = await agent
      .post(`${ROOT}/conversations/${created.body.id}/messages`)
      .set(CSRF)
      .send({ content: 'Como emito un conduce?', clientRequestId })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
      });

    expect(streamed.status).toBe(200);
    expect(streamed.headers['content-type']).toMatch(/text\/event-stream/);
    const frames = parseSseFrames(String(streamed.body));
    expect(frames.map((frame) => frame.event)).toEqual(
      expect.arrayContaining(['metadata', 'delta', 'sources', 'done']),
    );
    expect(frames.find((frame) => frame.event === 'metadata')?.data).toMatchObject({
      conversationId: created.body.id,
      userMessageId: expect.any(String),
      runId: expect.any(String),
    });
    expect(frames.find((frame) => frame.event === 'sources')?.data).toMatchObject({
      sources: [expect.objectContaining({ type: 'DOCUMENT', sourceKey: 'guia-test' })],
    });

    const messages = await agent.get(`${ROOT}/conversations/${created.body.id}/messages`);
    expect(messages.status).toBe(200);
    expect(messages.body.total).toBeGreaterThanOrEqual(2);
    const assistantMessage = messages.body.items.find(
      (item: { role: string }) => item.role === 'ASSISTANT',
    );
    expect(assistantMessage).toMatchObject({
      status: 'COMPLETED',
      content: expect.stringContaining('Respuesta'),
      sources: [expect.objectContaining({ sourceKey: 'guia-test' })],
    });

    const deleted = await agent.delete(`${ROOT}/conversations/${created.body.id}`).set(CSRF);
    expect(deleted.status).toBe(204);
  });

  it('returns 404 for foreign conversation ownership', async () => {
    const owner = await fixture();
    const other = await fixture();
    const created = await owner.agent.post(`${ROOT}/conversations`).set(CSRF).send({});
    expect(created.status).toBe(201);

    const messages = await other.agent.get(
      `${ROOT}/conversations/${created.body.id}/messages`,
    );
    expect(messages.status).toBe(404);

    const deleted = await other.agent
      .delete(`${ROOT}/conversations/${created.body.id}`)
      .set(CSRF);
    expect(deleted.status).toBe(404);
  });

  it('returns 409 when a second concurrent message arrives on an active run', async () => {
    const config = assistantConfig({ requestTimeoutMs: 10_000 });
    const repositories = {
      conversations: new ConversationRepository(),
      messages: new MessageRepository(),
      runs: new RunRepository(),
      sources: new SourceRepository(),
      knowledgeDocuments: new KnowledgeDocumentRepository(),
    };

    const hangingGateway = {
      async *streamCompletion(_request: unknown, signal?: AbortSignal) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 3_000);
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener('abort', onAbort, { once: true });
        });
        yield { type: 'delta' as const, text: 'tardio' };
        yield {
          type: 'usage' as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
        yield { type: 'done' as const, providerResponseId: 'slow' };
      },
    };

    const service = new AssistantService({
      config,
      languageModel: hangingGateway,
      knowledgeRetriever: createFakeKnowledgeRetriever({
        chunks: [
          {
            sourceKey: 'guia-test',
            title: 'Guia test',
            version: '1',
            locator: 'Seccion',
            excerpt: 'Contenido.',
            score: 0.9,
            providerFileId: 'file_test',
            sourceRequirements: ['AI-002'],
          },
        ],
      }),
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: assistantTransaction,
    });
    const app = createTestApp({ assistantConfig: config, assistantService: service });
    const { agent } = await fixture('ADMINISTRATOR', app);
    const created = await agent.post(`${ROOT}/conversations`).set(CSRF).send({});
    expect(created.status).toBe(201);

    const firstRequest = agent
      .post(`${ROOT}/conversations/${created.body.id}/messages`)
      .set(CSRF)
      .send({ content: 'pregunta lenta', clientRequestId: randomUUID() })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
      });
    // Superagent is lazy until thenable; start the stream without awaiting it yet.
    void firstRequest.then(() => undefined);

    const started = Date.now();
    while (Date.now() - started < 2_000) {
      const pending = await prisma.assistantRun.findFirst({
        where: { conversationId: created.body.id, status: 'PENDING' },
      });
      if (pending) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(
      await prisma.assistantRun.findFirst({
        where: { conversationId: created.body.id, status: 'PENDING' },
      }),
    ).not.toBeNull();

    const second = await agent
      .post(`${ROOT}/conversations/${created.body.id}/messages`)
      .set(CSRF)
      .send({ content: 'pregunta concurrente', clientRequestId: randomUUID() });

    expect(second.status).toBe(409);
    await firstRequest;
  });

  it('returns 429 when the daily quota is exhausted', async () => {
    const { agent } = await fixture(
      'ADMINISTRATOR',
      createAssistantApp(assistantConfig({ dailyMessageLimit: 1 })),
    );
    const created = await agent.post(`${ROOT}/conversations`).set(CSRF).send({});
    expect(created.status).toBe(201);

    const first = await agent
      .post(`${ROOT}/conversations/${created.body.id}/messages`)
      .set(CSRF)
      .send({ content: 'primera', clientRequestId: randomUUID() })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
      });
    expect(first.status).toBe(200);

    const second = await agent
      .post(`${ROOT}/conversations/${created.body.id}/messages`)
      .set(CSRF)
      .send({ content: 'segunda', clientRequestId: randomUUID() });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('keeps readiness independent of the assistant feature flag', async () => {
    const app = createAssistantApp(assistantConfig({ enabled: false }));
    const ready = await request(app).get('/api/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ok');
  });
});
