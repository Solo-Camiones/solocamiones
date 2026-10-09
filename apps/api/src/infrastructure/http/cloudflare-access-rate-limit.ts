import { MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../errors/app-error.js';
import { isMetricsScrapePath } from './cloudflare-access.js';

/**
 * Caps failed Cloudflare Access checks per IP.
 * Valid JWTs do not consume the budget (skipSuccessfulRequests).
 * Aligned with metrics scrape ceiling: enough for retries, tight against JWT flood/DoS.
 */
export const CLOUDFLARE_ACCESS_RATE_LIMIT_MAX_ATTEMPTS = 60;
export const CLOUDFLARE_ACCESS_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const cloudflareAccessRateLimitStore = new MemoryStore();

/**
 * Mount immediately before createCloudflareAccessMiddleware when Access is enabled.
 * Skips GET /metrics (own bearer rate limit). Does not apply when Access is off.
 */
export const cloudflareAccessRateLimiter = rateLimit({
  windowMs: CLOUDFLARE_ACCESS_RATE_LIMIT_WINDOW_MS,
  limit: CLOUDFLARE_ACCESS_RATE_LIMIT_MAX_ATTEMPTS,
  store: cloudflareAccessRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => isMetricsScrapePath(req),
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests());
  },
});

export async function resetCloudflareAccessRateLimit(): Promise<void> {
  await cloudflareAccessRateLimitStore.resetAll();
}
