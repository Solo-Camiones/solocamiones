import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../src/app.js';
import { resetMetricsRateLimit } from '../../../src/features/health/metrics-rate-limit.js';
import {
  CF_ACCESS_JWT_HEADER,
  CLOUDFLARE_ACCESS_RATE_LIMIT_MAX_ATTEMPTS,
  createCloudflareAccessMiddleware,
  resetCloudflareAccessRateLimit,
  verifyCloudflareAccessJwt,
} from '../../../src/infrastructure/http/index.js';

describe('cloudflare access middleware', () => {
  afterEach(async () => {
    await resetMetricsRateLimit();
    await resetCloudflareAccessRateLimit();
    delete process.env.METRICS_BEARER_TOKEN;
  });

  it('skips verification when Access config is absent', () => {
    const middleware = createCloudflareAccessMiddleware({ config: null });
    const next = vi.fn() as NextFunction;

    middleware({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
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

  it('rate-limits failed Access JWT checks from the same client with 429', async () => {
    const verifyJwt = vi.fn(async () => {
      throw new Error('invalid');
    });

    const app = createApp({
      trustProxy: true,
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'aud-1',
      },
      verifyCloudflareAccessJwt: verifyJwt,
    });

    const clientIp = '203.0.113.80';

    for (let attempt = 0; attempt < CLOUDFLARE_ACCESS_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      const response = await request(app)
        .get('/api/health/live')
        .set('X-Forwarded-For', clientIp)
        .set(CF_ACCESS_JWT_HEADER, 'bad-token');
      expect(response.status).toBe(401);
    }

    const limited = await request(app)
      .get('/api/health/live')
      .set('X-Forwarded-For', clientIp)
      .set(CF_ACCESS_JWT_HEADER, 'bad-token');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');

    const otherClient = await request(app)
      .get('/api/health/live')
      .set('X-Forwarded-For', '203.0.113.81')
      .set(CF_ACCESS_JWT_HEADER, 'bad-token');
    expect(otherClient.status).toBe(401);
  });

  it('does not consume Access rate-limit budget on successful JWT verification', async () => {
    const verifyJwt = vi.fn(async () => ({}));

    const app = createApp({
      trustProxy: true,
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'aud-1',
      },
      verifyCloudflareAccessJwt: verifyJwt,
    });

    const clientIp = '203.0.113.90';

    for (let attempt = 0; attempt < CLOUDFLARE_ACCESS_RATE_LIMIT_MAX_ATTEMPTS + 5; attempt += 1) {
      const response = await request(app)
        .get('/api/health/live')
        .set('X-Forwarded-For', clientIp)
        .set(CF_ACCESS_JWT_HEADER, 'access-ok');
      expect(response.status).toBe(200);
    }
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
