import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  createKnowledgeRetriever,
  createLanguageModelGateway,
  parseAssistantConfig,
  type AssistantConfig,
} from '../../../infrastructure/openai/index.js';
import { ASSISTANT_PROMPT_VERSION } from '../constants.js';
import { AssistantService } from '../service.js';
import { ConversationRepository } from '../conversation-repository.js';
import { MessageRepository } from '../message-repository.js';
import { RunRepository } from '../run-repository.js';
import { SourceRepository } from '../source-repository.js';
import { KnowledgeDocumentRepository } from '../knowledge-document-repository.js';
import { ReadyKnowledgeRetriever } from '../ready-knowledge-retriever.js';
import { createCommercialAssistantToolRegistry } from '../tools/create-commercial-tools.js';
import { assistantTransaction } from '../transaction.js';
import { prisma } from '../../../infrastructure/database/index.js';
import type { AssistantDomainEvent } from '../domain-events.js';
import type { AssistantSourceView } from '../evidence.js';
import {
  evalDatasetSchema,
  validateDatasetComposition,
  type EvalCase,
  type EvalDataset,
} from './dataset-schema.js';
import { evalPricingTableSchema, estimateUsdCost } from './pricing.js';
import { substitutePlaceholders } from './placeholders.js';
import {
  cleanupEvalFixtures,
  captureCommercialSnapshot,
  diffCommercialSnapshots,
  seedEvalFixtures,
  type EvalFixtures,
} from './seed-fixtures.js';
import { buildFakeProvidersForCase } from './build-fake-providers.js';
import { scoreCase, type CaseScore } from './scorer.js';
import {
  aggregateScores,
  documentSourceKeysFromSources,
  evaluateHardGates,
  toolSourceKeysFromSources,
  type SuiteAggregate,
} from './aggregate.js';
import { EVAL_THRESHOLDS } from './thresholds.js';

export type EvalMode = 'fake' | 'real';

export type RunEvalOptions = {
  mode: EvalMode;
  datasetPath: string;
  pricingPath: string;
  reportPath: string;
  caseId?: string;
};

export type EvalReport = {
  generatedAt: string;
  mode: EvalMode;
  environment: 'local-fake' | 'local-real';
  datasetVersion: string;
  promptVersion: string;
  chatModel: string;
  thresholds: typeof EVAL_THRESHOLDS;
  aggregate: SuiteAggregate;
  hardGates: { passed: boolean; failures: string[] };
  humanAccuracyReview: {
    status: 'pending';
    target: number;
    notes: string;
  };
  cases: Array<{
    score: CaseScore;
    ttftMs: number | null;
    latencyMs: number;
    tokens: { input: number; output: number; total: number };
    estimatedCostUsd: number;
  }>;
  pricingAsOf: string;
};

function baseConfig(overrides: Partial<AssistantConfig> = {}): AssistantConfig {
  const parsed = parseAssistantConfig();
  return {
    ...parsed,
    enabled: true,
    dailyMessageLimit: 10_000,
    globalDailyMessageLimit: 10_000,
    ...overrides,
  };
}

function createRepositories() {
  return {
    conversations: new ConversationRepository(prisma),
    messages: new MessageRepository(prisma),
    runs: new RunRepository(prisma),
    sources: new SourceRepository(prisma),
    knowledgeDocuments: new KnowledgeDocumentRepository(prisma),
  };
}

function createFakeService(
  evalCase: EvalCase,
  placeholders: Record<string, string>,
  config: AssistantConfig,
): AssistantService {
  const fakes = buildFakeProvidersForCase(evalCase, placeholders);
  return new AssistantService({
    config,
    languageModel: fakes.languageModel,
    knowledgeRetriever: fakes.knowledgeRetriever,
    toolRegistry: createCommercialAssistantToolRegistry(),
    repositories: createRepositories(),
    runTransaction: assistantTransaction,
  });
}

