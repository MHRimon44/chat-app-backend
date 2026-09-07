import request from 'supertest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import type { ReadinessProbe } from '../src/health/readiness.js';
import { createSilentLogger, createTestConfig } from './helpers.js';

const readyProbe: ReadinessProbe = {
  check: () => Promise.resolve({ checks: { mongo: 'up', redis: 'up' }, ready: true }),
};

const healthResponseSchema = z.object({
  data: z.object({
    checks: z.object({ mongo: z.enum(['up', 'down']), redis: z.enum(['up', 'down']) }).optional(),
    status: z.string(),
  }),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().min(1),
  }),
});

describe('API foundation', () => {
  const app = createApp({
    config: createTestConfig(),
    logger: createSilentLogger(),
    readiness: readyProbe,
  });

  it('returns liveness without querying dependencies', async () => {
    const response = await request(app).get('/v1/health/live').expect(200);

    const body = healthResponseSchema.parse(response.body as unknown);
    expect(body.data.status).toBe('alive');
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns readiness and dependency-safe statuses', async () => {
    const response = await request(app).get('/v1/health/ready').expect(200);

    const body = healthResponseSchema.parse(response.body as unknown);
    expect(body).toMatchObject({
      data: { checks: { mongo: 'up', redis: 'up' }, status: 'ready' },
    });
  });

  it('returns 503 when a required dependency is unavailable', async () => {
    const unavailableApp = createApp({
      config: createTestConfig(),
      logger: createSilentLogger(),
      readiness: {
        check: () => Promise.resolve({ checks: { mongo: 'up', redis: 'down' }, ready: false }),
      },
    });

    const response = await request(unavailableApp).get('/v1/health/ready').expect(503);
    const body = healthResponseSchema.parse(response.body as unknown);
    expect(body.data).toMatchObject({
      checks: { mongo: 'up', redis: 'down' },
      status: 'not_ready',
    });
    expect(response.text).not.toContain('password');
  });

  it('allows configured browser origins', async () => {
    const response = await request(app)
      .get('/v1/health/live')
      .set('Origin', 'https://allowed.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });

  it('rejects unconfigured browser origins with the standard error envelope', async () => {
    const response = await request(app)
      .get('/v1/health/live')
      .set('Origin', 'https://attacker.example')
      .expect(403);

    const body = errorResponseSchema.parse(response.body as unknown);
    expect(body.error).toMatchObject({
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not allowed.',
    });
    expect(body.error.requestId).toHaveLength(36);
  });

  it('preserves a safe caller request ID', async () => {
    const response = await request(app)
      .get('/v1/health/live')
      .set('x-request-id', 'client_request_1234')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('client_request_1234');
  });

  it('replaces an unsafe caller request ID', async () => {
    const response = await request(app)
      .get('/v1/health/live')
      .set('x-request-id', 'contains spaces and secrets')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('contains spaces and secrets');
  });

  it('rejects malformed JSON safely', async () => {
    const response = await request(app)
      .post('/v1/not-found')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    const body = errorResponseSchema.parse(response.body as unknown);
    expect(body.error.code).toBe('INVALID_JSON');
    expect(body.error.requestId).toHaveLength(36);
  });

  it('enforces request payload limits', async () => {
    const response = await request(app)
      .post('/v1/not-found')
      .send({ value: 'x'.repeat(2_000) })
      .expect(413);

    const body = errorResponseSchema.parse(response.body as unknown);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(app).get('/v1/unknown').expect(404);

    const body = errorResponseSchema.parse(response.body as unknown);
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(body.error.requestId).toHaveLength(36);
  });
});
