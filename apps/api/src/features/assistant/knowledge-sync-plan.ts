import type { ApprovedKnowledgeDocument } from './knowledge-corpus.js';
import type { AssistantKnowledgeDocument } from './types.js';

export type IndexedKnowledgeState = Pick<
  AssistantKnowledgeDocument,
  'sourceKey' | 'title' | 'version' | 'contentSha256' | 'status' | 'providerFileId' | 'metadata'
>;

export type KnowledgeSyncAction =
  | { type: 'unchanged'; sourceKey: string }
  | { type: 'upload'; sourceKey: string; document: ApprovedKnowledgeDocument }
  | {
      type: 'replace';
      sourceKey: string;
      document: ApprovedKnowledgeDocument;
      previousProviderFileId: string;
    }
  | { type: 'remove'; sourceKey: string; providerFileId: string | null };

export type KnowledgeSyncPlanInput = {
  approved: ApprovedKnowledgeDocument[];
  /** Listed but invalid documents: keep whatever is indexed until they are fixed. */
  protectedSourceKeys: ReadonlySet<string>;
  indexed: IndexedKnowledgeState[];
  /**
   * Provider file ids currently present in this environment's vector store.
   * READY rows whose providerFileId is missing here must re-upload (e.g. after
   * OPENAI_VECTOR_STORE_ID replacement); local checksum match alone is not enough.
   */
  presentProviderFileIds: ReadonlySet<string>;
};

export type KnowledgeDocumentMetadata = {
  path: string;
  sourceRequirements: string[];
  updatedAt: string;
};

export function buildKnowledgeDocumentMetadata(
  document: ApprovedKnowledgeDocument,
): KnowledgeDocumentMetadata {
  return {
    path: document.path,
    sourceRequirements: [...document.sourceRequirements],
    updatedAt: document.updatedAt,
  };
}

/**
 * Pure comparison of the approved manifest against persisted index state and
 * the provider files present in the current vector store. Remote attributes
 * (title, version, path, requirements) are part of the comparison because
 * changing them requires a new provider file. A READY row whose file id is
 * absent from the store (e.g. after OPENAI_VECTOR_STORE_ID replacement) is
 * planned as upload.
 */
export function planKnowledgeSync(input: KnowledgeSyncPlanInput): KnowledgeSyncAction[] {
  const indexedBySourceKey = new Map(input.indexed.map((row) => [row.sourceKey, row]));
  const approvedSourceKeys = new Set(input.approved.map((document) => document.sourceKey));
  const actions: KnowledgeSyncAction[] = [];

  for (const document of input.approved) {
    actions.push(
      planApprovedDocument(
        document,
        indexedBySourceKey.get(document.sourceKey),
        input.presentProviderFileIds,
      ),
    );
  }

  for (const row of input.indexed) {
    if (approvedSourceKeys.has(row.sourceKey) || input.protectedSourceKeys.has(row.sourceKey)) {
      continue;
    }
    // REMOVED rows that still hold a provider file are retried until the file is gone.
    if (row.status !== 'REMOVED' || row.providerFileId != null) {
      actions.push({
        type: 'remove',
        sourceKey: row.sourceKey,
        providerFileId: row.providerFileId,
      });
    }
  }
  return actions;
}

function planApprovedDocument(
  document: ApprovedKnowledgeDocument,
  indexed: IndexedKnowledgeState | undefined,
  presentProviderFileIds: ReadonlySet<string>,
): KnowledgeSyncAction {
  if (indexed == null || indexed.status !== 'READY' || indexed.providerFileId == null) {
    return { type: 'upload', sourceKey: document.sourceKey, document };
  }
  // Stale READY after a vector-store swap: checksum matches DB but the file is gone remotely.
  if (!presentProviderFileIds.has(indexed.providerFileId)) {
    return { type: 'upload', sourceKey: document.sourceKey, document };
  }
  if (matchesIndexedState(document, indexed)) {
    return { type: 'unchanged', sourceKey: document.sourceKey };
  }
  return {
    type: 'replace',
    sourceKey: document.sourceKey,
    document,
    previousProviderFileId: indexed.providerFileId,
  };
}

function matchesIndexedState(
  document: ApprovedKnowledgeDocument,
  indexed: IndexedKnowledgeState,
): boolean {
  const metadata = readMetadata(indexed.metadata);
  return (
    indexed.contentSha256 === document.sha256 &&
    indexed.version === document.version &&
    indexed.title === document.title &&
    metadata?.path === document.path &&
    metadata.sourceRequirements.join(',') === document.sourceRequirements.join(',')
  );
}

function readMetadata(
  value: unknown,
): Pick<KnowledgeDocumentMetadata, 'path' | 'sourceRequirements'> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || !Array.isArray(record.sourceRequirements)) return null;
  return {
    path: record.path,
    sourceRequirements: record.sourceRequirements.filter(
      (entry): entry is string => typeof entry === 'string',
    ),
  };
}
