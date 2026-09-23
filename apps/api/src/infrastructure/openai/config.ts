import { z } from 'zod';

export const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-5.4-mini-2026-03-17';
export const DEFAULT_ASSISTANT_RETENTION_DAYS = 90;
export const DEFAULT_ASSISTANT_DAILY_MESSAGE_LIMIT = 50;
export const DEFAULT_ASSISTANT_MAX_INPUT_CHARS = 2000;
export const DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS = 1200;
export const DEFAULT_ASSISTANT_MAX_TOOL_CALLS = 3;
export const DEFAULT_ASSISTANT_MAX_RETRIEVAL_RESULTS = 6;
export const DEFAULT_ASSISTANT_RETRIEVAL_SCORE_THRESHOLD = 0.55;
export const DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS = 45_000;

export type AssistantConfig = {
  enabled: boolean;
  apiKey: string | undefined;
  chatModel: string;
  vectorStoreId: string | undefined;
  retentionDays: number;
  dailyMessageLimit: number;
  maxInputChars: number;
  maxOutputTokens: number;
  maxToolCalls: number;
  maxRetrievalResults: number;
  retrievalScoreThreshold: number;
  requestTimeoutMs: number;
};

const booleanEnvSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = value.toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    ctx.addIssue({ code: 'custom', message: 'must be true, false, 1, or 0' });
    return z.NEVER;
  });

function optionalEnvString(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseOptionalBoolean(value: string | undefined, defaultValue: boolean): boolean {
  const present = optionalEnvString(value);
  if (present == null) return defaultValue;
  return booleanEnvSchema.parse(present);
}

function parseBoundedNumber(options: {
  raw: string | undefined;
  defaultValue: number;
  min: number;
  max?: number;
  field: string;
  integer?: boolean;
}): number {
  const present = optionalEnvString(options.raw);
  if (present == null) return options.defaultValue;

  const schema = options.integer
    ? z.coerce.number().int().min(options.min).max(options.max ?? Number.MAX_SAFE_INTEGER)
    : z.coerce.number().min(options.min).max(options.max ?? Number.POSITIVE_INFINITY);

  try {
    return schema.parse(present);
  } catch {
    const range =
      options.max == null ? `>= ${options.min}` : `${options.min}–${options.max}`;
    throw new Error(`Invalid ${options.field}: must be ${range}`);
  }
}

/**
 * Parses assistant/OpenAI settings from environment.
 * Present-but-invalid values always fail (even when ASSISTANT_ENABLED=false).
 * Missing credentials are allowed only while the feature is disabled.
 */
export function parseAssistantConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AssistantConfig {
  let enabled: boolean;
  try {
    enabled = parseOptionalBoolean(environment.ASSISTANT_ENABLED, false);
  } catch {
    throw new Error('Invalid ASSISTANT_ENABLED: must be true, false, 1, or 0');
  }

  const apiKey = optionalEnvString(environment.OPENAI_API_KEY);
  const vectorStoreId = optionalEnvString(environment.OPENAI_VECTOR_STORE_ID);
  const chatModel =
    optionalEnvString(environment.OPENAI_CHAT_MODEL) ?? DEFAULT_OPENAI_CHAT_MODEL;

  const retentionDays = parseBoundedNumber({
    raw: environment.ASSISTANT_RETENTION_DAYS,
    defaultValue: DEFAULT_ASSISTANT_RETENTION_DAYS,
    min: 1,
    max: 365,
    field: 'ASSISTANT_RETENTION_DAYS',
    integer: true,
  });
  const dailyMessageLimit = parseBoundedNumber({
    raw: environment.ASSISTANT_DAILY_MESSAGE_LIMIT,
    defaultValue: DEFAULT_ASSISTANT_DAILY_MESSAGE_LIMIT,
    min: 1,
    field: 'ASSISTANT_DAILY_MESSAGE_LIMIT',
    integer: true,
  });
  const maxInputChars = parseBoundedNumber({
    raw: environment.ASSISTANT_MAX_INPUT_CHARS,
    defaultValue: DEFAULT_ASSISTANT_MAX_INPUT_CHARS,
    min: 1,
    field: 'ASSISTANT_MAX_INPUT_CHARS',
    integer: true,
  });
  const maxOutputTokens = parseBoundedNumber({
    raw: environment.ASSISTANT_MAX_OUTPUT_TOKENS,
    defaultValue: DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
    min: 1,
    field: 'ASSISTANT_MAX_OUTPUT_TOKENS',
    integer: true,
  });
  const maxToolCalls = parseBoundedNumber({
    raw: environment.ASSISTANT_MAX_TOOL_CALLS,
    defaultValue: DEFAULT_ASSISTANT_MAX_TOOL_CALLS,
    min: 1,
    field: 'ASSISTANT_MAX_TOOL_CALLS',
    integer: true,
  });
  const maxRetrievalResults = parseBoundedNumber({
    raw: environment.ASSISTANT_MAX_RETRIEVAL_RESULTS,
    defaultValue: DEFAULT_ASSISTANT_MAX_RETRIEVAL_RESULTS,
    min: 1,
    max: 50,
    field: 'ASSISTANT_MAX_RETRIEVAL_RESULTS',
    integer: true,
  });
  const retrievalScoreThreshold = parseBoundedNumber({
    raw: environment.ASSISTANT_RETRIEVAL_SCORE_THRESHOLD,
    defaultValue: DEFAULT_ASSISTANT_RETRIEVAL_SCORE_THRESHOLD,
    min: 0,
    max: 1,
    field: 'ASSISTANT_RETRIEVAL_SCORE_THRESHOLD',
  });
  const requestTimeoutMs = parseBoundedNumber({
    raw: environment.ASSISTANT_REQUEST_TIMEOUT_MS,
    defaultValue: DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS,
    min: 1,
    field: 'ASSISTANT_REQUEST_TIMEOUT_MS',
    integer: true,
  });

  if (enabled) {
    if (apiKey == null) {
      throw new Error('OPENAI_API_KEY is required when ASSISTANT_ENABLED=true');
    }
    if (vectorStoreId == null) {
      throw new Error('OPENAI_VECTOR_STORE_ID is required when ASSISTANT_ENABLED=true');
    }
  }

  return {
    enabled,
    apiKey,
    chatModel,
    vectorStoreId,
    retentionDays,
    dailyMessageLimit,
    maxInputChars,
    maxOutputTokens,
    maxToolCalls,
    maxRetrievalResults,
    retrievalScoreThreshold,
    requestTimeoutMs,
  };
}
