import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../src/app.js';
import { METRICS_RATE_LIMIT_MAX_REQUESTS } from '../../../src/features/health/constants.js';
import { resetMetricsRateLimit } from '../../../src/features/health/metrics-rate-limit.js';
import { CF_ACCESS_JWT_HEADER } from '../../../src/infrastructure/http/cloudflare-access.js';
import { resetAssistantMetricsForTests } from '../../../src/infrastructure/metrics/index.js';

describe('GET /metrics', () => {
  afterEach(async () => {
    resetAssistantMetricsForTests();
    await resetMetricsRateLimit();
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

  it('rate-limits scrape attempts from the same client with 429 TOO_MANY_REQUESTS', async () => {
    process.env.METRICS_BEARER_TOKEN = 'metrics-secret';
    const app = createApp({ trustProxy: true });
    const clientIp = '203.0.113.50';

    for (let attempt = 0; attempt < METRICS_RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
      const response = await request(app)
        .get('/metrics')
        .set('X-Forwarded-For', clientIp)
        .set('Authorization', 'Bearer wrong-token');
      expect(response.status).toBe(401);
    }

    const limited = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', clientIp)
      .set('Authorization', 'Bearer wrong-token');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherClient = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', '203.0.113.51')
      .set('Authorization', 'Bearer metrics-secret');
    expect(otherClient.status).toBe(200);
  });

  it('skips Cloudflare Access and Host allow-list for internal scrapes', async () => {
    process.env.METRICS_BEARER_TOKEN = 'metrics-secret';
    const verifyJwt = vi.fn(async () => ({}));

    const app = createApp({
      allowedHosts: ['staging.solocamiones.com'],
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'staging-aud',
      },
      verifyCloudflareAccessJwt: verifyJwt,
    });

    // Internal scrape uses service hostname Host, not the public allow-list value.
    const denied = await request(app).get('/metrics').set('Host', 'api:3000');
    expect(denied.status).toBe(401);
    expect(verifyJwt).not.toHaveBeenCalled();

    const ok = await request(app)
      .get('/metrics')
      .set('Host', 'api:3000')
      .set('Authorization', 'Bearer metrics-secret');
    expect(ok.status).toBe(200);
    expect(verifyJwt).not.toHaveBeenCalled();
    expect(ok.text).toContain('http_requests_total');
  });

  it('still requires Access JWT on health when Access is enabled', async () => {
    const verifyJwt = vi.fn(async () => ({}));
    const app = createApp({
      allowedHosts: ['staging.solocamiones.com'],
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'staging-aud',
      },
      verifyCloudflareAccessJwt: verifyJwt,
    });

    const denied = await request(app)
      .get('/api/health/live')
      .set('Host', 'staging.solocamiones.com');
    expect(denied.status).toBe(401);

    const allowed = await request(app)
      .get('/api/health/live')
      .set('Host', 'staging.solocamiones.com')
      .set(CF_ACCESS_JWT_HEADER, 'access-ok');
    expect(allowed.status).toBe(200);
    expect(verifyJwt).toHaveBeenCalled();
  });

  it('exposes HTTP request metrics after traffic', async () => {
    process.env.METRICS_BEARER_TOKEN = 'metrics-secret';
    const app = createApp();

    await request(app).get('/api/health/live');

    const metrics = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer metrics-secret');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toContain('route_group="health"');
    expect(metrics.text).toContain('http_request_duration_seconds');
  });
});
