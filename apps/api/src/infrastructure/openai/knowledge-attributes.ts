import type { KnowledgeIndexDocument } from './types.js';

/**
 * Marks vector-store files owned by the corpus sync. Orphan cleanup only deletes
 * files carrying this marker, so files uploaded by other means are never touched.
 */
export const KNOWLEDGE_CORPUS_MARKER = 'solocamiones-assistant';

export const KNOWLEDGE_ATTRIBUTE_KEYS = {
  corpus: 'corpus',
  approved: 'approved',
  sourceKey: 'sourceKey',
  title: 'title',
  version: 'version',
  locator: 'locator',
  sha256: 'sha256',
  sourceRequirements: 'sourceRequirements',
} as const;

// OpenAI file attributes only accept scalar values, so requirement IDs travel as one string.
const SOURCE_REQUIREMENTS_SEPARATOR = ',';

export type KnowledgeFileAttributes = Record<string, string | number | boolean>;

export type KnowledgeComparisonFilter = {
  type: 'eq';
  key: string;
  value: string | boolean;
};

export type KnowledgeCompoundFilter = {
  type: 'and';
  filters: KnowledgeComparisonFilter[];
};

export function buildKnowledgeFileAttributes(
  document: KnowledgeIndexDocument,
): KnowledgeFileAttributes {
  return {
    [KNOWLEDGE_ATTRIBUTE_KEYS.corpus]: KNOWLEDGE_CORPUS_MARKER,
    [KNOWLEDGE_ATTRIBUTE_KEYS.approved]: true,
    [KNOWLEDGE_ATTRIBUTE_KEYS.sourceKey]: document.sourceKey,
    [KNOWLEDGE_ATTRIBUTE_KEYS.title]: document.title,
    [KNOWLEDGE_ATTRIBUTE_KEYS.version]: document.version,
    [KNOWLEDGE_ATTRIBUTE_KEYS.locator]: document.locator,
    [KNOWLEDGE_ATTRIBUTE_KEYS.sha256]: document.sha256,
    [KNOWLEDGE_ATTRIBUTE_KEYS.sourceRequirements]: document.sourceRequirements.join(
      SOURCE_REQUIREMENTS_SEPARATOR,
    ),
  };
}

export function buildApprovedCorpusFilter(): KnowledgeCompoundFilter {
  return {
    type: 'and',
    filters: [
      { type: 'eq', key: KNOWLEDGE_ATTRIBUTE_KEYS.corpus, value: KNOWLEDGE_CORPUS_MARKER },
      { type: 'eq', key: KNOWLEDGE_ATTRIBUTE_KEYS.approved, value: true },
    ],
  };
}

export function isCorpusFile(attributes: KnowledgeFileAttributes | null | undefined): boolean {
  return attributes?.[KNOWLEDGE_ATTRIBUTE_KEYS.corpus] === KNOWLEDGE_CORPUS_MARKER;
}

export function parseSourceRequirementsAttribute(value: string | undefined): string[] {
  if (value == null) return [];
  return value
    .split(SOURCE_REQUIREMENTS_SEPARATOR)
    .map((requirementId) => requirementId.trim())
    .filter((requirementId) => requirementId.length > 0);
}
