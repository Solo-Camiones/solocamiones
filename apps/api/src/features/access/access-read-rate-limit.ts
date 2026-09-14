import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../../infrastructure/errors/app-error.js';
import {
  ACCESS_READ_RATE_LIMIT_MAX_REQUESTS,
  ACCESS_READ_RATE_LIMIT_WINDOW_MS,
} from './constants.js';

const accessReadRateLimitStore = new MemoryStore();

export const accessReadRateLimiter = rateLimit({
  windowMs: ACCESS_READ_RATE_LIMIT_WINDOW_MS,
  limit: ACCESS_READ_RATE_LIMIT_MAX_REQUESTS,
  store: accessReadRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetAccessReadRateLimit(): Promise<void> {
  await accessReadRateLimitStore.resetAll();
}
