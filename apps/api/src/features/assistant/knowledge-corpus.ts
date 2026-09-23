import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { computeKnowledgeSha256, normalizeKnowledgeContent } from './knowledge-checksum.js';
import { knowledgeManifestSchema, type KnowledgeManifestDocument } from './knowledge-manifest.js';

const FEATURE_REQUIREMENT_HEADING = /^###\s+([A-Z]+-\d{3})\b/gm;
const MARKDOWN_EXTENSION = '.md';

export type ApprovedKnowledgeDocument = {
  sourceKey: string;
  title: string;
  version: string;
  path: string;
  sha256: string;
  sourceRequirements: string[];
  updatedAt: string;
  content: string;
};

export type KnowledgeCorpusIssue = {
  /** Absent for manifest-level problems that invalidate the whole corpus. */
  sourceKey?: string;
  message: string;
};

export type KnowledgeDocumentChecksum = {
  sourceKey: string;
  status: KnowledgeManifestDocument['status'];
  sha256: string;
};

export type KnowledgeCorpusReport = {
  approved: ApprovedKnowledgeDocument[];
  draftSourceKeys: string[];
  /** Listed documents with problems; sync neither indexes nor removes them. */
  invalidSourceKeys: string[];
  checksums: KnowledgeDocumentChecksum[];
  manifestIssues: KnowledgeCorpusIssue[];
  documentIssues: KnowledgeCorpusIssue[];
};

export type KnowledgeCorpusReader = {
  readManifest(): Promise<string>;
  /** Returns undefined when the file does not exist inside the corpus directory. */
  readDocument(relativePath: string): Promise<string | undefined>;
  readKnownRequirementIds(): Promise<ReadonlySet<string>>;
};

export function isKnowledgeCorpusValid(report: KnowledgeCorpusReport): boolean {
  return report.manifestIssues.length === 0 && report.documentIssues.length === 0;
}

/**
 * Validates the manifest and every listed file without network access (AI-009).
 * Manifest-level problems stop everything; document-level problems only block
 * that document so one bad edit never unpublishes the rest of the corpus.
 */
export async function validateKnowledgeCorpus(
  reader: KnowledgeCorpusReader,
): Promise<KnowledgeCorpusReport> {
  const report: KnowledgeCorpusReport = {
    approved: [],
    draftSourceKeys: [],
    invalidSourceKeys: [],
    checksums: [],
    manifestIssues: [],
    documentIssues: [],
  };

  const documents = await parseManifestDocuments(reader, report);
  if (documents == null) return report;

  const knownRequirementIds = await reader.readKnownRequirementIds();
  for (const document of documents) {
    await evaluateDocument(document, reader, knownRequirementIds, report);
  }
  return report;
}

async function parseManifestDocuments(
  reader: KnowledgeCorpusReader,
  report: KnowledgeCorpusReport,
): Promise<KnowledgeManifestDocument[] | null> {
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(await reader.readManifest());
  } catch {
    report.manifestIssues.push({ message: 'manifest.json is missing or is not valid JSON' });
    return null;
  }

  const parsed = knowledgeManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report.manifestIssues.push({ message: `${formatIssuePath(issue.path)}: ${issue.message}` });
    }
    return null;
  }

  const duplicateIssues = findDuplicates(parsed.data.documents);
  if (duplicateIssues.length > 0) {
    report.manifestIssues.push(...duplicateIssues);
    return null;
  }
  return parsed.data.documents;
}

function findDuplicates(documents: KnowledgeManifestDocument[]): KnowledgeCorpusIssue[] {
  const issues: KnowledgeCorpusIssue[] = [];
  const seenSourceKeys = new Set<string>();
  const seenPaths = new Set<string>();
  for (const document of documents) {
    if (seenSourceKeys.has(document.sourceKey)) {
      issues.push({ message: `duplicate sourceKey "${document.sourceKey}"` });
    }
    if (seenPaths.has(document.path)) {
      issues.push({ message: `duplicate path "${document.path}"` });
    }
    seenSourceKeys.add(document.sourceKey);
    seenPaths.add(document.path);
  }
  return issues;
}

