import { z } from 'zod';

const pricingModelSchema = z.object({
  inputPer1MTokensUsd: z.number().nonnegative(),
  outputPer1MTokensUsd: z.number().nonnegative(),
});

export const evalPricingTableSchema = z.object({
  asOf: z.string().min(1),
  note: z.string().min(1),
  models: z.record(z.string(), pricingModelSchema),
  fallbackModel: z.string().min(1),
});

export type EvalPricingTable = z.infer<typeof evalPricingTableSchema>;

export type TokenUsageForCost = {
  inputTokens: number;
  outputTokens: number;
};

/**
 * Estimate USD cost from a versioned pricing table (M9-T05).
 * Not a bill — report must label it as an estimate.
 */
export function estimateUsdCost(
  table: EvalPricingTable,
  model: string,
  usage: TokenUsageForCost,
): { usd: number; pricingModel: string } {
  const resolved = table.models[model] != null ? model : table.fallbackModel;
  const rates = table.models[resolved] ?? table.models[table.fallbackModel];
  if (rates == null) {
    throw new Error(`Pricing table missing fallback model ${table.fallbackModel}`);
  }

  const usd =
    (usage.inputTokens / 1_000_000) * rates.inputPer1MTokensUsd +
    (usage.outputTokens / 1_000_000) * rates.outputPer1MTokensUsd;

  return { usd, pricingModel: resolved };
}
