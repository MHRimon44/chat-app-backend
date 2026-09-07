import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';

const requestIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

function chooseRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
}

export function createHttpLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    customLogLevel(_request, response, error) {
      if (error || response.statusCode >= 500) return 'error';
      if (response.statusCode >= 400) return 'warn';
      return 'info';
    },
    genReqId(request, response) {
      const requestId = chooseRequestId(request.headers['x-request-id']);
      response.setHeader('x-request-id', requestId);
      return requestId;
    },
    logger,
  });
}