async function evaluateDocument(
  document: KnowledgeManifestDocument,
  reader: KnowledgeCorpusReader,
  knownRequirementIds: ReadonlySet<string>,
  report: KnowledgeCorpusReport,
): Promise<void> {
  const issues: string[] = [];
  const unknownRequirements = document.sourceRequirements.filter(
    (requirementId) => !knownRequirementIds.has(requirementId),
  );
  if (unknownRequirements.length > 0) {
    issues.push(`unknown requirement IDs in docs/FEATURES: ${unknownRequirements.join(', ')}`);
  }

  const rawContent = await reader.readDocument(document.path);
  if (rawContent == null) {
    issues.push(`file not found: ${document.path}`);
  } else {
    const sha256 = computeKnowledgeSha256(rawContent);
    report.checksums.push({ sourceKey: document.sourceKey, status: document.status, sha256 });

    if (normalizeKnowledgeContent(rawContent).trim().length === 0) {
      issues.push('file is empty');
    }
    if (document.status === 'approved' && document.sha256 !== sha256) {
      issues.push(
        `content changed after approval (manifest ${document.sha256}, file ${sha256}); review it and update sha256`,
      );
    }
    if (issues.length === 0 && document.status === 'approved') {
      report.approved.push(toApprovedDocument(document, sha256, rawContent));
    }
  }

  if (issues.length > 0) {
    report.invalidSourceKeys.push(document.sourceKey);
    report.documentIssues.push(
      ...issues.map((message) => ({ sourceKey: document.sourceKey, message })),
    );
    return;
  }
  if (document.status === 'draft') {
    report.draftSourceKeys.push(document.sourceKey);
  }
}

function toApprovedDocument(
  document: KnowledgeManifestDocument,
  sha256: string,
  rawContent: string,
): ApprovedKnowledgeDocument {
  return {
    sourceKey: document.sourceKey,
    title: document.title,
    version: document.version,
    path: document.path,
    sha256,
    sourceRequirements: [...document.sourceRequirements],
    updatedAt: document.updatedAt,
    content: normalizeKnowledgeContent(rawContent),
  };
}

function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) return 'manifest';
  return path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : String(segment)))
    .join('.')
    .replace(/\.\[/g, '[');
}

export type FileSystemKnowledgeCorpusPaths = {
  corpusDirectory: string;
  featuresDirectory: string;
  manifestFileName?: string;
};

export function createFileSystemKnowledgeCorpusReader(
  paths: FileSystemKnowledgeCorpusPaths,
): KnowledgeCorpusReader {
  const corpusRoot = resolve(paths.corpusDirectory);
  const manifestPath = join(corpusRoot, paths.manifestFileName ?? 'manifest.json');

  return {
    readManifest: () => readFile(manifestPath, 'utf8'),
    async readDocument(relativePath) {
      const absolutePath = resolve(corpusRoot, relativePath);
      // Defense in depth on top of the schema: never read outside the corpus directory.
      if (!absolutePath.startsWith(`${corpusRoot}${sep}`)) return undefined;
      try {
        return await readFile(absolutePath, 'utf8');
      } catch (error) {
        if (isFileNotFound(error)) return undefined;
        throw error;
      }
    },
    readKnownRequirementIds: () => readFeatureRequirementIds(paths.featuresDirectory),
  };
}

async function readFeatureRequirementIds(featuresDirectory: string): Promise<ReadonlySet<string>> {
  const requirementIds = new Set<string>();
  const entries = await readdir(featuresDirectory);
  for (const entry of entries.filter((name) => name.endsWith(MARKDOWN_EXTENSION))) {
    const content = await readFile(join(featuresDirectory, entry), 'utf8');
    for (const match of content.matchAll(FEATURE_REQUIREMENT_HEADING)) {
      requirementIds.add(match[1]);
    }
  }
  return requirementIds;
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
