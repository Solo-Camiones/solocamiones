import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/app.js';
import { createAllowedHostsMiddleware } from '../../../src/infrastructure/http/allowed-hosts.js';

describe('allowed hosts middleware', () => {
  it('skips enforcement when the allow-list is empty', async () => {
    const app = express();
    app.use(createAllowedHostsMiddleware([]));
    app.get('/ok', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/ok').set('Host', 'anything.example');
    expect(response.status).toBe(200);
  });

  it('accepts an exact Host match and rejects others through createApp', async () => {
    const probe = express.Router();
    probe.get('/ping', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const app = createApp({
      allowedHosts: ['staging.solocamiones.com'],
      extraRouters: [{ path: '/__test', router: probe }],
    });

    const accepted = await request(app)
      .get('/__test/ping')
      .set('Host', 'staging.solocamiones.com');
    expect(accepted.status).toBe(200);

    const rejected = await request(app).get('/__test/ping').set('Host', 'evil.example');
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('VALIDATION');
  });
});
