import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  USERS_READ_RATE_LIMIT_MAX_ATTEMPTS,
  USERS_READ_RATE_LIMIT_WINDOW_MS,
} from './constants.js';

const usersReadRateLimitStore = new MemoryStore();

export const usersReadRateLimiter = rateLimit({
  windowMs: USERS_READ_RATE_LIMIT_WINDOW_MS,
  limit: USERS_READ_RATE_LIMIT_MAX_ATTEMPTS,
  store: usersReadRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetUsersReadRateLimit(): Promise<void> {
  await usersReadRateLimitStore.resetAll();
}
