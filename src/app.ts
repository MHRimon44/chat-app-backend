import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import type { ApiConfig } from './config/env.js';
import { createAuthRouter } from './auth/routes.js';
import type { AuthService } from './auth/service.js';
import { createConversationRouter } from './conversations/routes.js';
import type { ConversationService } from './conversations/service.js';
import type { ReadinessProbe } from './health/readiness.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHttpLogger } from './middleware/http-logger.js';
import { createHealthRouter } from './routes/health.js';
import { createUserRouter } from './users/routes.js';
import type { UserService } from './users/service.js';
import { createMessageRouters } from './messages/routes.js';
import type { MessageService } from './messages/service.js';
import { mountSwagger } from './swagger.js';

export type AppDependencies = Readonly<{
  auth?: AuthService;
  conversations?: ConversationService;
  config: ApiConfig;
  logger: Logger;
  messages?: MessageService;
  readiness: ReadinessProbe;
  users?: UserService;
}>;

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.config.trustProxy);
  app.use(createHttpLogger(dependencies.logger));
  app.use(helmet());
  app.use(createCorsMiddleware(dependencies.config.corsAllowedOrigins));
  app.use(
    express.json({
      limit: dependencies.config.bodyLimit,
      strict: true,
      type: ['application/json', 'application/*+json'],
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: dependencies.config.bodyLimit }));

  app.use('/v1/health', createHealthRouter(dependencies.readiness));
  if (dependencies.auth)
    app.use('/v1/auth', createAuthRouter(dependencies.auth, dependencies.config));
  if (dependencies.auth && dependencies.users)
    app.use('/v1/users', createUserRouter(dependencies.auth, dependencies.users));
  if (dependencies.auth && dependencies.conversations)
    app.use(
      '/v1/conversations',
      createConversationRouter(dependencies.auth, dependencies.conversations),
    );
  if (dependencies.auth && dependencies.messages) {
    const messageRouters = createMessageRouters(dependencies.auth, dependencies.messages);
    app.use('/v1/conversations/:conversationId/messages', messageRouters.conversationMessages);
    app.use('/v1/conversations/:conversationId/changes', messageRouters.conversationChanges);
    app.use('/v1/conversations/:conversationId/receipts', messageRouters.conversationReceipts);
    app.use('/v1/messages', messageRouters.messages);
  }
  mountSwagger(app, dependencies.config.nodeEnv, dependencies.config);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
