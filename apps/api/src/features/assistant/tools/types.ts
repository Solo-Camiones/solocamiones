import type { z } from 'zod';

import type { LanguageModelToolDefinition } from '../../../infrastructure/openai/types.js';
import type { AssistantToolName } from './constants.js';

export type AssistantToolContext = {
  actorId: string;
  /** Wall-clock used for asOf / overdue; injectable for tests. */
  now?: Date;
};

export type AssistantToolMeta = {
  asOf: string;
  sourceKey: string;
};

/**
 * Allowlisted commercial query tool. The orchestrator (M5) only executes tools
 * registered here; unknown names fail closed.
 */
export type AssistantTool<TInput = unknown, TOutput = unknown> = {
  name: AssistantToolName;
  description: string;
  inputSchema: z.ZodType<TInput>;
  /** JSON Schema object for the language-model tool definition. */
  parameters: Record<string, unknown>;
  execute(input: TInput, context: AssistantToolContext): Promise<TOutput>;
};

export type AssistantToolRegistry = {
  has(name: string): boolean;
  get(name: string): AssistantTool | undefined;
  listDefinitions(): LanguageModelToolDefinition[];
  /**
   * Validates arguments with the tool's Zod schema, then executes.
   * Throws AppError.validation for unknown tools or invalid arguments.
   */
  execute(name: string, args: unknown, context: AssistantToolContext): Promise<unknown>;
};

/** Fields that must never appear on assistant tool outputs (AI-004). */
export const ASSISTANT_FORBIDDEN_OUTPUT_KEYS = [
  'rnc',
  'address',
  'notes',
  'phone',
  'email',
  'contacts',
  'customerRnc',
  'customerPhone',
  'customerSnapshot',
  'ncf',
  'acquisitionCostDop',
  'costProvenance',
  'passwordHash',
  'username',
] as const;
