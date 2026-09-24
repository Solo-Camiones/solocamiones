import { fileURLToPath } from 'node:url';

import { computeKnowledgeSha256 } from '../features/assistant/knowledge-checksum.js';
import type { KnowledgeCorpusReport } from '../features/assistant/knowledge-corpus.js';
import { isSafeRelativeMarkdownPath } from '../features/assistant/knowledge-manifest.js';

// Resolved from this file so the CLI works from src/ (tsx) and dist/ alike.
export const ASSISTANT_KNOWLEDGE_DIRECTORY = fileURLToPath(
  new URL('../../../../docs/assistant-knowledge', import.meta.url),
);
export const FEATURE_SPECIFICATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../../docs/FEATURES', import.meta.url),
);

export type KnowledgeCliArgs = {
  dryRun: boolean;
  help: boolean;
  unknown: string[];
};

export function parseKnowledgeCliArgs(
  argv: string[],
  options: { allowDryRun: boolean },
): KnowledgeCliArgs {
  const unknown: string[] = [];
  let dryRun = false;
  let help = false;

  for (const arg of argv) {
    if (options.allowDryRun && arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    unknown.push(arg);
  }

  return { dryRun, help, unknown };
}

export type KnowledgeDocumentHash =
  | { sourceKey: string; sha256: string }
  | { sourceKey: string; error: string };

/**
 * Reads the manifest leniently (without the strict schema) because its main use
 * is fixing a manifest that does not validate yet, e.g. an approved entry
 * whose sha256 is still empty.
 */
export async function hashKnowledgeDocuments(
  rawManifest: string,
  readDocument: (relativePath: string) => Promise<string>,
  requestedSourceKeys: string[],
): Promise<KnowledgeDocumentHash[]> {
  const parsed = JSON.parse(rawManifest) as { documents?: unknown };
  const documents = Array.isArray(parsed.documents)
    ? (parsed.documents as Array<{ sourceKey?: unknown; path?: unknown }>)
    : [];
  const selected =
    requestedSourceKeys.length === 0
      ? documents
      : documents.filter((document) => requestedSourceKeys.includes(String(document.sourceKey)));

  const results: KnowledgeDocumentHash[] = requestedSourceKeys
    .filter((key) => !documents.some((document) => document.sourceKey === key))
    .map((sourceKey) => ({ sourceKey, error: 'not found in manifest' }));

  for (const document of selected) {
    const sourceKey = String(document.sourceKey);
    if (typeof document.path !== 'string' || !isSafeRelativeMarkdownPath(document.path)) {
      results.push({ sourceKey, error: 'path must be a relative .md path inside the corpus' });
      continue;
    }
    try {
      results.push({ sourceKey, sha256: computeKnowledgeSha256(await readDocument(document.path)) });
    } catch {
      results.push({ sourceKey, error: `cannot read ${document.path}` });
    }
  }
  return results;
}

export function formatCorpusReport(report: KnowledgeCorpusReport): string[] {
  const lines: string[] = [];
  for (const issue of report.manifestIssues) {
    lines.push(`[ERROR] ${issue.message}`);
  }
  for (const checksum of report.checksums) {
    const label = report.invalidSourceKeys.includes(checksum.sourceKey)
      ? 'INVALID'
      : checksum.status === 'approved'
        ? 'APPROVED'
        : 'DRAFT';
    lines.push(`[${label}] ${checksum.sourceKey} sha256=${checksum.sha256}`);
  }
  for (const issue of report.documentIssues) {
    lines.push(`[ERROR] ${issue.sourceKey}: ${issue.message}`);
  }
  lines.push(
    `Summary: ${report.approved.length} approved, ${report.draftSourceKeys.length} draft (never indexed), ${report.invalidSourceKeys.length} invalid.`,
  );
  return lines;
}
