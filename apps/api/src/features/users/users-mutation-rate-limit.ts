import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  USERS_MUTATION_RATE_LIMIT_MAX_ATTEMPTS,
  USERS_MUTATION_RATE_LIMIT_WINDOW_MS,
} from './constants.js';

const usersMutationRateLimitStore = new MemoryStore();

export const usersMutationRateLimiter = rateLimit({
  windowMs: USERS_MUTATION_RATE_LIMIT_WINDOW_MS,
  limit: USERS_MUTATION_RATE_LIMIT_MAX_ATTEMPTS,
  store: usersMutationRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetUsersMutationRateLimit(): Promise<void> {
  await usersMutationRateLimitStore.resetAll();
}
