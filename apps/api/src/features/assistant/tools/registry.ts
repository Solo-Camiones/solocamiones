import { z } from 'zod';

import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { LanguageModelToolDefinition } from '../../../infrastructure/openai/types.js';
import { logger } from '../../../infrastructure/logging/index.js';
import { recordAssistantToolCall } from '../../../infrastructure/metrics/index.js';
import type { AssistantTool, AssistantToolContext, AssistantToolRegistry } from './types.js';

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  // Model tool parameters must be a JSON Schema object; strip Zod wrappers if present.
  if (json.type === 'object' || json.properties) return json;
  return { type: 'object', properties: {}, additionalProperties: false };
}

export function createAssistantToolRegistry(tools: AssistantTool[]): AssistantToolRegistry {
  const byName = new Map<string, AssistantTool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate assistant tool registration: ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  return {
    has(name) {
      return byName.has(name);
    },
    get(name) {
      return byName.get(name);
    },
    listDefinitions(): LanguageModelToolDefinition[] {
      return [...byName.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    },
    async execute(name, args, context: AssistantToolContext) {
      const tool = byName.get(name);
      if (!tool) {
        throw AppError.validation(`Unknown assistant tool: ${name}`, { tool: name });
      }

      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        throw AppError.validation('Invalid assistant tool arguments', {
          tool: name,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const started = Date.now();
      try {
        const result = await tool.execute(parsed.data, context);
        recordAssistantToolCall(name);
        logger.info(
          {
            tool: name,
            durationMs: Date.now() - started,
            actorId: context.actorId,
          },
          'Assistant tool completed',
        );
        return result;
      } catch (error) {
        logger.warn(
          {
            tool: name,
            durationMs: Date.now() - started,
            actorId: context.actorId,
            errorCode: error instanceof AppError ? error.code : 'INTERNAL',
          },
          'Assistant tool failed',
        );
        throw error;
      }
    },
  };
}

export function toolParametersFromSchema(schema: z.ZodType): Record<string, unknown> {
  return toParameters(schema);
}
