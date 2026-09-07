import { Router } from 'express';

import type { ReadinessProbe } from '../health/readiness.js';

export function createHealthRouter(readiness: ReadinessProbe): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.status(200).json({
      data: {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
    });
  });

  router.get('/ready', async (_request, response) => {
    const result = await readiness.check();
    response.status(result.ready ? 200 : 503).json({
      data: {
        checks: result.checks,
        status: result.ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
