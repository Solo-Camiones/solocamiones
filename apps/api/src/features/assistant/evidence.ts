import type { KnowledgeChunk } from '../../infrastructure/openai/types.js';
import type { CreateSourceInput } from './types.js';
import { assistantToolSourceKey } from './tools/constants.js';

export type AssistantSourceView = {
  type: 'DOCUMENT' | 'TOOL';
  sourceKey: string;
  title: string;
  locator: string | null;
  sortOrder: number;
  appPath: string | null;
  excerpt: string | null;
  score: number | null;
  asOf: string | null;
};

export type SuccessfulToolEvidence = {
  name: string;
  sourceKey: string;
  title: string;
  appPath: string | null;
  asOf: Date | null;
};

/** Deterministic evidence gate (decision 2A): retrieval hits and/or successful tools. */
export function hasFactualEvidence(
  chunks: KnowledgeChunk[],
  successfulTools: SuccessfulToolEvidence[],
): boolean {
  return chunks.length > 0 || successfulTools.length > 0;
}

export function buildDocumentSourceInputs(
  assistantMessageId: string,
  chunks: KnowledgeChunk[],
): CreateSourceInput[] {
  return chunks.map((chunk, index) => ({
    assistantMessageId,
    type: 'DOCUMENT' as const,
    sourceKey: chunk.sourceKey,
    title: chunk.title,
    locator: chunk.locator,
    sortOrder: index,
    appPath: null,
    excerpt: chunk.excerpt,
    score: chunk.score,
    asOf: null,
  }));
}

export function buildToolSourceInputs(
  assistantMessageId: string,
  tools: SuccessfulToolEvidence[],
  sortOrderStart: number,
): CreateSourceInput[] {
  return tools.map((tool, index) => ({
    assistantMessageId,
    type: 'TOOL' as const,
    sourceKey: tool.sourceKey,
    title: tool.title,
    locator: null,
    sortOrder: sortOrderStart + index,
    appPath: tool.appPath,
    excerpt: null,
    score: null,
    asOf: tool.asOf,
  }));
}

export function toSourceViews(
  documents: CreateSourceInput[],
  tools: CreateSourceInput[],
): AssistantSourceView[] {
  return [...documents, ...tools].map((source) => ({
    type: source.type,
    sourceKey: source.sourceKey,
    title: source.title,
    locator: source.locator ?? null,
    sortOrder: source.sortOrder,
    appPath: source.appPath ?? null,
    excerpt: source.excerpt ?? null,
    score: source.score ?? null,
    asOf: source.asOf ? source.asOf.toISOString() : null,
  }));
}

/**
 * Extracts allowlisted meta from a tool payload without treating the whole
 * object as a source duplicate (plan 5.2).
 */
export function extractSuccessfulToolEvidence(
  name: string,
  result: unknown,
): SuccessfulToolEvidence | null {
  if (result == null || typeof result !== 'object') {
    return {
      name,
      sourceKey: assistantToolSourceKey(name),
      title: name,
      appPath: null,
      asOf: null,
    };
  }

  const record = result as Record<string, unknown>;
  if (record.error != null) return null;

  const sourceKey =
    typeof record.sourceKey === 'string' && record.sourceKey.length > 0
      ? record.sourceKey
      : assistantToolSourceKey(name);
  const appPath = typeof record.appPath === 'string' ? record.appPath : null;
  const asOf =
    typeof record.asOf === 'string' && record.asOf.length > 0
      ? new Date(record.asOf)
      : null;

  return {
    name,
    sourceKey,
    title: name,
    appPath,
    asOf: asOf != null && !Number.isNaN(asOf.getTime()) ? asOf : null,
  };
}
