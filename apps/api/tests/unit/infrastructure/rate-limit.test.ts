import { describe, expect, it } from 'vitest';

import { DEFAULT_API_RATE_LIMIT_MAX_REQUESTS } from '../../../src/infrastructure/http/rate-limit.js';

describe('broad API rate limit', () => {
  it('leaves enough headroom for normal SPA reads while feature limits protect sensitive routes', () => {
    expect(DEFAULT_API_RATE_LIMIT_MAX_REQUESTS).toBe(1_000);
  });
});
