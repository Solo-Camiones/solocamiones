import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  PROFILE_MUTATION_RATE_LIMIT_MAX_ATTEMPTS,
  PROFILE_MUTATION_RATE_LIMIT_WINDOW_MS,
} from './constants.js';

const profileMutationRateLimitStore = new MemoryStore();

export const profileMutationRateLimiter = rateLimit({
  windowMs: PROFILE_MUTATION_RATE_LIMIT_WINDOW_MS,
  limit: PROFILE_MUTATION_RATE_LIMIT_MAX_ATTEMPTS,
  store: profileMutationRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetProfileMutationRateLimit(): Promise<void> {
  await profileMutationRateLimitStore.resetAll();
}
