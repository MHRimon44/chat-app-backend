# REST API Contract

Base path: `/v1`. JSON request/response bodies use camelCase. All authenticated routes require `Authorization: Bearer <access-token>`. List limits default to 30 and are capped at 100 unless a stricter endpoint cap is documented.

## Common envelopes

Success uses the meaningful resource under `data`, optionally with `page: { nextCursor, hasMore }`. Errors use `error: { code, message, requestId, fields? }`. Production messages are safe and do not include stacks or secrets.

Conditional writes may accept an idempotency key where specified. All dates are ISO-8601 UTC strings. Cursors are opaque.

## Authentication

| Method | Path                        | Auth                           | Purpose                                        |
| ------ | --------------------------- | ------------------------------ | ---------------------------------------------- |
| POST   | `/auth/register`            | No                             | Register and create initial session            |
| POST   | `/auth/login`               | No                             | Authenticate and create session                |
| POST   | `/auth/refresh`             | Refresh credential             | Atomically rotate refresh token and issue pair |
| POST   | `/auth/logout`              | Access + refresh/session proof | Revoke current session                         |
| POST   | `/auth/logout-all`          | Yes                            | Revoke all user sessions                       |
| GET    | `/auth/sessions`            | Yes                            | List sanitized active device sessions          |
| DELETE | `/auth/sessions/:sessionId` | Yes                            | Revoke an owned session                        |
| POST   | `/auth/password/forgot`     | No                             | Send generic recovery response                 |
| POST   | `/auth/password/reset`      | No                             | Consume reset token and revoke sessions        |

Registration input: `displayName`, `email`, `password`. Login input: `email`, `password`, plus bounded device metadata. Token responses contain `accessToken`, `accessTokenExpiresAt`, `refreshToken`, and sanitized `user`; the refresh token is placed directly into secure mobile storage.

## Users

| Method | Path                              | Purpose                                 |
| ------ | --------------------------------- | --------------------------------------- |
| GET    | `/users/me`                       | Current profile and settings            |
| PATCH  | `/users/me`                       | Update validated profile/privacy fields |
| POST   | `/users/me/avatar/upload-intent`  | Obtain constrained avatar upload intent |
| DELETE | `/users/me/avatar`                | Remove owned avatar                     |
| GET    | `/users/search?q=&cursor=&limit=` | Paginated safe user discovery           |
| GET    | `/users/:userId`                  | Safe public profile projection          |

Avatar completion may use a separate confirmation endpoint depending on the selected object-storage provider. Email is private unless an explicit future product rule says otherwise.

## Conversations

| Method | Path                                      | Purpose                                                         |
| ------ | ----------------------------------------- | --------------------------------------------------------------- |
| POST   | `/conversations/direct`                   | Idempotently create/get direct conversation; body `otherUserId` |
| GET    | `/conversations?cursor=&limit=`           | Paginated visible chat list                                     |
| GET    | `/conversations/:conversationId`          | Authorized details and current member state                     |
| POST   | `/conversations/:conversationId/hide`     | Hide/clear for current user according to policy                 |
| POST   | `/conversations/:conversationId/unhide`   | Restore current user visibility                                 |
| PATCH  | `/conversations/:conversationId/settings` | Mute/notification preferences                                   |
| POST   | `/conversations/:conversationId/read`     | Advance seen cursor monotonically                               |

No endpoint hard-deletes a shared direct conversation during normal user operation.

## Messages

| Method | Path                                                     | Purpose                                     |
| ------ | -------------------------------------------------------- | ------------------------------------------- |
| GET    | `/conversations/:conversationId/messages?before=&limit=` | Authorized older-message page               |
| GET    | `/conversations/:conversationId/changes?after=&limit=`   | Reconnect/foreground durable reconciliation |
| POST   | `/conversations/:conversationId/messages`                | REST fallback send with `clientMessageId`   |
| DELETE | `/messages/:messageId/me`                                | Delete only for authenticated user          |
| DELETE | `/messages/:messageId/everyone`                          | Authorized global tombstone within policy   |
| PUT    | `/messages/:messageId/reactions/:emoji`                  | Add idempotent supported reaction           |
| DELETE | `/messages/:messageId/reactions/:emoji`                  | Remove own reaction                         |

Send input: `clientMessageId` (UUID), `kind: text`, bounded `text`, optional `replyToMessageId`. The server ignores/rejects client sender identity. Responses include authoritative IDs/timestamps and sender-safe DTOs.

## Notification devices

| Method | Path                              | Purpose                                        |
| ------ | --------------------------------- | ---------------------------------------------- |
| PUT    | `/notification-devices/:deviceId` | Register/update owned FCM token and settings   |
| DELETE | `/notification-devices/:deviceId` | Disable owned device token                     |
| PATCH  | `/notification-preferences`       | Update preview/global notification preferences |

## Platform and operations

| Method | Path            | Purpose                                               |
| ------ | --------------- | ----------------------------------------------------- |
| GET    | `/health/live`  | Process liveness only                                 |
| GET    | `/health/ready` | Dependency readiness without secret details           |
| GET    | `/app-config`   | Safe minimum-version/feature configuration if adopted |

## Authorization and response rules

- Resource queries are scoped to the authenticated user; knowing an ID is never sufficient.
- For non-member private resources, prefer a consistent not-found response where it reduces enumeration.
- Invalid ObjectIds and cursors are validation errors, never database exceptions exposed to clients.
- Writes use appropriate `201`, `200`, or `204`; validation `400/422`; unauthenticated `401`; forbidden `403` only when safe; conflict/idempotency `409` as defined; limits `429` with bounded retry metadata.
- The final OpenAPI-compatible schema will be generated/maintained from shared Zod contracts during implementation.
