import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../../infrastructure/errors/app-error.js';
import { METRICS_RATE_LIMIT_MAX_REQUESTS, METRICS_RATE_LIMIT_WINDOW_MS } from './constants.js';

const metricsRateLimitStore = new MemoryStore();

/**
 * Protects GET /metrics bearer checks from brute-force and scrape abuse.
 * Keyed by client IP; internal Prometheus intervals stay well under the ceiling.
 */
export const metricsRateLimiter = rateLimit({
  windowMs: METRICS_RATE_LIMIT_WINDOW_MS,
  limit: METRICS_RATE_LIMIT_MAX_REQUESTS,
  store: metricsRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetMetricsRateLimit(): Promise<void> {
  await metricsRateLimitStore.resetAll();
}
