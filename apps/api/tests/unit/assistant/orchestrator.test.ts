import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  ASSISTANT_INSUFFICIENT_EVIDENCE_MESSAGE,
  ASSISTANT_PROMPT_VERSION,
  ASSISTANT_RUN_ERROR_CODES,
  AssistantService,
  createAssistantToolRegistry,
  titleFromUserContent,
  truncateAssistantHistory,
  type AssistantDomainEvent,
  type AssistantRepositories,
  type AssistantTool,
} from '../../../src/features/assistant/index.js';
import { hasFactualEvidence } from '../../../src/features/assistant/evidence.js';
import {
  createFakeKnowledgeRetriever,
  createFakeLanguageModelGateway,
  type AssistantConfig,
  type KnowledgeChunk,
  type LanguageModelEvent,
} from '../../../src/infrastructure/openai/index.js';
import { AssistantProviderError } from '../../../src/infrastructure/openai/errors.js';
import { z } from 'zod';

import type {
  AssistantConversation,
  AssistantMessage,
  AssistantRun,
  AssistantSource,
} from '@prisma/client';

function baseConfig(overrides: Partial<AssistantConfig> = {}): AssistantConfig {
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

type MemoryStore = {
  conversations: Map<string, AssistantConversation>;
  messages: Map<string, AssistantMessage>;
  runs: Map<string, AssistantRun>;
  sources: Map<string, AssistantSource>;
};

function createMemoryRepositories(store: MemoryStore): AssistantRepositories {
  const conversations = {
    async findOwned(id: string, userId: string) {
      const row = store.conversations.get(id);
      if (!row || row.userId !== userId) return null;
      return row;
    },
    async updateTitleIfEmpty(conversationId: string, userId: string, title: string) {
      const row = store.conversations.get(conversationId);
      if (!row || row.userId !== userId || row.title !== '') return false;
      row.title = title;
      return true;
    },
    async touch(conversationId: string, _retentionDays: number, now: Date) {
      const row = store.conversations.get(conversationId);
      if (!row) throw new Error('missing conversation');
      row.lastMessageAt = now;
      row.updatedAt = now;
      return row;
    },
  };

  const messages = {
    async findByClientRequestId(conversationId: string, clientRequestId: string) {
      return (
        [...store.messages.values()].find(
          (message) =>
            message.conversationId === conversationId &&
            message.clientRequestId === clientRequestId,
        ) ?? null
      );
    },
    async findById(id: string) {
      return store.messages.get(id) ?? null;
    },
    async createUserMessage(input: {
      conversationId: string;
      content: string;
      clientRequestId: string;
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const message: AssistantMessage = {
        id: randomUUID(),
        conversationId: input.conversationId,
        role: 'USER',
        status: 'COMPLETED',
        content: input.content,
        clientRequestId: input.clientRequestId,
        createdAt: now,
        completedAt: now,
      };
      store.messages.set(message.id, message);
      return message;
    },
    async createAssistantMessage(input: {
      conversationId: string;
      content: string;
      status?: AssistantMessage['status'];
      completedAt?: Date | null;
    }) {
      const status = input.status ?? 'PENDING';
      const message: AssistantMessage = {
        id: randomUUID(),
        conversationId: input.conversationId,
        role: 'ASSISTANT',
        status,
        content: input.content,
        clientRequestId: null,
        createdAt: new Date(),
        completedAt: status === 'PENDING' ? null : (input.completedAt ?? new Date()),
      };
      store.messages.set(message.id, message);
      return message;
    },
    async completeAssistantMessage(id: string, content: string, completedAt = new Date()) {
      const message = store.messages.get(id);
      if (!message || message.status !== 'PENDING') return null;
      message.status = 'COMPLETED';
      message.content = content;
      message.completedAt = completedAt;
      return message;
    },
    async failOrCancelAssistantMessage(
      id: string,
      status: 'FAILED' | 'CANCELLED',
      content: string,
      completedAt = new Date(),
    ) {
      const message = store.messages.get(id);
      if (!message || message.status !== 'PENDING') return null;
      message.status = status;
      message.content = content;
      message.completedAt = completedAt;
      return message;
    },
    async listRecentCompleted(conversationId: string, limit: number, excludeMessageId?: string) {
      return [...store.messages.values()]
        .filter(
          (message) =>
            message.conversationId === conversationId &&
            message.status === 'COMPLETED' &&
            message.id !== excludeMessageId,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(-limit);
    },
    async countUserMessagesForActorOnBusinessDay(userId: string, _now: Date) {
      return [...store.messages.values()].filter((message) => {
        if (message.role !== 'USER') return false;
        const conversation = store.conversations.get(message.conversationId);
        return conversation?.userId === userId;
      }).length;
    },
    async listByConversation() {
      return { items: [], total: 0, page: 1, pageSize: 50 };
    },
  };

  const runs = {
    async findByUserMessageId(userMessageId: string) {
      return [...store.runs.values()].find((run) => run.userMessageId === userMessageId) ?? null;
    },
    async findPendingByConversationId(conversationId: string) {
      return (
        [...store.runs.values()].find(
          (run) => run.conversationId === conversationId && run.status === 'PENDING',
        ) ?? null
      );
    },
    async createPending(input: {
      conversationId: string;
      userMessageId: string;
      model: string;
      promptVersion: string;
      startedAt?: Date;
    }) {
      const run: AssistantRun = {
        id: randomUUID(),
        conversationId: input.conversationId,
        userMessageId: input.userMessageId,
        assistantMessageId: null,
        status: 'PENDING',
        model: input.model,
        promptVersion: input.promptVersion,
        providerResponseId: null,
        inputTokens: null,
        outputTokens: null,
        toolCallCount: 0,
        toolCalls: null,
        startedAt: input.startedAt ?? new Date(),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        errorId: null,
      };
      store.runs.set(run.id, run);
      return run;
    },
    async complete(input: {
      runId: string;
      assistantMessageId?: string;
      providerResponseId?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      toolCallCount?: number;
      toolCalls?: unknown;
      latencyMs?: number | null;
      completedAt?: Date;
    }) {
      const run = store.runs.get(input.runId);
      if (!run || run.status !== 'PENDING') return null;
      run.status = 'COMPLETED';
      run.completedAt = input.completedAt ?? new Date();
      if (input.assistantMessageId !== undefined) run.assistantMessageId = input.assistantMessageId;
      if (input.providerResponseId !== undefined) {
        run.providerResponseId = input.providerResponseId;
      }
      if (input.inputTokens !== undefined) run.inputTokens = input.inputTokens;
      if (input.outputTokens !== undefined) run.outputTokens = input.outputTokens;
      if (input.toolCallCount !== undefined) run.toolCallCount = input.toolCallCount;
      if (input.toolCalls !== undefined) run.toolCalls = input.toolCalls as never;
      if (input.latencyMs !== undefined) run.latencyMs = input.latencyMs;
      return run;
    },
    async fail(input: {
      runId: string;
      errorCode: string;
      errorId?: string | null;
      assistantMessageId?: string | null;
      latencyMs?: number | null;
      completedAt?: Date;
    }) {
      const run = store.runs.get(input.runId);
      if (!run || run.status !== 'PENDING') return null;
      run.status = 'FAILED';
      run.errorCode = input.errorCode;
      run.errorId = input.errorId ?? null;
      run.completedAt = input.completedAt ?? new Date();
      if (input.assistantMessageId !== undefined) {
        run.assistantMessageId = input.assistantMessageId;
      }
      if (input.latencyMs !== undefined) run.latencyMs = input.latencyMs;
      return run;
    },
    async cancel(input: {
      runId: string;
      errorCode: string;
      errorId?: string | null;
      assistantMessageId?: string | null;
      latencyMs?: number | null;
      completedAt?: Date;
    }) {
      const run = store.runs.get(input.runId);
      if (!run || run.status !== 'PENDING') return null;
      run.status = 'CANCELLED';
      run.errorCode = input.errorCode;
      run.errorId = input.errorId ?? null;
      run.completedAt = input.completedAt ?? new Date();
      if (input.assistantMessageId !== undefined) {
        run.assistantMessageId = input.assistantMessageId;
      }
      if (input.latencyMs !== undefined) run.latencyMs = input.latencyMs;
      return run;
    },
  };

  const sources = {
    async createMany(inputs: Array<Omit<AssistantSource, 'id'> & { assistantMessageId: string }>) {
      for (const input of inputs) {
        const source: AssistantSource = {
          id: randomUUID(),
          assistantMessageId: input.assistantMessageId,
          type: input.type,
          sourceKey: input.sourceKey,
          title: input.title,
          locator: input.locator ?? null,
          sortOrder: input.sortOrder,
          appPath: input.appPath ?? null,
          excerpt: input.excerpt ?? null,
          score: input.score ?? null,
          asOf: input.asOf ?? null,
        };
        store.sources.set(source.id, source);
      }
      return { count: inputs.length };
    },
    async listByAssistantMessageId(assistantMessageId: string) {
      return [...store.sources.values()]
        .filter((source) => source.assistantMessageId === assistantMessageId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
  };

  return {
    conversations: conversations as unknown as AssistantRepositories['conversations'],
    messages: messages as unknown as AssistantRepositories['messages'],
    runs: runs as unknown as AssistantRepositories['runs'],
    sources: sources as unknown as AssistantRepositories['sources'],
    knowledgeDocuments: {} as AssistantRepositories['knowledgeDocuments'],
  };
}

function seedConversation(store: MemoryStore, userId = randomUUID()) {
  const conversation: AssistantConversation = {
    id: randomUUID(),
    userId,
    title: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  };
  store.conversations.set(conversation.id, conversation);
  return conversation;
}

async function collectEvents(
  iterable: AsyncIterable<AssistantDomainEvent>,
): Promise<AssistantDomainEvent[]> {
  const events: AssistantDomainEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

const sampleChunk: KnowledgeChunk = {
  providerFileId: 'file_1',
  sourceKey: 'guia-conduces',
  title: 'Conduces',
  version: '1',
  locator: 'Como emitir',
  excerpt: 'Para emitir un conduce...',
  score: 0.9,
  sourceRequirements: ['AI-002'],
};

describe('truncateAssistantHistory', () => {
  it('keeps newest messages and drops oldest user+assistant pairs under the char cap', () => {
    const messages = [
      { id: '1', role: 'USER' as const, content: 'a'.repeat(10_000) },
      { id: '2', role: 'ASSISTANT' as const, content: 'b'.repeat(10_000) },
      { id: '3', role: 'USER' as const, content: 'c'.repeat(5_000) },
      { id: '4', role: 'ASSISTANT' as const, content: 'd'.repeat(5_000) },
    ];
    const truncated = truncateAssistantHistory(messages, {
      maxMessages: 12,
      maxChars: 12_000,
    });
    expect(truncated.map((message) => message.id)).toEqual(['3', '4']);
  });
});

describe('titleFromUserContent', () => {
  it('trims and caps at 80 characters', () => {
    expect(titleFromUserContent(`  ${'x'.repeat(100)}  `).length).toBe(80);
  });
});

describe('hasFactualEvidence', () => {
  it('requires retrieval hits or successful tools', () => {
    expect(hasFactualEvidence([], [])).toBe(false);
    expect(hasFactualEvidence([sampleChunk], [])).toBe(true);
    expect(
      hasFactualEvidence([], [
        {
          name: 'searchCustomers',
          sourceKey: 'tool:searchCustomers',
          title: 'searchCustomers',
          appPath: null,
          asOf: null,
        },
      ]),
    ).toBe(true);
  });
});

describe('AssistantService', () => {
  it('answers a documentary question with document sources', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const service = new AssistantService({
      config: baseConfig(),
      languageModel: createFakeLanguageModelGateway({
        events: [
          { type: 'delta', text: 'Para emitir un conduce usa el flujo documentado.' },
          { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
          { type: 'done', providerResponseId: 'resp_doc' },
        ],
      }),
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [sampleChunk] }),
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
      createErrorId: () => 'err-fixed',
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'Como emito un conduce?',
        clientRequestId: randomUUID(),
      }),
    );

    expect(events[0]).toMatchObject({ type: 'metadata' });
    expect(events.some((event) => event.type === 'delta')).toBe(true);
    const sourcesEvent = events.find((event) => event.type === 'sources');
    expect(sourcesEvent).toMatchObject({
      type: 'sources',
      sources: [expect.objectContaining({ type: 'DOCUMENT', sourceKey: 'guia-conduces' })],
    });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(store.conversations.get(conversation.id)?.title).toContain('Como emito');
    expect([...store.runs.values()][0]?.promptVersion).toBe(ASSISTANT_PROMPT_VERSION);
  });

  it('runs a live tool then final answer with tool source', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const execute = vi.fn(async () => ({
      items: [{ id: 'c1', name: 'Cliente Demo', appPath: '/customers' }],
      asOf: '2026-09-24T12:00:00.000Z',
      sourceKey: 'tool:searchCustomers',
    }));
    const tool: AssistantTool = {
      name: 'searchCustomers',
      description: 'search',
      inputSchema: z.object({ query: z.string().optional() }),
      parameters: { type: 'object' },
      execute,
    };

    const service = new AssistantService({
      config: baseConfig(),
      languageModel: createFakeLanguageModelGateway({
        script: [
          {
            events: [
              {
                type: 'tool_call',
                id: 'call_1',
                name: 'searchCustomers',
                argumentsJson: '{"query":"Demo"}',
              },
              { type: 'usage', usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } },
              { type: 'done', providerResponseId: 'resp_tool' },
            ],
          },
          {
            events: [
              { type: 'delta', text: 'Encontre Cliente Demo.' },
              { type: 'usage', usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } },
              { type: 'done', providerResponseId: 'resp_final' },
            ],
          },
        ],
      }),
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [] }),
      toolRegistry: createAssistantToolRegistry([tool]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'Busca cliente Demo',
        clientRequestId: randomUUID(),
      }),
    );

    expect(execute).toHaveBeenCalledOnce();
    const sourcesEvent = events.find((event) => event.type === 'sources');
    expect(sourcesEvent).toMatchObject({
      type: 'sources',
      sources: [expect.objectContaining({ type: 'TOOL', sourceKey: 'tool:searchCustomers' })],
    });
    expect(events.some((event) => event.type === 'delta' && event.text.includes('Cliente Demo'))).toBe(
      true,
    );
  });

  it('converts factual answers without evidence into insufficiency', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const service = new AssistantService({
      config: baseConfig(),
      languageModel: createFakeLanguageModelGateway({
        events: [
          { type: 'delta', text: 'Inventando un flujo de inventario.' },
          { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
          { type: 'done', providerResponseId: 'resp_none' },
        ],
      }),
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [] }),
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'Cuantas piezas hay en stock?',
        clientRequestId: randomUUID(),
      }),
    );

    const delta = events.find((event) => event.type === 'delta');
    expect(delta).toMatchObject({
      type: 'delta',
      text: ASSISTANT_INSUFFICIENT_EVIDENCE_MESSAGE,
    });
    expect(events.find((event) => event.type === 'sources')).toMatchObject({
      type: 'sources',
      sources: [],
    });
    const assistantMessages = [...store.messages.values()].filter(
      (message) => message.role === 'ASSISTANT',
    );
    expect(assistantMessages[0]?.content).toBe(ASSISTANT_INSUFFICIENT_EVIDENCE_MESSAGE);
    expect(assistantMessages[0]?.status).toBe('COMPLETED');
  });

  it('rejects a fourth tool call and marks the run FAILED with empty assistant content', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const tool: AssistantTool = {
      name: 'searchCustomers',
      description: 'search',
      inputSchema: z.object({}).passthrough(),
      parameters: { type: 'object' },
      execute: async () => ({
        items: [],
        asOf: '2026-09-24T12:00:00.000Z',
        sourceKey: 'tool:searchCustomers',
      }),
    };

    const fourCalls: LanguageModelEvent[] = [
      { type: 'tool_call', id: 'c1', name: 'searchCustomers', argumentsJson: '{}' },
      { type: 'tool_call', id: 'c2', name: 'searchCustomers', argumentsJson: '{}' },
      { type: 'tool_call', id: 'c3', name: 'searchCustomers', argumentsJson: '{}' },
      { type: 'tool_call', id: 'c4', name: 'searchCustomers', argumentsJson: '{}' },
      { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
      { type: 'done', providerResponseId: 'resp_max' },
    ];

    const service = new AssistantService({
      config: baseConfig({ maxToolCalls: 3 }),
      languageModel: createFakeLanguageModelGateway({ events: fourCalls }),
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [] }),
      toolRegistry: createAssistantToolRegistry([tool]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'haz muchas busquedas',
        clientRequestId: randomUUID(),
      }),
    );

    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(events.find((event) => event.type === 'error')).toMatchObject({
      code: ASSISTANT_RUN_ERROR_CODES.MAX_TOOLS,
      retryable: false,
    });
    const assistant = [...store.messages.values()].find((message) => message.role === 'ASSISTANT');
    expect(assistant?.status).toBe('FAILED');
    expect(assistant?.content).toBe('');
    expect([...store.runs.values()][0]?.status).toBe('FAILED');
  });

  it('rejects unknown tools safely and still completes when later evidence exists via retrieval', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);

    const service = new AssistantService({
      config: baseConfig(),
      languageModel: createFakeLanguageModelGateway({
        script: [
          {
            events: [
              {
                type: 'tool_call',
                id: 'bad',
                name: 'dropDatabase',
                argumentsJson: '{}',
              },
              { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
              { type: 'done', providerResponseId: 'resp_bad' },
            ],
          },
          {
            events: [
              { type: 'delta', text: 'Segun la guia documentada...' },
              { type: 'usage', usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 } },
              { type: 'done', providerResponseId: 'resp_ok' },
            ],
          },
        ],
      }),
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [sampleChunk] }),
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'pregunta hibrida',
        clientRequestId: randomUUID(),
      }),
    );

    expect(events.at(-1)?.type).toBe('done');
    const sourcesEvent = events.find((event) => event.type === 'sources');
    expect(sourcesEvent).toMatchObject({
      type: 'sources',
      sources: [expect.objectContaining({ type: 'DOCUMENT' })],
    });
  });

  it('enforces daily quota before creating a message', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    // Seed one prior USER message so limit 1 is already exhausted.
    await repositories.messages.createUserMessage({
      conversationId: conversation.id,
      content: 'prev',
      clientRequestId: randomUUID(),
    });

    const retrieve = vi.fn();
    const service = new AssistantService({
      config: baseConfig({ dailyMessageLimit: 1 }),
      languageModel: createFakeLanguageModelGateway(),
      knowledgeRetriever: {
        retrieve: retrieve,
      },
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'otra pregunta',
        clientRequestId: randomUUID(),
      }),
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        code: ASSISTANT_RUN_ERROR_CODES.QUOTA,
        retryable: false,
      }),
    ]);
  });

  it('maps provider 429 to a retryable error and does not complete the assistant message', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const service = new AssistantService({
      config: baseConfig(),
      languageModel: createFakeLanguageModelGateway({
        error: AssistantProviderError.rateLimit(),
      }),
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [sampleChunk] }),
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'hola',
        clientRequestId: randomUUID(),
      }),
    );

    expect(events.find((event) => event.type === 'error')).toMatchObject({
      type: 'error',
      code: ASSISTANT_RUN_ERROR_CODES.PROVIDER_RATE_LIMIT,
      retryable: true,
    });
    const assistant = [...store.messages.values()].find((message) => message.role === 'ASSISTANT');
    expect(assistant?.status).toBe('FAILED');
    expect(assistant?.content).toBe('');
  });

  it('replays a completed idempotent clientRequestId without calling the provider again', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const clientRequestId = randomUUID();
    let modelCalls = 0;

    const languageModel = createFakeLanguageModelGateway({
      events: [
        { type: 'delta', text: 'Respuesta documentada.' },
        { type: 'usage', usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 } },
        { type: 'done', providerResponseId: 'resp_once' },
      ],
    });
    const countingModel = {
      streamCompletion: async function* (
        request: Parameters<typeof languageModel.streamCompletion>[0],
        signal?: AbortSignal,
      ) {
        modelCalls += 1;
        yield* languageModel.streamCompletion(request, signal);
      },
    };

    const service = new AssistantService({
      config: baseConfig(),
      languageModel: countingModel,
      knowledgeRetriever: createFakeKnowledgeRetriever({ chunks: [sampleChunk] }),
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const input = {
      conversationId: conversation.id,
      userId: conversation.userId,
      content: 'Como emito un conduce?',
      clientRequestId,
    };

    await collectEvents(service.streamMessage(input));
    const second = await collectEvents(service.streamMessage(input));

    expect(modelCalls).toBe(1);
    expect(second[0]).toMatchObject({ type: 'metadata' });
    expect(second.some((event) => event.type === 'done')).toBe(true);
  });

  it('returns DISABLED without calling retrieval when the feature flag is off', async () => {
    const store: MemoryStore = {
      conversations: new Map(),
      messages: new Map(),
      runs: new Map(),
      sources: new Map(),
    };
    const conversation = seedConversation(store);
    const repositories = createMemoryRepositories(store);
    const retrieve = vi.fn();
    const service = new AssistantService({
      config: baseConfig({ enabled: false }),
      languageModel: createFakeLanguageModelGateway(),
      knowledgeRetriever: { retrieve },
      toolRegistry: createAssistantToolRegistry([]),
      repositories,
      runTransaction: async (work) => work(repositories),
    });

    const events = await collectEvents(
      service.streamMessage({
        conversationId: conversation.id,
        userId: conversation.userId,
        content: 'hola',
        clientRequestId: randomUUID(),
      }),
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        code: ASSISTANT_RUN_ERROR_CODES.DISABLED,
        retryable: false,
      }),
    ]);
  });
});
