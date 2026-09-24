import { z } from 'zod';

import { DEFAULT_ASSISTANT_MAX_INPUT_CHARS } from '../../infrastructure/openai/config.js';

export const conversationIdParamsSchema = z
  .object({
    id: z.uuid(),
  })
  .strict();

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
  })
  .strict();

export function createPostMessageBodySchema(maxInputChars = DEFAULT_ASSISTANT_MAX_INPUT_CHARS) {
  return z
    .object({
      content: z.string().trim().min(1).max(maxInputChars),
      clientRequestId: z.uuid(),
    })
    .strict();
}

export const postMessageBodySchema = createPostMessageBodySchema();
