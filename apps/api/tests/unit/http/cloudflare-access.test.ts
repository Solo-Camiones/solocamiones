import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../src/app.js';
import { resetMetricsRateLimit } from '../../../src/features/health/metrics-rate-limit.js';
import {
  CF_ACCESS_JWT_HEADER,
  createCloudflareAccessMiddleware,
  verifyCloudflareAccessJwt,
} from '../../../src/infrastructure/http/cloudflare-access.js';

describe('cloudflare access middleware', () => {
  afterEach(async () => {
    await resetMetricsRateLimit();
    delete process.env.METRICS_BEARER_TOKEN;
  });

  it('skips verification when Access config is absent', async () => {
    const app = express();
    app.use(createCloudflareAccessMiddleware({ config: null }));
    app.get('/ok', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/ok');
    expect(response.status).toBe(200);
  });

  it('rejects missing or invalid JWTs and accepts a verified token', async () => {
    const verifyJwt = vi.fn(async (token: string) => {
      if (token !== 'valid-token') {
        throw new Error('invalid');
      }
      return { sub: 'user' };
    });

    const probe = express.Router();
    probe.get('/ping', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const app = createApp({
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'aud-1',
      },
      verifyCloudflareAccessJwt: verifyJwt,
      extraRouters: [{ path: '/__test', router: probe }],
    });

    const missing = await request(app).get('/__test/ping');
    expect(missing.status).toBe(401);

    const invalid = await request(app).get('/__test/ping').set(CF_ACCESS_JWT_HEADER, 'bad-token');
    expect(invalid.status).toBe(401);

    const valid = await request(app).get('/__test/ping').set(CF_ACCESS_JWT_HEADER, 'valid-token');
    expect(valid.status).toBe(200);
    expect(verifyJwt).toHaveBeenCalled();
  });

  it('exports the real JWKS verifier for deployed use', () => {
    expect(typeof verifyCloudflareAccessJwt).toBe('function');
  });

  it('exempts GET /metrics from Access while keeping bearer protection', async () => {
    process.env.METRICS_BEARER_TOKEN = 'metrics-secret';
    const verifyJwt = vi.fn(async () => ({}));

    const app = createApp({
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'aud-1',
      },
      verifyCloudflareAccessJwt: verifyJwt,
    });

    const ok = await request(app).get('/metrics').set('Authorization', 'Bearer metrics-secret');
    expect(ok.status).toBe(200);
    expect(verifyJwt).not.toHaveBeenCalled();
  });
});
