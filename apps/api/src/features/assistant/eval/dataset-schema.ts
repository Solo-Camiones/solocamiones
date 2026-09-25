import { z } from 'zod';

export const EVAL_CASE_CATEGORIES = [
  'documentary',
  'live',
  'hybrid',
  'adversarial',
] as const;

export type EvalCaseCategory = (typeof EVAL_CASE_CATEGORIES)[number];

const evalToolCallSchema = z.object({
  name: z.string().min(1),
  /** JSON-serializable args; string values may include {{placeholders}}. */
  arguments: z.record(z.string(), z.unknown()),
});

/**
 * One versioned evaluation case (AI-010 / M9).
 * Placeholders like {{customerCashName}} are substituted from seeded fixtures.
 */
export const evalCaseSchema = z.object({
  id: z.string().min(1),
  category: z.enum(EVAL_CASE_CATEGORIES),
  prompt: z.string().min(1).max(2000),
  expectedSourceKeys: z.array(z.string().min(1)).default([]),
  expectedFacts: z.array(z.string().min(1)).default([]),
  forbiddenClaims: z.array(z.string().min(1)).default([]),
  expectInsufficientEvidence: z.boolean().default(false),
  expectRefusal: z.boolean().default(false),
  /** Logical fixture ids required before the case runs. */
  requiresFixtures: z.boolean().default(false),
  /**
   * Fake-mode tool calls (executed against real commercial tools + fixtures).
   * Omitted for pure documentary / refusal cases.
   */
  fakeToolCalls: z.array(evalToolCallSchema).default([]),
  /** Optional override for the fake final answer; otherwise derived from expectedFacts. */
  fakeAnswer: z.string().min(1).optional(),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;

export const evalDatasetSchema = z.object({
  version: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(evalCaseSchema).min(30),
});

export type EvalDataset = z.infer<typeof evalDatasetSchema>;

const MIN_DOCUMENTARY = 10;
const MIN_LIVE = 10;
const MIN_HYBRID = 5;
const MIN_ADVERSARIAL = 5;

export type DatasetCompositionIssue = {
  message: string;
};

/** Enforce M9 mix: ≥10 documentary, ≥10 live, ≥5 hybrid, ≥5 adversarial. */
export function validateDatasetComposition(
  dataset: EvalDataset,
): DatasetCompositionIssue[] {
  const issues: DatasetCompositionIssue[] = [];
  const counts = {
    documentary: 0,
    live: 0,
    hybrid: 0,
    adversarial: 0,
  };
  const ids = new Set<string>();

  for (const evalCase of dataset.cases) {
    if (ids.has(evalCase.id)) {
      issues.push({ message: `Duplicate case id: ${evalCase.id}` });
    }
    ids.add(evalCase.id);
    counts[evalCase.category] += 1;
  }

  if (counts.documentary < MIN_DOCUMENTARY) {
    issues.push({
      message: `Need ≥${MIN_DOCUMENTARY} documentary cases (have ${counts.documentary})`,
    });
  }
  if (counts.live < MIN_LIVE) {
    issues.push({
      message: `Need ≥${MIN_LIVE} live cases (have ${counts.live})`,
    });
  }
  if (counts.hybrid < MIN_HYBRID) {
    issues.push({
      message: `Need ≥${MIN_HYBRID} hybrid cases (have ${counts.hybrid})`,
    });
  }
  if (counts.adversarial < MIN_ADVERSARIAL) {
    issues.push({
      message: `Need ≥${MIN_ADVERSARIAL} adversarial cases (have ${counts.adversarial})`,
    });
  }

  return issues;
}
