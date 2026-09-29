import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../src/app.js';
import { resetAssistantMetricsForTests } from '../../../src/infrastructure/metrics/index.js';

describe('GET /metrics', () => {
  afterEach(() => {
    resetAssistantMetricsForTests();
    delete process.env.METRICS_BEARER_TOKEN;
  });

  it('returns 404 when METRICS_BEARER_TOKEN is unset', async () => {
    delete process.env.METRICS_BEARER_TOKEN;
    const res = await request(createApp()).get('/metrics');
    expect(res.status).toBe(404);
  });

  it('requires a matching bearer token when configured', async () => {
    process.env.METRICS_BEARER_TOKEN = 'metrics-secret';
    const denied = await request(createApp()).get('/metrics');
    expect(denied.status).toBe(401);

    const ok = await request(createApp())
      .get('/metrics')
      .set('Authorization', 'Bearer metrics-secret');
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('#');
  });
});
