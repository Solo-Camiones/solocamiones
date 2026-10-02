import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../src/app.js';
import { isSessionCookieSecure } from '../../../src/features/access/constants.js';
import { CF_ACCESS_JWT_HEADER } from '../../../src/infrastructure/http/cloudflare-access.js';
import { createTestApp } from '../../helpers/app.js';

describe('HTTP edge security', () => {
  it('requires Cloudflare Access JWT on health endpoints when Access is enabled', async () => {
    const verifyJwt = vi.fn(async (token: string) => {
      if (token !== 'access-ok') {
        throw new Error('invalid');
      }
      return {};
    });

    const app = createApp({
      trustProxy: true,
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
    expect(allowed.body.status).toBe('ok');
  });

  it('rejects host spoofing before Access verification', async () => {
    const verifyJwt = vi.fn(async () => ({}));
    const app = createApp({
      allowedHosts: ['app.solocamiones.com'],
      cloudflareAccess: {
        teamDomain: 'example.cloudflareaccess.com',
        audience: 'prod-aud',
      },
      verifyCloudflareAccessJwt: verifyJwt,
    });

    const response = await request(app)
      .get('/api/health/live')
      .set('Host', 'evil.example')
      .set(CF_ACCESS_JWT_HEADER, 'access-ok');

    expect(response.status).toBe(400);
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it('keeps local/test apps usable without Access while preserving Secure cookie policy', async () => {
    const response = await request(createTestApp()).get('/api/health/live');
    expect(response.status).toBe(200);
    expect(isSessionCookieSecure('production')).toBe(true);
    expect(isSessionCookieSecure('test')).toBe(false);
  });
});
