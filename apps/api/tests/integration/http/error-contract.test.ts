import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { JSON_BODY_LIMIT_BYTES } from '../../../src/app.js';
import { AppError } from '../../../src/infrastructure/errors/app-error.js';
import { UNEXPECTED_ERROR_CLIENT_MESSAGE } from '../../../src/infrastructure/errors/map-error.js';
import { REQUEST_ID_HEADER } from '../../../src/infrastructure/http/request-id.js';
import { validate } from '../../../src/infrastructure/http/validate.js';
import { createTestApp } from '../../helpers/app.js';

const probeBodySchema = z.object({ name: z.string().min(1) }).strict();
const probeQuerySchema = z.object({ q: z.string().min(1) }).strict();
const probeParamsSchema = z.object({ id: z.string().min(1) }).strict();

function createProbeRouter(): Router {
  const router = Router();

  router.post('/echo', validate({ body: probeBodySchema }), (req, res) => {
    const body = req.validated?.body as { name: string };
    res.status(200).json({ name: body.name });
  });

  router.get('/echo-query', validate({ query: probeQuerySchema }), (req, res) => {
    const query = req.validated?.query as { q: string };
    res.status(200).json({ q: query.q });
  });

  router.get('/echo-params/:id', validate({ params: probeParamsSchema }), (req, res) => {
    const params = req.validated?.params as { id: string };
    res.status(200).json({ id: params.id });
  });

  router.get('/path-snapshot', (req, res) => {
    res.status(200).json({ requestPath: req.requestPath, routerPath: req.path });
  });

  router.get('/boom', () => {
    throw new Error('secret stack trace and DATABASE_URL');
  });

  router.get('/conflict', () => {
    throw AppError.conflict('Username already exists');
  });

  router.get('/rate-limited', () => {
    throw AppError.tooManyRequests();
  });

  router.get('/unavailable', () => {
    throw AppError.serviceUnavailable('Assistant is disabled', {
      reason: 'ASSISTANT_DISABLED',
    });
  });

  return router;
}

function createProbeApp() {
  return createTestApp({
    extraRouters: [{ path: '/api/test-probe', router: createProbeRouter() }],
  });
}

describe('HTTP error contract (integration)', () => {
  it('returns 400 VALIDATION with details and without errorId for invalid bodies', async () => {
    const response = await request(createProbeApp())
      .post('/api/test-probe/echo')
      .send({ name: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.errorId).toBeUndefined();
    expect(response.body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
    );
  });

  it('parses query without assigning req.query (Express 5 getter)', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/echo-query').query({
      q: 'search',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ q: 'search' });
  });

  it('returns 400 VALIDATION for invalid query', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/echo-query');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.errorId).toBeUndefined();
  });

  it('parses route params into req.validated', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/echo-params/user-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'user-1' });
  });

  it('rejects unknown fields with 400 VALIDATION', async () => {
    const response = await request(createProbeApp())
      .post('/api/test-probe/echo')
      .send({ name: 'ok', extra: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
  });

  it('returns 500 INTERNAL with errorId and without internal details', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL');
    expect(response.body.error.message).toBe(UNEXPECTED_ERROR_CLIENT_MESSAGE);
    expect(response.body.error.errorId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('secret stack');
    expect(JSON.stringify(response.body)).not.toContain('DATABASE_URL');
  });

  it('maps application TOO_MANY_REQUESTS to 429 without errorId', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/rate-limited');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests',
      },
    });
  });

  it('maps application CONFLICT to 409 without errorId', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/conflict');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Username already exists',
      },
    });
  });

  it('maps application SERVICE_UNAVAILABLE to 503 without errorId', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/unavailable');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Assistant is disabled',
        details: { reason: 'ASSISTANT_DISABLED' },
      },
    });
  });

  it('returns 404 NOT_FOUND with the standard envelope for unknown routes', async () => {
    const response = await request(createProbeApp()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.errorId).toBeUndefined();
    expect(response.body.error.message).toMatch(/Route not found/i);
  });

  it('keeps the full path captured before mounted routers rewrite req.path', async () => {
    const response = await request(createProbeApp()).get('/api/test-probe/path-snapshot');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      requestPath: '/api/test-probe/path-snapshot',
      routerPath: '/path-snapshot',
    });
  });

  it('maps oversized JSON bodies to 413 PAYLOAD_TOO_LARGE without errorId', async () => {
    const oversizedName = 'x'.repeat(JSON_BODY_LIMIT_BYTES);
    const response = await request(createProbeApp())
      .post('/api/test-probe/echo')
      .set('Content-Type', 'application/json')
      .send({ name: oversizedName });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.error.errorId).toBeUndefined();
  });

  it('maps unsupported JSON charset to 415 UNSUPPORTED_MEDIA_TYPE without errorId', async () => {
    const response = await request(createProbeApp())
      .post('/api/test-probe/echo')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{"name":"ok"}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(response.body.error.errorId).toBeUndefined();
  });

  it('echoes or assigns X-Request-Id', async () => {
    const incomingId = 'client-correlation-id';
    const response = await request(createProbeApp())
      .get('/api/health/live')
      .set(REQUEST_ID_HEADER, incomingId);

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(incomingId);
  });

  it('sets basic Helmet security headers', async () => {
    const response = await request(createProbeApp()).get('/api/health/live');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