function createRealService(config: AssistantConfig): AssistantService {
  if (!config.apiKey || !config.vectorStoreId) {
    throw new Error(
      'Real eval requires OPENAI_API_KEY and OPENAI_VECTOR_STORE_ID (with ASSISTANT_ENABLED capable config).',
    );
  }
  const repositories = createRepositories();
  return new AssistantService({
    config,
    languageModel: createLanguageModelGateway(config),
    knowledgeRetriever: new ReadyKnowledgeRetriever(
      createKnowledgeRetriever(config),
      repositories.knowledgeDocuments,
    ),
    toolRegistry: createCommercialAssistantToolRegistry(),
    repositories,
    runTransaction: assistantTransaction,
  });
}

async function collectStream(events: AsyncIterable<AssistantDomainEvent>): Promise<{
  text: string;
  sources: AssistantSourceView[];
  errorCode: string | null;
  ttftMs: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  const started = Date.now();
  let firstDeltaAt: number | null = null;
  let text = '';
  let sources: AssistantSourceView[] = [];
  let errorCode: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for await (const event of events) {
    if (event.type === 'delta') {
      if (firstDeltaAt == null) firstDeltaAt = Date.now();
      text += event.text;
    } else if (event.type === 'sources') {
      sources = event.sources;
    } else if (event.type === 'done') {
      inputTokens = event.usage.inputTokens;
      outputTokens = event.usage.outputTokens;
      totalTokens = event.usage.totalTokens;
    } else if (event.type === 'error') {
      errorCode = event.code;
    }
  }

  return {
    text,
    sources,
    errorCode,
    ttftMs: firstDeltaAt == null ? null : firstDeltaAt - started,
    latencyMs: Date.now() - started,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

async function loadJsonFile(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as unknown;
}

export async function runAssistantEval(options: RunEvalOptions): Promise<EvalReport> {
  const datasetJson = await loadJsonFile(options.datasetPath);
  const dataset = evalDatasetSchema.parse(datasetJson);
  const compositionIssues = validateDatasetComposition(dataset);
  if (compositionIssues.length > 0) {
    throw new Error(compositionIssues.map((issue) => issue.message).join('; '));
  }

  const pricingJson = await loadJsonFile(options.pricingPath);
  const pricing = evalPricingTableSchema.parse(pricingJson);

  let cases = dataset.cases as EvalCase[];
  if (options.caseId != null) {
    cases = cases.filter((evalCase) => evalCase.id === options.caseId);
    if (cases.length === 0) {
      throw new Error(`Case not found: ${options.caseId}`);
    }
  }

  const config = baseConfig(
    options.mode === 'real'
      ? {}
      : {
          apiKey: 'eval-fake-key',
          vectorStoreId: 'vs_eval_fake',
          chatModel: parseAssistantConfig().chatModel,
        },
  );

  const needsFixtures = cases.some(
    (evalCase) =>
      evalCase.requiresFixtures ||
      evalCase.category === 'live' ||
      evalCase.category === 'hybrid' ||
      evalCase.fakeToolCalls.length > 0,
  );

  let fixtures: EvalFixtures | null = null;
  if (needsFixtures) {
    fixtures = await seedEvalFixtures();
  }

  const placeholders = fixtures?.placeholders ?? {
    adminUserId: '',
    customerCashId: '',
    customerCashName: '',
    customerCreditId: '',
    customerCreditName: '',
    quoteId: '',
    quoteNumber: '',
    conduceId: '',
    conduceNumber: '',
    invoiceId: '',
    invoiceNumber: '',
    profitabilityDateFrom: '2026-09-01',
    profitabilityDateTo: '2026-09-30',
  };

  const actorId = fixtures?.adminUserId;
  if (actorId == null && needsFixtures) {
    throw new Error('Eval fixtures missing admin user');
  }

  // Documentary-only fake runs still need an Administrator for conversation ownership.
  let adminUserId = actorId;
  if (adminUserId == null) {
    fixtures = await seedEvalFixtures();
    adminUserId = fixtures.adminUserId;
    Object.assign(placeholders, fixtures.placeholders);
  }

  const caseResults: EvalReport['cases'] = [];
  const scores: CaseScore[] = [];
  const ttftSamples: number[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let estimatedCostUsd = 0;

  try {
    for (const evalCase of cases) {
      const resolvedCase: EvalCase = {
        ...evalCase,
        prompt: substitutePlaceholders(evalCase.prompt, placeholders),
        expectedFacts: evalCase.expectedFacts.map((fact) =>
          substitutePlaceholders(fact, placeholders),
        ),
        forbiddenClaims: evalCase.forbiddenClaims.map((claim) =>
          substitutePlaceholders(claim, placeholders),
        ),
        fakeAnswer:
          evalCase.fakeAnswer != null
            ? substitutePlaceholders(evalCase.fakeAnswer, placeholders)
            : undefined,
      };
      const beforeSnapshot = await captureCommercialSnapshot();

      const service =
        options.mode === 'fake'
          ? createFakeService(resolvedCase, placeholders, config)
          : createRealService(config);

      const conversation = await service.createConversation(adminUserId);
      const streamed = await collectStream(
        service.streamMessage({
          conversationId: conversation.id,
          userId: adminUserId,
          content: resolvedCase.prompt,
          clientRequestId: randomUUID(),
        }),
      );

      const afterSnapshot = await captureCommercialSnapshot();
      const mutationDelta = diffCommercialSnapshots(beforeSnapshot, afterSnapshot).length;
      // Assistant persistence is intentionally outside the commercial snapshot.

      const score = scoreCase(resolvedCase, {
        assistantText: streamed.text,
        sources: streamed.sources,
        documentSourceKeysTop: documentSourceKeysFromSources(streamed.sources),
        toolSourceKeys: toolSourceKeysFromSources(streamed.sources),
        errorCode: streamed.errorCode,
        ttftMs: streamed.ttftMs,
        latencyMs: streamed.latencyMs,
        inputTokens: streamed.inputTokens,
        outputTokens: streamed.outputTokens,
        totalTokens: streamed.totalTokens,
        mutationDelta,
      });

      const cost = estimateUsdCost(pricing, config.chatModel, {
        inputTokens: streamed.inputTokens,
        outputTokens: streamed.outputTokens,
      });

      scores.push(score);
      if (streamed.ttftMs != null) ttftSamples.push(streamed.ttftMs);
      totalInputTokens += streamed.inputTokens;
      totalOutputTokens += streamed.outputTokens;
      estimatedCostUsd += cost.usd;

      caseResults.push({
        score,
        ttftMs: streamed.ttftMs,
        latencyMs: streamed.latencyMs,
        tokens: {
          input: streamed.inputTokens,
          output: streamed.outputTokens,
          total: streamed.totalTokens,
        },
        estimatedCostUsd: cost.usd,
      });
    }
  } finally {
    if (fixtures != null) {
      await cleanupEvalFixtures(fixtures);
    }
  }

  const aggregate = aggregateScores({
    scores,
    ttftSamplesMs: ttftSamples,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd,
  });

  const hardGates = evaluateHardGates(aggregate, {
    enforceTtft: options.mode === 'real',
  });

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    environment: options.mode === 'fake' ? 'local-fake' : 'local-real',
    datasetVersion: dataset.version,
    promptVersion: ASSISTANT_PROMPT_VERSION,
    chatModel: config.chatModel,
    thresholds: EVAL_THRESHOLDS,
    aggregate,
    hardGates,
    humanAccuracyReview: {
      status: 'pending',
      target: EVAL_THRESHOLDS.minHumanAccuracy,
      notes:
        'Fill after reviewing local-real answers. Exactitud ≥90% is a human gate (AI-010 / decision 5B).',
    },
    cases: caseResults,
    pricingAsOf: pricing.asOf,
  };

  await mkdir(dirname(options.reportPath), { recursive: true });
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return report;
}

export function defaultEvalPaths(repoDocsAssistantEval: string): {
  datasetPath: string;
  pricingPath: string;
  reportPath: string;
} {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    datasetPath: join(repoDocsAssistantEval, 'dataset', 'v1', 'cases.json'),
    pricingPath: join(repoDocsAssistantEval, 'pricing.json'),
    reportPath: join(repoDocsAssistantEval, 'reports', `report-${stamp}.json`),
  };
}

export type { EvalDataset };
