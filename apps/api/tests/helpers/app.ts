import { createApp, type CreateAppOptions } from '../../src/app.js';

export function createTestApp(options?: CreateAppOptions) {
  return createApp({ trustProxy: true, apiRateLimitMaxRequests: 1_000, ...options });
}
