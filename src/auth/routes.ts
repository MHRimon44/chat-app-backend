import { Router, type Request } from 'express';
import { z } from 'zod';

import { getAuthContext, requireAccessToken } from './middleware.js';
import type { AuthService } from './service.js';
import type { DeviceMetadata } from './types.js';

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(6).max(128);
const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,30}$/);
const deviceSchema = z.object({
  deviceId: z.string().trim().min(1).max(200).optional(),
  deviceName: z.string().trim().min(1).max(100).optional(),
  platform: z.enum(['android', 'ios', 'unknown']).default('unknown'),
  appVersion: z.string().trim().min(1).max(50).optional(),
});
const registerSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
  device: deviceSchema.optional(),
});
const otpSchema = z.string().regex(/^\d{6}$/);
const verifyRegistrationSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  device: deviceSchema.optional(),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  device: deviceSchema.optional(),
});
const refreshSchema = z.object({ refreshToken: z.string().min(40).max(200) });
const forgotSchema = z.object({ email: emailSchema });
const verifyResetOtpSchema = z.object({ email: emailSchema, otp: otpSchema });
const resetSchema = z.object({ token: z.string().min(40).max(200), password: passwordSchema });
const sessionParamsSchema = z.object({ sessionId: z.string().regex(/^[a-f\d]{24}$/i) });

export function createAuthRouter(
  auth: AuthService,
  features: { registrationOtpEnabled: boolean; passwordResetEnabled: boolean },
): Router {
  const router = Router();
  const accessRequired = requireAccessToken(auth);

  router.post('/register', async (request, response) => {
    const input = registerSchema.parse(request.body);
    const result = await auth.register({
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      device: requestDevice(request, input.device),
    });
    response.status(features.registrationOtpEnabled ? 202 : 201).json({ data: result });
  });

  if (features.registrationOtpEnabled)
    router.post('/register/verify', async (request, response) => {
      const input = verifyRegistrationSchema.parse(request.body);
      const pair = await auth.verifyRegistration({
        email: input.email,
        otp: input.otp,
        device: requestDevice(request, input.device),
      });
      response.status(201).json({ data: pair });
    });

  router.post('/login', async (request, response) => {
    const input = loginSchema.parse(request.body);
    const pair = await auth.login({
      email: input.email,
      password: input.password,
      device: requestDevice(request, input.device),
    });
    response.json({ data: pair });
  });

  router.post('/refresh', async (request, response) => {
    const input = refreshSchema.parse(request.body);
    response.json({ data: await auth.refresh(input.refreshToken) });
  });

  router.post('/logout', accessRequired, async (_request, response) => {
    const context = getAuthContext(response.locals);
    await auth.logout(context.userId, context.sessionId);
    response.status(204).send();
  });

  router.post('/logout-all', accessRequired, async (_request, response) => {
    const context = getAuthContext(response.locals);
    await auth.logoutAll(context.userId);
    response.status(204).send();
  });

  router.get('/sessions', accessRequired, async (_request, response) => {
    const context = getAuthContext(response.locals);
    response.json({ data: await auth.listSessions(context.userId, context.sessionId) });
  });

  router.delete('/sessions/:sessionId', accessRequired, async (request, response) => {
    const context = getAuthContext(response.locals);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    await auth.revokeSession(context.userId, sessionId);
    response.status(204).send();
  });

  // TEMPORARILY DISABLED: Password recovery awaits enabled email delivery.
  if (features.passwordResetEnabled)
    router.post('/password/forgot', async (request, response) => {
      const { email } = forgotSchema.parse(request.body);
      response.json({ data: await auth.forgotPassword(email, request.ip) });
    });

  // TEMPORARILY DISABLED: Password recovery awaits enabled email delivery.
  if (features.passwordResetEnabled)
    router.post('/password/verify-otp', async (request, response) => {
      const input = verifyResetOtpSchema.parse(request.body);
      response.json({
        data: await auth.verifyPasswordResetOtp(input.email, input.otp, request.ip),
      });
    });

  // TEMPORARILY DISABLED: Password recovery awaits enabled email delivery.
  if (features.passwordResetEnabled)
    router.post('/password/reset', async (request, response) => {
      const input = resetSchema.parse(request.body);
      await auth.resetPassword(input.token, input.password);
      response.status(204).send();
    });

  return router;
}

function requestDevice(
  request: Request,
  body: z.infer<typeof deviceSchema> | undefined,
): DeviceMetadata {
  const userAgent = request.header('user-agent');
  return {
    ...(body?.deviceId ? { deviceId: body.deviceId } : {}),
    ...(body?.deviceName ? { deviceName: body.deviceName } : {}),
    platform: body?.platform ?? 'unknown',
    ...(body?.appVersion ? { appVersion: body.appVersion } : {}),
    ...(request.ip ? { ip: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
