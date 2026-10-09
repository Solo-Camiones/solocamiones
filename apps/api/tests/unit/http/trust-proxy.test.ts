import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp, isTrustProxyEnabled, trustImmediateProxyHop } from '../../../src/app.js';

describe('trust proxy policy', () => {
  it('does not treat private or loopback peers as trusted unless explicitly enabled', () => {
    expect(isTrustProxyEnabled(undefined)).toBe(false);
    expect(isTrustProxyEnabled('')).toBe(false);
    expect(isTrustProxyEnabled('false')).toBe(false);
    expect(isTrustProxyEnabled('1')).toBe(true);
    expect(isTrustProxyEnabled('true')).toBe(true);

    expect(trustImmediateProxyHop('172.18.0.3', 0, false)).toBe(false);
    expect(trustImmediateProxyHop('127.0.0.1', 0, false)).toBe(false);
    expect(trustImmediateProxyHop('::1', 0, false)).toBe(false);
    expect(trustImmediateProxyHop('203.0.113.10', 0, false)).toBe(false);

    expect(trustImmediateProxyHop('172.18.0.3', 0, true)).toBe(true);
    expect(trustImmediateProxyHop('203.0.113.10', 0, true)).toBe(true);
    expect(trustImmediateProxyHop('172.18.0.3', 1, true)).toBe(false);
  });

  it('ignores X-Forwarded-For when trust proxy is disabled', async () => {
    const probe = express.Router();
    probe.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    const app = createApp({
      trustProxy: false,
      extraRouters: [{ path: '/__test', router: probe }],
    });

    const response = await request(app).get('/__test/ip').set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(200);
    expect(String(response.body.ip)).not.toContain('203.0.113.10');
  });

  it('uses the immediate forwarded client when trust proxy is enabled', async () => {
    const probe = express.Router();
    probe.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    const app = createApp({
      trustProxy: true,
      extraRouters: [{ path: '/__test', router: probe }],
    });

    const response = await request(app).get('/__test/ip').set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(200);
    expect(String(response.body.ip)).toContain('203.0.113.10');
  });
});
