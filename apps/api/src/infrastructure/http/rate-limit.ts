import { rateLimit } from 'express-rate-limit';

// A SPA performs several reads per navigation/focus cycle. Sensitive operations retain
// their own tighter feature-level limits; this broad guard is only a coarse abuse ceiling.
export const DEFAULT_API_RATE_LIMIT_MAX_REQUESTS = 1_000;

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
