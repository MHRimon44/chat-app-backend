# Security and Data Protection Strategy

## Authentication

- Access JWT: asymmetric signing preferred, 10-minute lifetime, explicit issuer/audience/algorithm, `sub`, session ID, unique token ID, and minimal claims.
- Refresh token: opaque 256-bit random secret, rotated on every successful refresh, stored hashed in `sessions`, and returned only over TLS.
- Mobile: refresh credential in Keychain/Keystore via React Native Keychain; access token in memory. Never persist either token in AsyncStorage, logs, analytics, crash reports, URLs, or Redux debugging tools.
- Refresh is atomic. Reuse of a rotated token revokes its family (or all user sessions under a documented conservative policy), records a safe security event, and forces reauthentication.
- Logout revokes the session. Logout-all and password reset revoke all sessions. Sensitive profile changes may require recent authentication.

## Passwords and recovery

- Argon2id is selected. The initial baseline is 19,456 KiB memory, two iterations, one lane, and a 32-byte output; it averaged 24 ms across five hashes in the development container. Recalibrate on production hardware before launch.
- Password policy: minimum 12 characters, allow long passphrases (at least 64 characters), no silent truncation, block common/known-compromised passwords where a privacy-safe service is available, and do not impose composition rules.
- Forgot-password always returns the same status/body class and comparable timing. Email work is queued.
- Reset token: at least 256 bits, hash at rest, single use, 15-minute expiry, bound to purpose/user, and consumed atomically.
- Reset links use an approved HTTPS universal/app link. Tokens are removed from navigation state/history as soon as consumed.

## Authorization

- Default deny. Every REST query and Socket.IO command derives the actor from verified auth.
- Conversation membership is checked for every conversation/message read or write, including reply targets, reactions, receipts, deletion, socket join, and notification deep links.
- Sender identity is never accepted from request data.
- Repository methods prefer actor-scoped queries to reduce IDOR mistakes. Services re-check policy for destructive actions.
- Delete-for-everyone requires sender ownership, active membership, and a 15-minute default time window. Delete-for-me only changes the actor’s state.

## Input and transport protection

- Zod validates headers, params, queries, bodies, socket payloads, environment, and external-provider callbacks.
- JSON and socket payload size limits; bounded strings, pagination, arrays, avatar MIME/size/dimensions, and supported emoji.
- TLS only in production; secure headers with Helmet-equivalent policy; explicit production CORS allowlist. Native apps do not rely on CORS as an authentication control.
- Database/Redis are not public, require authenticated encrypted connections, and use least-privilege service accounts.
- Request timeouts, graceful cancellation where possible, and safe parsing prevent resource exhaustion.

## Abuse prevention

Use Redis-backed limits shared across replicas. Exact thresholds will be load-tested and environment-configurable. Initial policy targets:

- Login: 5 failed attempts per account+IP per 15 minutes, progressive backoff, plus broader IP/device limits.
- Registration: 5 per IP per hour with abuse monitoring.
- Forgot password: 3 per normalized account and 5 per IP per hour while always returning a generic response.
- Refresh: 30 per session per 15 minutes.
- User search: 60 per user per minute.
- Message send: token bucket around 30 per 10 seconds and 300 per 10 minutes per user, plus conversation limits.
- Typing: coalesced to roughly 1 update/second with short TTL.
- Connection attempts and invalid socket events: bounded by IP/user with disconnect on sustained abuse.

Limits must not store plaintext emails unnecessarily; use keyed hashes for sensitive limit keys. A `429` includes safe retry guidance.

## Secrets, logging, and privacy

- Only placeholder `.env.example` files are committed. Production secrets live in the deployment secret manager; signing keys and service credentials stay in protected CI/platform stores.
- Structured logs redact authorization/cookie headers, passwords, tokens, email bodies, push tokens, and message text. Stable request IDs support investigations.
- Error responses never expose stacks, database errors, internal paths, secrets, or account existence.
- Collect only required device/IP metadata, truncate or hash where practical, restrict operator access, and define retention/deletion schedules.
- Message notification previews follow user privacy settings. Analytics must not capture message content.
- Dependencies, images, and CI undergo lockfile review, vulnerability/secret scanning, and supported-version maintenance.

## Data protection and operations

- Encryption in transit and provider-managed encryption at rest; application-level encryption considered for push tokens and especially sensitive provider credentials.
- Encrypted backups with restricted access, documented recovery objectives, restore drills, and audited deletion/retention behavior.
- Separate development/staging/production data and credentials. Never copy production user content into development.
- Incident runbook covers token/key compromise, refresh reuse, database exposure, provider-token leak, and forced session revocation.

## Deferred security decision

End-to-end encryption is explicitly out of scope. The service can access plaintext messages to deliver current features. This must be disclosed accurately; transport/database encryption must never be described as E2EE.
