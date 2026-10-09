import { z } from 'zod';

export const KNOWLEDGE_MANIFEST_SCHEMA_VERSION = 1;
export const KNOWLEDGE_DOCUMENT_STATUSES = ['draft', 'approved'] as const;
export const KNOWLEDGE_AUDIENCE = 'ADMINISTRATOR';

export const REQUIREMENT_ID_PATTERN = /^[A-Z]+-\d{3}$/;
const SOURCE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MARKDOWN_EXTENSION = '.md';

const SOURCE_KEY_MAX_LENGTH = 80;
const TITLE_MAX_LENGTH = 120;
const VERSION_MAX_LENGTH = 32;
// Keeps the joined requirement attribute well under the provider's 512-character limit.
const MAX_SOURCE_REQUIREMENTS = 20;

export type KnowledgeDocumentStatus = (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];

/**
 * Paths stay relative to the corpus directory, use forward slashes, and never
 * climb out of it, so the manifest cannot admit arbitrary repository files.
 */
export function isSafeRelativeMarkdownPath(value: string): boolean {
  if (!value.endsWith(MARKDOWN_EXTENSION)) return false;
  if (value.startsWith('/') || value.includes('\\') || value.includes(':')) return false;
  return value
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isValidCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const knowledgeManifestDocumentSchema = z
  .object({
    sourceKey: z
      .string()
      .max(SOURCE_KEY_MAX_LENGTH)
      .regex(SOURCE_KEY_PATTERN, 'must be lowercase kebab-case'),
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
    version: z.string().trim().min(1).max(VERSION_MAX_LENGTH),
    status: z.enum(KNOWLEDGE_DOCUMENT_STATUSES),
    audience: z.literal(KNOWLEDGE_AUDIENCE, {
      error: `only ${KNOWLEDGE_AUDIENCE} documents are admitted`,
    }),
    sourceRequirements: z
      .array(z.string().regex(REQUIREMENT_ID_PATTERN, 'must look like SALE-005'))
      .min(1)
      .max(MAX_SOURCE_REQUIREMENTS),
    path: z
      .string()
      .refine(isSafeRelativeMarkdownPath, 'must be a relative .md path inside the corpus'),
    updatedAt: z
      .string()
      .regex(ISO_DATE_PATTERN, 'must be YYYY-MM-DD')
      .refine(isValidCalendarDate, 'must be a real calendar date'),
    sha256: z.string().regex(SHA256_PATTERN, 'must be a lowercase SHA-256 hex digest').optional(),
  })
  .strict()
  .superRefine((document, context) => {
    // The checksum is the approval seal: an approved entry without it cannot prove what was reviewed.
    if (document.status === 'approved' && document.sha256 == null) {
      context.addIssue({
        code: 'custom',
        path: ['sha256'],
        message: 'is required when status is approved',
      });
    }
  });

export const knowledgeManifestSchema = z
  .object({
    schemaVersion: z.literal(KNOWLEDGE_MANIFEST_SCHEMA_VERSION),
    documents: z.array(knowledgeManifestDocumentSchema),
  })
  .strict();

export type KnowledgeManifest = z.infer<typeof knowledgeManifestSchema>;
export type KnowledgeManifestDocument = z.infer<typeof knowledgeManifestDocumentSchema>;
