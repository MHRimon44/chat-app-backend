import request from 'supertest';

import { createApp } from '../src/app.js';
import type { AuthService } from '../src/auth/service.js';
import type { ReadinessProbe } from '../src/health/readiness.js';
import { createSilentLogger, createTestConfig } from './helpers.js';

const readiness: ReadinessProbe = {
  check: async () => ({ checks: { mongo: 'up', redis: 'up' }, ready: true }),
};

function createAuthStub(): AuthService {
  return {
    authenticateAccess: jest.fn(async () => ({ userId: 'user-1', sessionId: 'session-1' })),
    register: jest.fn(async () => ({
      message: 'A verification code has been sent to your email.',
    })),
    verifyRegistration: jest.fn(),
    verifyPasswordResetOtp: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    revokeSession: jest.fn(),
    listSessions: jest.fn(async () => []),
    forgotPassword: jest.fn(async () => ({ message: 'Generic response.' })),
    resetPassword: jest.fn(),
  } as unknown as AuthService;
}

describe('authentication HTTP routes', () => {
  it('validates and registers an account using the standard success envelope', async () => {
    const auth = createAuthStub();
    const app = createApp({
      auth,
      config: createTestConfig({ registrationOtpEnabled: true }),
      logger: createSilentLogger(),
      readiness,
    });

    const response = await request(app)
      .post('/v1/auth/register')
      .send({
        username: 'mehedi',
        displayName: 'Mehedi',
        email: 'mehedi@example.com',
        password: 'a secure passphrase',
        device: { platform: 'android', deviceName: 'Pixel' },
      })
      .expect(202);

    expect(response.body).toMatchObject({
      data: { message: 'A verification code has been sent to your email.' },
    });
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'mehedi',
        email: 'mehedi@example.com',
        device: expect.objectContaining({ platform: 'android' }),
      }),
    );
  });

  it('accepts a six-character registration password', async () => {
    const auth = createAuthStub();
    const app = createApp({
      auth,
      config: createTestConfig(),
      logger: createSilentLogger(),
      readiness,
    });

    await request(app)
      .post('/v1/auth/register')
      .send({
        username: 'mehedi',
        displayName: 'Mehedi',
        email: 'mehedi@example.com',
        password: 'abc123',
      })
      .expect(201);

    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ password: 'abc123' }));
  });

  it('rejects weak registration passwords before calling the service', async () => {
    const auth = createAuthStub();
    const app = createApp({
      auth,
      config: createTestConfig(),
      logger: createSilentLogger(),
      readiness,
    });

    const response = await request(app)
      .post('/v1/auth/register')
      .send({
        username: 'mehedi',
        displayName: 'Mehedi',
        email: 'mehedi@example.com',
        password: 'short',
      })
      .expect(422);

    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('requires a valid username during registration', async () => {
    const auth = createAuthStub();
    const app = createApp({
      auth,
      config: createTestConfig(),
      logger: createSilentLogger(),
      readiness,
    });

    const response = await request(app)
      .post('/v1/auth/register')
      .send({
        username: 'not valid!',
        displayName: 'Mehedi',
        email: 'mehedi@example.com',
        password: 'a secure passphrase',
      })
      .expect(422);

    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('requires a bearer credential on protected session routes', async () => {
    const auth = createAuthStub();
    const app = createApp({
      auth,
      config: createTestConfig(),
      logger: createSilentLogger(),
      readiness,
    });

    const response = await request(app).get('/v1/auth/sessions').expect(401);

    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(auth.listSessions).not.toHaveBeenCalled();
  });
});

describe('auth feature routing and Swagger', () => {
  it.each([false, true])('matches routes and documentation to enabled=%s', async (enabled) => {
    const auth = createAuthStub();
    const app = createApp({
      auth,
      config: createTestConfig({ registrationOtpEnabled: enabled, passwordResetEnabled: enabled }),
      logger: createSilentLogger(),
      readiness,
    });
    const docs = await request(app).get('/openapi.json').expect(200);
    const document = docs.body as {
      paths: Record<string, { post: { responses: Record<string, unknown> } }>;
    };
    for (const path of [
      '/register/verify',
      '/password/forgot',
      '/password/verify-otp',
      '/password/reset',
    ]) {
      if (enabled) {
        expect(document.paths[`/auth${path}`]).toBeDefined();
        await request(app).post(`/v1/auth${path}`).send({}).expect(422);
      } else {
        expect(document.paths[`/auth${path}`]).toBeUndefined();
        await request(app).post(`/v1/auth${path}`).send({}).expect(404);
      }
    }
    expect(document.paths['/auth/register']!.post.responses[enabled ? '202' : '201']).toBeDefined();
    expect(auth.verifyRegistration).not.toHaveBeenCalled();
    expect(auth.forgotPassword).not.toHaveBeenCalled();
    expect(auth.verifyPasswordResetOtp).not.toHaveBeenCalled();
    expect(auth.resetPassword).not.toHaveBeenCalled();
  });
});
