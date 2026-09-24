import { randomUUID } from 'node:crypto';

import {
  KNOWLEDGE_PROVIDER_ERROR_CODE_PREFIX,
  KNOWLEDGE_SYNC_FAILED_ERROR_CODE,
} from './constants.js';
import type { KnowledgeDocumentRepository } from './knowledge-document-repository.js';
import type { ApprovedKnowledgeDocument, KnowledgeCorpusReport } from './knowledge-corpus.js';
import {
  buildKnowledgeDocumentMetadata,
  planKnowledgeSync,
  type KnowledgeSyncAction,
} from './knowledge-sync-plan.js';
import { isAssistantProviderError } from '../../infrastructure/openai/errors.js';
import type {
  KnowledgeIndexDocument,
  KnowledgeIndexWriter,
} from '../../infrastructure/openai/types.js';
import { logger } from '../../infrastructure/logging/index.js';
import { recordAssistantKnowledgeSyncFailure } from '../../infrastructure/metrics/index.js';

export type KnowledgeSyncDocuments = Pick<
  KnowledgeDocumentRepository,
  'list' | 'upsertBySourceKey' | 'updateStatus' | 'listReferencedProviderFileIds'
>;

export type KnowledgeSyncDependencies = {
  documents: KnowledgeSyncDocuments;
  writer: KnowledgeIndexWriter;
  now?: () => Date;
  createErrorId?: () => string;
};

export type KnowledgeSyncOutcomeStatus = 'planned' | 'done' | 'failed';

export type KnowledgeSyncOutcome = {
  action: KnowledgeSyncAction['type'] | 'orphan';
  sourceKey?: string;
  providerFileId?: string;
  status: KnowledgeSyncOutcomeStatus;
  errorCode?: string;
  errorId?: string;
};

export type KnowledgeSyncResult = {
  dryRun: boolean;
  outcomes: KnowledgeSyncOutcome[];
  failed: boolean;
};

export class KnowledgeManifestInvalidError extends Error {
  constructor() {
    super('Knowledge manifest is invalid; sync aborted without changes');
    this.name = 'KnowledgeManifestInvalidError';
  }
}

type SyncContext = Required<KnowledgeSyncDependencies>;

/**
 * Explicit, idempotent corpus sync (AI-009). Ordering guarantees:
 * - a document becomes READY only after the provider finished indexing it;
 * - a replacement keeps the previous READY file until the new one is READY;
 * - a removal marks the row REMOVED before deleting the remote file, so a
 *   failed deletion can never keep unapproved content retrievable.
 */
export async function syncKnowledgeCorpus(
  dependencies: KnowledgeSyncDependencies,
  input: { corpus: KnowledgeCorpusReport; dryRun: boolean },
): Promise<KnowledgeSyncResult> {
  // A broken manifest looks like "every document removed"; never act on it.
  if (input.corpus.manifestIssues.length > 0) {
    throw new KnowledgeManifestInvalidError();
  }

  const context: SyncContext = {
    now: () => new Date(),
    createErrorId: randomUUID,
    ...dependencies,
  };
  const actions = planKnowledgeSync({
    approved: input.corpus.approved,
    protectedSourceKeys: new Set(input.corpus.invalidSourceKeys),
    indexed: await context.documents.list(),
  });

  const outcomes: KnowledgeSyncOutcome[] = [];
  for (const action of actions) {
    outcomes.push(input.dryRun ? toPlannedOutcome(action) : await executeAction(context, action));
  }
  outcomes.push(...(await cleanupOrphans(context, input.dryRun)));

  return {
    dryRun: input.dryRun,
    outcomes,
    failed: outcomes.some((outcome) => outcome.status === 'failed'),
  };
}

function toPlannedOutcome(action: KnowledgeSyncAction): KnowledgeSyncOutcome {
  return {
    action: action.type,
    sourceKey: action.sourceKey,
    status: action.type === 'unchanged' ? 'done' : 'planned',
  };
}

async function executeAction(
  context: SyncContext,
  action: KnowledgeSyncAction,
): Promise<KnowledgeSyncOutcome> {
  switch (action.type) {
    case 'unchanged':
      return { action: 'unchanged', sourceKey: action.sourceKey, status: 'done' };
    case 'upload':
      return uploadDocument(context, action.document);
    case 'replace':
      return replaceDocument(context, action.document, action.previousProviderFileId);
    case 'remove':
      return removeDocument(context, action.sourceKey, action.providerFileId);
  }
}

async function uploadDocument(
  context: SyncContext,
  document: ApprovedKnowledgeDocument,
): Promise<KnowledgeSyncOutcome> {
  const startedAt = context.now();
  await context.documents.upsertBySourceKey({
    ...toPersistedIdentity(document),
    status: 'INDEXING',
    providerFileId: null,
    approvedAt: startedAt,
    indexedAt: null,
    lastSyncedAt: startedAt,
    errorCode: null,
    errorId: null,
  });

  try {
    const { providerFileId } = await context.writer.indexDocument(toIndexDocument(document));
    await markReady(context, document, providerFileId, startedAt);
    return { action: 'upload', sourceKey: document.sourceKey, providerFileId, status: 'done' };
  } catch (error) {
    const failure = describeFailure(context, error, document.sourceKey, 'upload');
    await context.documents.updateStatus({
      sourceKey: document.sourceKey,
      status: 'FAILED',
      lastSyncedAt: context.now(),
      errorCode: failure.errorCode,
      errorId: failure.errorId,
    });
    return failure;
  }
}

