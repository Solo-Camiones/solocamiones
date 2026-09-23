import { fileURLToPath } from 'node:url';

import type { KnowledgeCorpusReport } from '../features/assistant/knowledge-corpus.js';

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
