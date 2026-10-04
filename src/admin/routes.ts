import { Router } from 'express';
import { z } from 'zod';

import { getAuthContext, requireAccessToken } from '../auth/middleware.js';
import type { AuthService } from '../auth/service.js';
import type { ReadinessProbe } from '../health/readiness.js';
import type { AdminService } from './service.js';

const listSchema = z.object({
  query: z.string().max(100).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const statusSchema = z.object({ status: z.enum(['active', 'disabled']) });
const auditSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const resetPasswordSchema = z.object({ password: z.string().min(6).max(128) });

export function createAdminRouter(
  auth: AuthService,
  admin: AdminService,
  readiness: ReadinessProbe,
): Router {
  const router = Router();
  router.use(requireAccessToken(auth));
  router.use(async (_req, res, next) => {
    try {
      await admin.assertAdmin(getAuthContext(res.locals).userId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', (_req, res) => {
    const { userId } = getAuthContext(res.locals);
    res.status(200).json({ data: { admin: true, userId } });
  });
  router.get('/dashboard', async (_req, res, next) => {
    try {
      res.status(200).json({ data: await admin.dashboard() });
    } catch (error) {
      next(error);
    }
  });
  router.get('/users', async (req, res, next) => {
    try {
      const parsed = listSchema.parse(req.query);
      const input = {
        page: parsed.page,
        limit: parsed.limit,
        ...(parsed.query !== undefined ? { query: parsed.query } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      };
      res.status(200).json({ data: await admin.listUsers(input) });
    } catch (error) {
      next(error);
    }
  });
  router.get('/users/:userId', async (req, res, next) => {
    try {
      res.status(200).json({ data: await admin.getUser(req.params.userId) });
    } catch (error) {
      next(error);
    }
  });
  router.patch('/users/:userId/status', async (req, res, next) => {
    try {
      const { userId: actorId } = getAuthContext(res.locals);
      const input = statusSchema.parse(req.body);
      res
        .status(200)
        .json({ data: await admin.setUserStatus(actorId, req.params.userId, input.status) });
    } catch (error) {
      next(error);
    }
  });
  router.post('/users/:userId/revoke-sessions', async (req, res, next) => {
    try {
      const { userId: actorId } = getAuthContext(res.locals);
      const revoked = await admin.revokeSessions(actorId, req.params.userId);
      res.status(200).json({ data: { revoked } });
    } catch (error) {
      next(error);
    }
  });
  router.post('/users/:userId/reset-password', async (req, res, next) => {
    try {
      const { userId: actorId } = getAuthContext(res.locals);
      const { password } = resetPasswordSchema.parse(req.body);
      res.status(200).json({
        data: await admin.resetUserPassword(actorId, req.params.userId, password),
      });
    } catch (error) {
      next(error);
    }
  });
  router.delete('/users/:userId', async (req, res, next) => {
    try {
      const { userId: actorId } = getAuthContext(res.locals);
      res.status(200).json({ data: await admin.deleteUser(actorId, req.params.userId) });
    } catch (error) {
      next(error);
    }
  });
  router.get('/audit', async (req, res, next) => {
    try {
      const { limit } = auditSchema.parse(req.query);
      res.status(200).json({ data: await admin.listAudit(limit) });
    } catch (error) {
      next(error);
    }
  });
  router.get('/system/health', async (_req, res, next) => {
    try {
      const result = await readiness.check();
      res
        .status(result.ready ? 200 : 503)
        .json({
          data: {
            ...result,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
          },
        });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
