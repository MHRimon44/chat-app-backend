import type { Express, RequestHandler } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

type Schema = Record<string, unknown>;
const string: Schema = { type: 'string' };
const id: Schema = { type: 'string', pattern: '^[a-f0-9]{24}$' };
const email: Schema = { type: 'string', format: 'email', maxLength: 254 };
const password: Schema = { type: 'string', minLength: 12, maxLength: 128, format: 'password' };
const refreshToken: Schema = { type: 'string', minLength: 40, maxLength: 200 };
const date: Schema = { type: 'string', format: 'date-time' };
const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
});
const parameter = (name: string, schema: Schema, location = 'query', required = false): Schema => ({
  name,
  in: location,
  required: location === 'path' || required,
  schema,
});
const pathId = (name: string): Schema => parameter(name, id, 'path');
const limit = (maximum: number, defaultValue: number): Schema =>
  parameter('limit', { type: 'integer', minimum: 1, maximum, default: defaultValue });
const json = (schema: Schema): Schema => ({ 'application/json': { schema } });
const errorResponse: Schema = {
  description: 'Error envelope; see error.code, error.message, error.details and error.requestId.',
  content: json(
    object(
      {
        error: object(
          { code: string, message: string, requestId: string, details: { type: 'object' } },
          ['code', 'message', 'requestId'],
        ),
      },
      ['error'],
    ),
  ),
};

type Options = {
  public?: boolean;
  status?: number;
  body?: Schema;
  example?: Record<string, unknown>;
  parameters?: Schema[];
  description?: string;
  response?: Schema;
};
function operation(tag: string, summary: string, options: Options = {}): Schema {
  const status = options.status ?? 200;
  return {
    tags: [tag],
    summary,
    ...(options.description ? { description: options.description } : {}),
    security: options.public ? [] : [{ bearerAuth: [] }],
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: options.body,
                ...(options.example ? { example: options.example } : {}),
              },
            },
          },
        }
      : {}),
    responses: {
      [status]:
        status === 204
          ? { description: 'Successful operation; no response body.' }
          : {
              description:
                'Successful response. Result is in data; list responses also include page.',
              content: json(
                options.response ??
                  object(
                    {
                      data: {},
                      page: object({
                        nextCursor: { type: 'string', nullable: true },
                        hasMore: { type: 'boolean' },
                      }),
                    },
                    ['data'],
                  ),
              ),
            },
      '400': errorResponse,
      '401': errorResponse,
      '403': errorResponse,
      '404': errorResponse,
      '409': errorResponse,
      '413': errorResponse,
      '422': errorResponse,
      '429': errorResponse,
      '500': errorResponse,
      ...(tag === 'Health' ? { '503': errorResponse } : {}),
    },
  };
}

const tokenResponse = object(
  {
    data: object(
      {
        accessToken: string,
        accessTokenExpiresAt: date,
        refreshToken: string,
        user: object({ id, displayName: string, email }, ['id', 'displayName', 'email']),
      },
      ['accessToken', 'accessTokenExpiresAt', 'refreshToken', 'user'],
    ),
  },
  ['data'],
);
const device = object({
  deviceId: { type: 'string', minLength: 1, maxLength: 200 },
  deviceName: { type: 'string', minLength: 1, maxLength: 100 },
  platform: { type: 'string', enum: ['android', 'ios', 'unknown'], default: 'unknown' },
  appVersion: { type: 'string', minLength: 1, maxLength: 50 },
});
const conversationParams = [pathId('conversationId')];
const reactionParams = [
  pathId('messageId'),
  parameter('emoji', { type: 'string', enum: emojis }, 'path'),
];

