import { rateLimit } from 'express-rate-limit';

export const DEFAULT_API_RATE_LIMIT_MAX_REQUESTS = 100;

export function createApiRateLimiter(
  maxRequests = DEFAULT_API_RATE_LIMIT_MAX_REQUESTS,
) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
