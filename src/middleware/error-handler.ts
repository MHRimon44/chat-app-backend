import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.js';

function isBodyParserError(error: unknown, type: string): boolean {
  return error instanceof Error && 'type' in error && error.type === type;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new AppError({
      code: 'VALIDATION_ERROR',
      details: {
        fields: error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join('.'),
        })),
      },
      message: 'Request validation failed.',
      statusCode: 422,
    });
  }

  if (isBodyParserError(error, 'entity.too.large')) {
    return new AppError({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large.',
      statusCode: 413,
    });
  }

  if (isBodyParserError(error, 'entity.parse.failed')) {
    return new AppError({
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON.',
      statusCode: 400,
    });
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    expose: false,
    message: 'An unexpected error occurred.',
    statusCode: 500,
  });
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError({
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.path} was not found.`,
      statusCode: 404,
    }),
  );
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const normalizedError = normalizeError(error);

  if (normalizedError.statusCode >= 500) {
    request.log.error({ err: error }, 'Request failed with an unexpected error');
  } else {
    request.log.warn(
      { code: normalizedError.code, statusCode: normalizedError.statusCode },
      'Request rejected',
    );
  }

  const responseError: {
    code: string;
    details?: Readonly<Record<string, unknown>>;
    message: string;
    requestId: string;
  } = {
    code: normalizedError.code,
    message: normalizedError.expose ? normalizedError.message : 'An unexpected error occurred.',
    requestId:
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : 'unknown',
  };

  if (normalizedError.expose && normalizedError.details)
    responseError.details = normalizedError.details;
  response.status(normalizedError.statusCode).json({ error: responseError });
};
