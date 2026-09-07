import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import type { AuthService } from './service.js';

export type AuthContext = Readonly<{ userId: string; sessionId: string }>;

export function requireAccessToken(auth: AuthService): RequestHandler {
  return async (request, response, next) => {
    try {
      const authorization = request.header('authorization');
      if (!authorization?.startsWith('Bearer ')) throw unauthenticated();
      const token = authorization.slice('Bearer '.length).trim();
      if (!token) throw unauthenticated();
      response.locals.auth = await auth.authenticateAccess(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getAuthContext(locals: Record<string, unknown>): AuthContext {
  const context = locals.auth;
  if (
    typeof context !== 'object' ||
    context === null ||
    !('userId' in context) ||
    !('sessionId' in context) ||
    typeof context.userId !== 'string' ||
    typeof context.sessionId !== 'string'
  ) {
    throw unauthenticated();
  }
  return { userId: context.userId, sessionId: context.sessionId };
}

function unauthenticated(): AppError {
  return new AppError({
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required.',
    statusCode: 401,
  });
}