/** Manually maintained request contracts, matched to this checkpoint's REST routers. */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Chat App - Local API',
    version: '1.0.0',
    description:
      'Local development only. Try it out executes REAL operations against your local database. Register or log in, copy data.accessToken, and paste ONLY that token into Authorize. Tokens are not persisted across reloads. Do not share token/password screenshots. Socket.IO events are not REST endpoints and are not covered here. Request schemas are manually maintained; generic response envelopes are intentionally not a complete generated DTO specification.',
  },
  servers: [{ url: '/v1', description: 'Same API origin as this documentation' }],
  tags: ['Health', 'Authentication', 'Users', 'Conversations', 'Messages'].map((name) => ({
    name,
  })),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token only. Do not paste a refresh token or add the Bearer prefix.',
      },
    },
  },
  paths: {
    '/health/live': { get: operation('Health', 'Liveness', { public: true }) },
    '/health/ready': {
      get: {
        ...operation('Health', 'MongoDB and Redis readiness', { public: true }),
        responses: {
          '200': {
            description: 'Dependencies are ready.',
            content: json(
              object({
                data: object({
                  status: { type: 'string', enum: ['ready'] },
                  timestamp: date,
                  checks: { type: 'object' },
                }),
              }),
            ),
          },
          '503': {
            description: 'Dependencies are not ready.',
            content: json(
              object({
                data: object({
                  status: { type: 'string', enum: ['not_ready'] },
                  timestamp: date,
                  checks: { type: 'object' },
                }),
              }),
            ),
          },
        },
      },
    },
    '/auth/register': {
      post: operation('Authentication', 'Register a new account', {
        public: true,
        status: 201,
        response: tokenResponse,
        body: object(
          { displayName: { type: 'string', minLength: 1, maxLength: 80 }, email, password, device },
          ['displayName', 'email', 'password'],
        ),
        example: {
          displayName: 'Swagger Test',
          email: 'swagger-test-01@example.com',
          password: 'LocalTestOnly!2026',
        },
        description:
          'Use disposable local credentials. Change the example email for each new account. Registration does not assign a username; use PATCH /users/me after authorization.',
      }),
    },
    '/auth/login': {
      post: operation('Authentication', 'Log in', {
        public: true,
        response: tokenResponse,
        body: object(
          {
            email,
            password: { type: 'string', minLength: 1, maxLength: 128, format: 'password' },
            device,
          },
          ['email', 'password'],
        ),
        example: { email: 'swagger-test-01@example.com', password: 'LocalTestOnly!2026' },
      }),
    },
    '/auth/refresh': {
      post: operation('Authentication', 'Rotate a refresh token', {
        public: true,
        body: object({ refreshToken }, ['refreshToken']),
        response: tokenResponse,
        description:
          'Consumes the current refresh token and returns a new pair. Reusing an old rotated token revokes the session family. Copy the new access token into Authorize manually.',
      }),
    },
    '/auth/logout': {
      post: operation('Authentication', 'Revoke current session', { status: 204 }),
    },
    '/auth/logout-all': {
      post: operation('Authentication', 'Revoke ALL your sessions', {
        status: 204,
        description: 'Also logs out your mobile clients. This changes real local session data.',
      }),
    },
    '/auth/sessions': { get: operation('Authentication', 'List your active sessions') },
    '/auth/sessions/{sessionId}': {
      delete: operation('Authentication', 'Revoke selected session', {
        status: 204,
        parameters: [pathId('sessionId')],
      }),
    },
    '/auth/password/forgot': {
      post: operation('Authentication', 'Request password recovery', {
        public: true,
        body: object({ email }, ['email']),
        example: { email: 'swagger-test-01@example.com' },
        description:
          'Generic response regardless of account existence. For an existing local account, inspect Mailpit at http://localhost:8025. The default localhost:3000 reset webpage is not implemented.',
      }),
    },
    '/auth/password/reset': {
      post: operation('Authentication', 'Consume a reset token', {
        public: true,
        status: 204,
        body: object({ token: refreshToken, password }, ['token', 'password']),
        description:
          'Paste only the token query parameter from the local Mailpit recovery email. Single-use and expiring. Success revokes all account sessions.',
      }),
    },
    '/users/me': {
      get: operation('Users', 'Get your profile'),
      patch: operation('Users', 'Update profile / assign a searchable username', {
        body: {
          ...object({
            username: { type: 'string', pattern: '^[a-zA-Z0-9_]{3,30}$' },
            displayName: { type: 'string', minLength: 1, maxLength: 80 },
            bio: { type: 'string', maxLength: 160 },
            presenceVisibility: { type: 'string', enum: ['everyone', 'contacts', 'nobody'] },
          }),
          minProperties: 1,
        },
        example: { username: 'swagger_user_01', displayName: 'Swagger Test' },
      }),
    },
    '/users/search': {
      get: operation('Users', 'Search other users by username prefix', {
        parameters: [
          parameter('q', { type: 'string', pattern: '^[a-zA-Z0-9_]{2,30}$' }, 'query', true),
          parameter('cursor', id),
          limit(50, 30),
        ],
      }),
    },
    '/users/{userId}': {
      get: operation('Users', 'Get a public user profile', { parameters: [pathId('userId')] }),
    },
    '/conversations': {
      get: operation('Conversations', 'List your visible conversations', {
        parameters: [
          parameter('cursor', { type: 'string', minLength: 1, maxLength: 500 }),
          limit(50, 30),
        ],
      }),
    },
    '/conversations/direct': {
      post: operation('Conversations', 'Create or return a direct conversation', {
        status: 201,
        body: object({ otherUserId: id }, ['otherUserId']),
        description:
          'Use another registered account ID, not its username. The canonical conversation is returned when it already exists.',
      }),
    },
    '/conversations/{conversationId}': {
      get: operation('Conversations', 'Get a conversation you belong to', {
        parameters: conversationParams,
      }),
    },
    '/conversations/{conversationId}/hide': {
      post: operation('Conversations', 'Hide for your account', {
        status: 204,
        parameters: conversationParams,
      }),
    },
    '/conversations/{conversationId}/unhide': {
      post: operation('Conversations', 'Unhide for your account', {
        status: 204,
        parameters: conversationParams,
      }),
    },
    '/conversations/{conversationId}/settings': {
      patch: operation('Conversations', 'Update your conversation settings', {
        parameters: conversationParams,
        body: {
          ...object({
            notificationsEnabled: { type: 'boolean' },
            muteUntil: { ...date, nullable: true },
          }),
          minProperties: 1,
        },
        example: { notificationsEnabled: true, muteUntil: null },
      }),
    },
    '/conversations/{conversationId}/messages': {
      get: operation('Messages', 'Get message history', {
        parameters: [
          ...conversationParams,
          parameter('before', { type: 'string', minLength: 1, maxLength: 500 }),
          limit(100, 30),
        ],
      }),
      post: operation('Messages', 'Send a text message', {
        status: 201,
        parameters: conversationParams,
        body: object(
          {
            clientMessageId: { type: 'string', format: 'uuid' },
            kind: { type: 'string', enum: ['text'] },
            text: { type: 'string', minLength: 1, maxLength: 4000 },
            replyToMessageId: id,
          },
          ['clientMessageId', 'kind', 'text'],
        ),
        example: {
          clientMessageId: '70cad6ed-a4e4-4f8e-a5be-6beb69e1d1c4',
          kind: 'text',
          text: 'Hello from Swagger',
        },
        description:
          'Use a NEW UUID for a new message; reuse the same UUID only when retrying the same send. Repeated Execute with the example UUID is idempotent, not a new message.',
      }),
    },
    '/conversations/{conversationId}/changes': {
      get: operation('Messages', 'Get durable changes for reconnect', {
        parameters: [...conversationParams, parameter('after', id), limit(100, 100)],
      }),
    },
    '/conversations/{conversationId}/receipts': {
      post: operation('Messages', 'Advance delivered or seen cursor', {
        parameters: conversationParams,
        body: object({ messageId: id, type: { type: 'string', enum: ['delivered', 'seen'] } }, [
          'messageId',
          'type',
        ]),
      }),
    },
    '/messages/{messageId}/me': {
      delete: operation('Messages', 'Delete a message for yourself', {
        status: 204,
        parameters: [pathId('messageId')],
      }),
    },
    '/messages/{messageId}/everyone': {
      delete: operation('Messages', 'Delete your message for everyone', {
        parameters: [pathId('messageId')],
        description:
          'Subject to ownership and the server deletion window. This changes message content for other participants.',
      }),
    },
    '/messages/{messageId}/reactions/{emoji}': {
      put: operation('Messages', 'Add a reaction', { parameters: reactionParams }),
      delete: operation('Messages', 'Remove your reaction', { parameters: reactionParams }),
    },
  },
};

const loopbackOnly: RequestHandler = (request, response, next) => {
  // Check the actual peer, not proxy headers or the caller-controlled Host header.
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
    response.sendStatus(404);
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  next();
};

/** Call after common middleware and BEFORE notFoundHandler. Disabled outside development. */
export function mountSwagger(app: Express, nodeEnv: string): void {
  if (nodeEnv !== 'development') return;
  app.get('/openapi.json', loopbackOnly, (_request, response) => {
    response.json(openApiDocument);
  });
  app.use(
    '/docs',
    loopbackOnly,
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: false,
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Chat App - Local Swagger',
      swaggerOptions: {
        validatorUrl: null,
        persistAuthorization: false,
        docExpansion: 'list',
        displayRequestDuration: true,
      },
    }),
  );
}
