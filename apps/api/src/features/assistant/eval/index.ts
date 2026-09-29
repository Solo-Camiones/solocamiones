export {
  evalCaseSchema,
  evalDatasetSchema,
  validateDatasetComposition,
  EVAL_CASE_CATEGORIES,
} from './dataset-schema.js';
export type { EvalCase, EvalCaseCategory, EvalDataset } from './dataset-schema.js';
export { evalPricingTableSchema, estimateUsdCost } from './pricing.js';
export type { EvalPricingTable, TokenUsageForCost } from './pricing.js';
export { scoreCase, detectPiiHits, hasAffirmativeForbiddenClaim } from './scorer.js';
export type { CaseRunObservation, CaseScore } from './scorer.js';
export { EVAL_THRESHOLDS } from './thresholds.js';
export type { EvalHardGateResult } from './thresholds.js';
export {
  aggregateScores,
  evaluateHardGates,
  documentSourceKeysFromSources,
  toolSourceKeysFromSources,
} from './aggregate.js';
export type { SuiteAggregate } from './aggregate.js';
export { runAssistantEval, defaultEvalPaths } from './run-eval.js';
export type { EvalMode, RunEvalOptions, EvalReport } from './run-eval.js';
export {
  seedEvalFixtures,
  cleanupEvalFixtures,
  captureCommercialSnapshot,
  diffCommercialSnapshots,
} from './seed-fixtures.js';
export type { EvalFixtures, CommercialSnapshot, CommercialSnapshotEntry } from './seed-fixtures.js';
export { substitutePlaceholders, substitutePlaceholdersInUnknown } from './placeholders.js';
export { buildFakeProvidersForCase } from './build-fake-providers.js';