async function replaceDocument(
  context: SyncContext,
  document: ApprovedKnowledgeDocument,
  previousProviderFileId: string,
): Promise<KnowledgeSyncOutcome> {
  const startedAt = context.now();
  let providerFileId: string;
  try {
    ({ providerFileId } = await context.writer.indexDocument(toIndexDocument(document)));
  } catch (error) {
    // Owner decision: the previously approved version keeps serving; only the error is recorded.
    const failure = describeFailure(context, error, document.sourceKey, 'replace');
    await context.documents.updateStatus({
      sourceKey: document.sourceKey,
      status: 'READY',
      lastSyncedAt: context.now(),
      errorCode: failure.errorCode,
      errorId: failure.errorId,
    });
    return failure;
  }

  try {
    await markReady(context, document, providerFileId, startedAt);
  } catch (error) {
    // The row still points at the previous file; the unreferenced new file becomes an orphan.
    return describeFailure(context, error, document.sourceKey, 'replace');
  }
  try {
    await context.writer.removeDocument(previousProviderFileId);
  } catch {
    // The superseded file is no longer READY, so retrieval ignores it; orphan cleanup retries.
  }
  return { action: 'replace', sourceKey: document.sourceKey, providerFileId, status: 'done' };
}

async function removeDocument(
  context: SyncContext,
  sourceKey: string,
  providerFileId: string | null,
): Promise<KnowledgeSyncOutcome> {
  await context.documents.updateStatus({
    sourceKey,
    status: 'REMOVED',
    lastSyncedAt: context.now(),
    errorCode: null,
    errorId: null,
  });
  if (providerFileId == null) {
    return { action: 'remove', sourceKey, status: 'done' };
  }

  try {
    await context.writer.removeDocument(providerFileId);
    await context.documents.updateStatus({ sourceKey, status: 'REMOVED', providerFileId: null });
    return { action: 'remove', sourceKey, providerFileId, status: 'done' };
  } catch (error) {
    const failure = describeFailure(context, error, sourceKey, 'remove');
    await context.documents.updateStatus({
      sourceKey,
      status: 'REMOVED',
      errorCode: failure.errorCode,
      errorId: failure.errorId,
    });
    return { ...failure, providerFileId };
  }
}

/** Deletes marked provider files that no persisted document references (e.g. after a crash). */
async function cleanupOrphans(
  context: SyncContext,
  dryRun: boolean,
): Promise<KnowledgeSyncOutcome[]> {
  const [remoteFileIds, referencedFileIds] = await Promise.all([
    context.writer.listCorpusFileIds(),
    context.documents.listReferencedProviderFileIds(),
  ]);
  const referenced = new Set(referencedFileIds);
  const orphanFileIds = remoteFileIds.filter((fileId) => !referenced.has(fileId));

  const outcomes: KnowledgeSyncOutcome[] = [];
  for (const providerFileId of orphanFileIds) {
    if (dryRun) {
      outcomes.push({ action: 'orphan', providerFileId, status: 'planned' });
      continue;
    }
    try {
      await context.writer.removeDocument(providerFileId);
      outcomes.push({ action: 'orphan', providerFileId, status: 'done' });
    } catch (error) {
      outcomes.push({ ...describeFailure(context, error, undefined, 'orphan'), providerFileId });
    }
  }
  return outcomes;
}

async function markReady(
  context: SyncContext,
  document: ApprovedKnowledgeDocument,
  providerFileId: string,
  approvedAt: Date,
): Promise<void> {
  const indexedAt = context.now();
  await context.documents.upsertBySourceKey({
    ...toPersistedIdentity(document),
    status: 'READY',
    providerFileId,
    approvedAt,
    indexedAt,
    lastSyncedAt: indexedAt,
    errorCode: null,
    errorId: null,
  });
}

function toPersistedIdentity(document: ApprovedKnowledgeDocument) {
  return {
    sourceKey: document.sourceKey,
    title: document.title,
    version: document.version,
    contentSha256: document.sha256,
    metadata: buildKnowledgeDocumentMetadata(document),
  };
}

function toIndexDocument(document: ApprovedKnowledgeDocument): KnowledgeIndexDocument {
  return {
    sourceKey: document.sourceKey,
    title: document.title,
    version: document.version,
    locator: document.path,
    sha256: document.sha256,
    sourceRequirements: document.sourceRequirements,
    content: document.content,
  };
}

function describeFailure(
  context: SyncContext,
  error: unknown,
  sourceKey: string | undefined,
  action: KnowledgeSyncOutcome['action'],
): KnowledgeSyncOutcome {
  const errorCode = isAssistantProviderError(error)
    ? `${KNOWLEDGE_PROVIDER_ERROR_CODE_PREFIX}${error.code}`
    : KNOWLEDGE_SYNC_FAILED_ERROR_CODE;
  const errorId = context.createErrorId();
  logger.warn({ action, sourceKey, errorCode, errorId }, 'Assistant knowledge sync step failed');
  recordAssistantKnowledgeSyncFailure();
  return { action, sourceKey, status: 'failed', errorCode, errorId };
}
