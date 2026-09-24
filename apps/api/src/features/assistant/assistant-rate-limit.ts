import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  ASSISTANT_RATE_LIMIT_MAX_REQUESTS,
  ASSISTANT_RATE_LIMIT_WINDOW_MS,
} from './constants.js';

const assistantRateLimitStore = new MemoryStore();

/**
 * Dedicated ceiling for /api/assistant. Keyed by authenticated user after requireAuth.
 * Daily message quota still caps LLM cost separately.
 */
export const assistantRateLimiter = rateLimit({
  windowMs: ASSISTANT_RATE_LIMIT_WINDOW_MS,
  limit: ASSISTANT_RATE_LIMIT_MAX_REQUESTS,
  store: assistantRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  // User id is intentional (not IP); disable the IPv6 keyGenerator warning.
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const userId = req.auth?.userId;
    return userId != null ? `user:${userId}` : `ip:${req.ip ?? 'unknown'}`;
  },
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetAssistantRateLimit(): Promise<void> {
  await assistantRateLimitStore.resetAll();
}
