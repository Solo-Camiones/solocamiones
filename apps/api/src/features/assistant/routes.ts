import { Router } from 'express';

import { validate } from '../../infrastructure/http/validate.js';
import { requireAuth } from '../access/require-auth.js';
import { requireCsrfHeader } from '../access/require-csrf.js';
import { requireAdministrator } from '../access/require-role.js';
import { assistantRateLimiter } from './assistant-rate-limit.js';
import {
  deleteConversation,
  getConversations,
  getMessages,
  postConversation,
  postMessage,
} from './controller.js';
import {
  conversationIdParamsSchema,
  createPostMessageBodySchema,
  paginationQuerySchema,
} from './validation.js';

export type CreateAssistantRouterOptions = {
  maxInputChars: number;
};

export function createAssistantRouter(options: CreateAssistantRouterOptions): Router {
  const router = Router();
  const postMessageBodySchema = createPostMessageBodySchema(options.maxInputChars);

  router.use(requireAuth, requireAdministrator, assistantRateLimiter);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/conversations', requireCsrfHeader, postConversation);
  router.get(
    '/conversations',
    validate({ query: paginationQuerySchema }),
    getConversations,
  );
  router.get(
    '/conversations/:id/messages',
    validate({ params: conversationIdParamsSchema, query: paginationQuerySchema }),
    getMessages,
  );
  router.post(
    '/conversations/:id/messages',
    requireCsrfHeader,
    validate({ params: conversationIdParamsSchema, body: postMessageBodySchema }),
    postMessage,
  );
  router.delete(
    '/conversations/:id',
    requireCsrfHeader,
    validate({ params: conversationIdParamsSchema }),
    deleteConversation,
  );

  return router;
}
