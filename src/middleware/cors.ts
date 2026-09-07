import cors, { type CorsOptions } from 'cors';
import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';

export function createCorsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const allowlist = new Set(allowedOrigins);
  const options: CorsOptions = {
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          code: 'CORS_ORIGIN_DENIED',
          message: 'Origin is not allowed.',
          statusCode: 403,
        }),
      );
    },
  };

  return cors(options);
}
